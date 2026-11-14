import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db";
import { draftRecommendations, heroes, heroRelationships } from "@/db/schema";
import {
  handleCreateDraftSession,
  handlePatchDraftSlots,
} from "@/lib/draft-session/handlers";
import {
  handleGenerateCandidatePicks,
  type JevClient,
} from "@/lib/recommendations/candidate-pick";

describe("Candidate Pick recommendation engine", () => {
  it("excludes banned/picked heroes, filters by Target Ally Slot role, ranks top 3 by compositeScore, and persists to draft_recommendations", async () => {
    const db = createDatabase(":memory:");
    const allHeroes = db.select().from(heroes).all();

    // Find Gold-lane heroes and at least one non-Gold hero
    const goldHeroes = allHeroes.filter((h) => h.lanes.includes("Gold"));
    const nonGoldHeroes = allHeroes.filter((h) => !h.lanes.includes("Gold"));
    expect(goldHeroes.length).toBeGreaterThanOrEqual(5);
    expect(nonGoldHeroes.length).toBeGreaterThanOrEqual(1);

    const bannedGoldHero = goldHeroes[0];
    const pickedAllyHero = nonGoldHeroes[0];
    const pickedEnemyHero = goldHeroes[1];
    const candidateGoldA = goldHeroes[2];
    const candidateGoldB = goldHeroes[3];
    const candidateGoldC = goldHeroes[4];

    // Ensure at least one mythic_plus relationship exists connecting a candidate to a picked hero
    db.insert(heroRelationships)
      .values({
        source_hero_id: candidateGoldB.id,
        target_hero_id: pickedEnemyHero.id,
        relation_type: "counter",
        win_rate_delta: 3.4,
        rank_tier: "mythic_plus",
        explanation: "Test mythic_plus counter edge",
      })
      .onConflictDoNothing()
      .run();

    // Create a Draft Session
    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", { method: "POST" }),
      db,
    );
    expect(createRes.status).toBe(201);
    const { session } = await createRes.json();

    // Ban bannedGoldHero, pick pickedAllyHero in ally-1, pick pickedEnemyHero in enemy-1, set ally-2 role = Gold
    const patchRes = await handlePatchDraftSlots(
      new Request(`http://localhost/api/draft-sessions/${session.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            { team: "ally", slot_index: 1, banned_hero_id: bannedGoldHero.id, picked_hero_id: pickedAllyHero.id },
            { team: "ally", slot_index: 2, role: "Gold" },
            { team: "enemy", slot_index: 1, picked_hero_id: pickedEnemyHero.id },
          ],
        }),
      }),
      String(session.id),
      db,
    );
    expect(patchRes.status).toBe(200);

    let capturedRequest: {
      model?: string;
      state: unknown;
      questions: Record<string, unknown>;
    } | null = null;

    const stubJevClient: JevClient = {
      async systemOne(req) {
        capturedRequest = {
          model: req.model,
          state: req.state,
          questions: req.questions,
        };

        const questionKeys = Object.keys(req.questions);
        const synergyKeys = questionKeys.filter((k) => k.startsWith("synergy_"));
        const slugs = synergyKeys.map((k) => k.slice("synergy_".length));

        const probabilities: Record<string, number> = {};
        for (const slug of slugs) {
          probabilities[slug] = 0.01;
        }
        // Assign deterministic choice probabilities:
        // candidateGoldA: choiceProb=0.60, synergy=2/4(0.50), counter=2/4(0.50), patch=2/4(0.50) => 0.40*0.60 + 0.25*0.50 + 0.25*0.50 + 0.10*0.50 = 0.54
        // candidateGoldB: choiceProb=0.30, synergy=4/4(1.00), counter=4/4(1.00), patch=4/4(1.00) => 0.40*0.30 + 0.25*1.00 + 0.25*1.00 + 0.10*1.00 = 0.72 (RANK #1!)
        // candidateGoldC: choiceProb=0.50, synergy=3/4(0.75), counter=3/4(0.75), patch=3/4(0.75) => 0.40*0.50 + 0.25*0.75 + 0.25*0.75 + 0.10*0.75 = 0.65 (RANK #2!)
        probabilities[candidateGoldA.slug] = 0.6;
        probabilities[candidateGoldB.slug] = 0.3;
        probabilities[candidateGoldC.slug] = 0.5;

        const answers: Record<string, unknown> = {
          bestHeroPick: {
            choice: candidateGoldA.slug,
            probabilities,
            confidence: 0.85,
          },
        };

        const defaultLegend = ["0", "1", "2", "3", "4"];
        for (const slug of slugs) {
          let level = 0;
          if (slug === candidateGoldA.slug) level = 2;
          if (slug === candidateGoldB.slug) level = 4;
          if (slug === candidateGoldC.slug) level = 3;

          answers[`synergy_${slug}`] = {
            score: level,
            legend: defaultLegend,
            probabilities: [0, 0, 0, 0, 0],
            confidence: 0.9,
          };
          answers[`counter_${slug}`] = {
            score: level,
            legend: defaultLegend,
            probabilities: [0, 0, 0, 0, 0],
            confidence: 0.9,
          };
          answers[`patch_${slug}`] = {
            score: level,
            legend: defaultLegend,
            probabilities: [0, 0, 0, 0, 0],
            confidence: 0.9,
          };
        }

        return { answers } as never;
      },
    };

    const res = await handleGenerateCandidatePicks(
      new Request(`http://localhost/api/draft-sessions/${session.id}/candidate-picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_slot_index: 2 }),
      }),
      String(session.id),
      db,
      stubJevClient,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.session_id).toBe(session.id);
    expect(body.target_slot_index).toBe(2);
    expect(body.kind).toBe("candidate_pick");
    expect(typeof body.recommendation_id).toBe("number");
    expect(body.candidates).toHaveLength(3);

    // Verify ranking order: B (0.72) > C (0.65) > A (0.54)
    expect(body.candidates[0].slug).toBe(candidateGoldB.slug);
    expect(body.candidates[0].rank).toBe(1);
    expect(body.candidates[0].composite_score).toBe(0.72);

    expect(body.candidates[1].slug).toBe(candidateGoldC.slug);
    expect(body.candidates[1].rank).toBe(2);
    expect(body.candidates[1].composite_score).toBe(0.65);

    expect(body.candidates[2].slug).toBe(candidateGoldA.slug);
    expect(body.candidates[2].rank).toBe(3);
    expect(body.candidates[2].composite_score).toBe(0.54);

    // Verify single-pass systemOne call excluded banned/picked heroes & non-Gold heroes
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.model).toBe("jev-latest");
    const askedKeys = Object.keys(capturedRequest!.questions);
    expect(askedKeys).not.toContain(`synergy_${bannedGoldHero.slug}`);
    expect(askedKeys).not.toContain(`synergy_${pickedAllyHero.slug}`);
    expect(askedKeys).not.toContain(`synergy_${pickedEnemyHero.slug}`);
    expect(askedKeys).not.toContain(`synergy_${nonGoldHeroes[0].slug}`);

    // Verify persistence in draft_recommendations
    const persisted = db
      .select()
      .from(draftRecommendations)
      .where(eq(draftRecommendations.id, body.recommendation_id))
      .get();
    expect(persisted).toBeDefined();
    expect(persisted!.session_id).toBe(session.id);
    expect(persisted!.target_slot_index).toBe(2);
    expect(persisted!.kind).toBe("candidate_pick");
    const parsedPayload = JSON.parse(persisted!.payload_json);
    expect(parsedPayload.candidates).toHaveLength(3);
    expect(parsedPayload.candidates[0].slug).toBe(candidateGoldB.slug);
  });

  it("falls back to all available heroes when no available hero matches Target Ally Slot role, and filters mythic_plus relationships to eligible-vs-picked edges", async () => {
    const db = createDatabase(":memory:", { autoSeed: false });

    // Seed minimal Patch KB with 1 Roam hero (who will be banned) and 3 EXP heroes
    db.insert(heroes)
      .values([
        {
          id: 1,
          slug: "tigreal",
          name: "Tigreal",
          roles: ["Tank"],
          lanes: ["Roam"],
          damage_type: "physical",
          specialty: ["Crowd Control"],
          win_rate: 51.2,
          ban_rate: 5.0,
          pick_rate: 12.0,
          recent_patch_summary: "Solid setter tank",
        },
        {
          id: 2,
          slug: "yu-zhong",
          name: "Yu Zhong",
          roles: ["Fighter"],
          lanes: ["EXP"],
          damage_type: "physical",
          specialty: ["Regen"],
          win_rate: 52.5,
          ban_rate: 10.0,
          pick_rate: 8.0,
          recent_patch_summary: "Strong lane bully",
        },
        {
          id: 3,
          slug: "arlott",
          name: "Arlott",
          roles: ["Fighter"],
          lanes: ["EXP"],
          damage_type: "physical",
          specialty: ["Charge"],
          win_rate: 53.1,
          ban_rate: 15.0,
          pick_rate: 9.0,
          recent_patch_summary: "High burst dash fighter",
        },
        {
          id: 4,
          slug: "dyrroth",
          name: "Dyrroth",
          roles: ["Fighter"],
          lanes: ["EXP"],
          damage_type: "physical",
          specialty: ["Burst"],
          win_rate: 50.4,
          ban_rate: 4.0,
          pick_rate: 11.0,
          recent_patch_summary: "Armor shredder",
        },
        {
          id: 5,
          slug: "benedetta",
          name: "Benedetta",
          roles: ["Assassin"],
          lanes: ["EXP"],
          damage_type: "physical",
          specialty: ["Mobility"],
          win_rate: 51.8,
          ban_rate: 6.0,
          pick_rate: 7.0,
          recent_patch_summary: "Fast split pusher",
        },
      ])
      .run();

    db.insert(heroRelationships)
      .values([
        // Edge between eligible (arlott=3) and picked enemy (dyrroth=4) -> SHOULD be included
        {
          source_hero_id: 3,
          target_hero_id: 4,
          relation_type: "counter",
          win_rate_delta: 2.5,
          rank_tier: "mythic_plus",
          explanation: "Arlott out-trades Dyrroth",
        },
        // Edge between two unpicked eligible heroes (yu-zhong=2 and benedetta=5) -> SHOULD NOT be included
        {
          source_hero_id: 2,
          target_hero_id: 5,
          relation_type: "synergy",
          win_rate_delta: 1.1,
          rank_tier: "mythic_plus",
          explanation: "Unpicked-to-unpicked edge",
        },
      ])
      .run();

    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", { method: "POST" }),
      db,
    );
    const { session } = await createRes.json();

    // Ban the only Roam hero (1), pick enemy Dyrroth (4), set Ally 1 role = Roam
    await handlePatchDraftSlots(
      new Request(`http://localhost/api/draft-sessions/${session.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [
            { team: "ally", slot_index: 1, role: "Roam", banned_hero_id: 1 },
            { team: "enemy", slot_index: 1, picked_hero_id: 4 },
          ],
        }),
      }),
      String(session.id),
      db,
    );

    let capturedState: {
      mythic_plus_relationships: Array<{ source: string; target: string }>;
      eligible_heroes: Array<{ slug: string }>;
    } | null = null;

    const stubJevClient: JevClient = {
      async systemOne(req) {
        capturedState = req.state as typeof capturedState;
        const slugs = Object.keys(req.questions)
          .filter((k) => k.startsWith("synergy_"))
          .map((k) => k.slice("synergy_".length));

        const probabilities: Record<string, number> = {};
        for (const s of slugs) probabilities[s] = 0.25;
        probabilities["arlott"] = 0.7;

        const answers: Record<string, unknown> = {
          bestHeroPick: { choice: "arlott", probabilities, confidence: 0.9 },
        };
        const legend = ["0", "1", "2", "3", "4"];
        for (const s of slugs) {
          const level = s === "arlott" ? 4 : 2;
          answers[`synergy_${s}`] = { score: level, legend, probabilities: [], confidence: 0.9 };
          answers[`counter_${s}`] = { score: level, legend, probabilities: [], confidence: 0.9 };
          answers[`patch_${s}`] = { score: level, legend, probabilities: [], confidence: 0.9 };
        }
        return { answers } as never;
      },
    };

    // Omit body to verify default active_target_slot_index (1) is used
    const res = await handleGenerateCandidatePicks(
      new Request(`http://localhost/api/draft-sessions/${session.id}/candidate-picks`, {
        method: "POST",
      }),
      String(session.id),
      db,
      stubJevClient,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target_slot_index).toBe(1);
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates[0].slug).toBe("arlott");

    // Graceful fallback: 3 EXP heroes (2, 3, 5) are eligible even though role=Roam
    expect(capturedState).not.toBeNull();
    expect(capturedState!.eligible_heroes.map((h) => h.slug).sort()).toEqual([
      "arlott",
      "benedetta",
      "yu-zhong",
    ]);

    // Only eligible-vs-picked mythic_plus edge is included
    expect(capturedState!.mythic_plus_relationships).toHaveLength(1);
    expect(capturedState!.mythic_plus_relationships[0].source).toBe("arlott");
    expect(capturedState!.mythic_plus_relationships[0].target).toBe("dyrroth");

    // 404 for missing session
    const missingRes = await handleGenerateCandidatePicks(
      new Request("http://localhost/api/draft-sessions/99999/candidate-picks", {
        method: "POST",
      }),
      "99999",
      db,
      stubJevClient,
    );
    expect(missingRes.status).toBe(404);

    // 400 for invalid target_slot_index
    const invalidSlotRes = await handleGenerateCandidatePicks(
      new Request(`http://localhost/api/draft-sessions/${session.id}/candidate-picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_slot_index: 9 }),
      }),
      String(session.id),
      db,
      stubJevClient,
    );
    expect(invalidSlotRes.status).toBe(400);
  });
});
