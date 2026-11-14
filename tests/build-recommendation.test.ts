import { describe, expect, it } from "bun:test";
import { eq, and } from "drizzle-orm";
import type {
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import { createDatabase } from "@/db";
import { draftRecommendations, heroes } from "@/db/schema";
import {
  handleCreateDraftSession,
  handlePatchDraftSession,
  handlePatchDraftSlots,
} from "@/lib/draft-session/handlers";
import {
  handleGetBuildRecommendation,
  handlePostBuildRecommendation,
  type JevClientLike,
} from "@/lib/recommendations/build-recommendation";

function setupFullDraft(db: ReturnType<typeof createDatabase>) {
  const allHeroes = db.select().from(heroes).all();
  if (allHeroes.length < 10) {
    throw new Error("Expected at least 10 seeded heroes");
  }
  return allHeroes.slice(0, 10);
}

async function createLockedSession(db: ReturnType<typeof createDatabase>) {
  const tenHeroes = setupFullDraft(db);
  const createRes = await handleCreateDraftSession(
    new Request("http://localhost/api/draft-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ my_slot_index: 1, active_target_slot_index: 1 }),
    }),
    db,
  );
  const created = await createRes.json();
  const sessionId = created.session.id as number;

  const allyRoles = ["Gold", "Roam", "Jungle", "Mid", "EXP"] as const;
  const enemyRoles = ["Gold", "Roam", "Jungle", "Mid", "EXP"] as const;

  const updates = [
    ...allyRoles.map((role, idx) => ({
      team: "ally" as const,
      slot_index: idx + 1,
      role,
      picked_hero_id: tenHeroes[idx]!.id,
    })),
    ...enemyRoles.map((role, idx) => ({
      team: "enemy" as const,
      slot_index: idx + 1,
      role,
      picked_hero_id: tenHeroes[idx + 5]!.id,
    })),
  ];

  const patchSlotsRes = await handlePatchDraftSlots(
    new Request(`http://localhost/api/draft-sessions/${sessionId}/slots`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    }),
    String(sessionId),
    db,
  );
  expect(patchSlotsRes.status).toBe(200);

  const lockRes = await handlePatchDraftSession(
    new Request(`http://localhost/api/draft-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lock_picks: true }),
    }),
    String(sessionId),
    db,
  );
  expect(lockRes.status).toBe(200);

  return { sessionId, tenHeroes };
}

describe("Build Recommendation API & Jev single-pass engine", () => {
  it("generates a 6-item build (1 Boots + 5 distinct non-boot tier-3 items core-first) in a single systemOne pass and persists it", async () => {
    const db = createDatabase(":memory:");
    const { sessionId, tenHeroes } = await createLockedSession(db);

    const capturedRequests: SystemOneRequest<Questions>[] = [];

    const stubJev: JevClientLike = {
      async systemOne<const Q extends Questions>(
        request: SystemOneRequest<Q>,
      ): Promise<SystemOneResult<Q>> {
        capturedRequests.push(request);
        const answers: Record<string, unknown> = {};

        for (const [key, q] of Object.entries(request.questions)) {
          if (q.type === "choice") {
            const labels = Object.keys(q.criteria);
            const preferredByKey: Record<string, string> = {
              battleSpell: "flicker",
              emblemSet: "marksman",
              boots: "swift-boots",
            };
            const chosen =
              preferredByKey[key] && labels.includes(preferredByKey[key]!)
                ? preferredByKey[key]!
                : labels[0]!;
            answers[key] = {
              type: "choice",
              choice: chosen,
              confidence: 0.9,
              probabilities: Object.fromEntries(
                labels.map((l) => [l, l === chosen ? 0.9 : 0.1 / Math.max(1, labels.length - 1)]),
              ),
            };
          } else if (q.type === "noul") {
            const probMap: Record<string, number> = {
              needsAntiHeal: 0.82,
              needsAntiShield: 0.2,
              needsMagicDefense: 0.71,
              needsPhysicalDefense: 0.35,
              needsPenetration: 0.64,
            };
            answers[key] = {
              type: "noul",
              noul: probMap[key] ?? 0.1,
            };
          } else if (q.type === "score") {
            const scoreMap: Record<string, number> = {
              "item_blade-of-despair": 2.9,
              "item_malefic-roar": 2.6,
              "item_sea-halberd": 1.4,
              "item_demon-hunter-sword": 2.4,
              "item_wind-of-nature": 1.2,
              "item_athenas-shield": 0.9,
            };
            const val = scoreMap[key] ?? 0.2;
            answers[key] = {
              type: "score",
              score: val,
              confidence: 0.85,
              legend: { "0": "Not needed", "1": "Situational", "2": "Strong core fit", "3": "Must-buy counter/core" },
              probabilities: [0.05, 0.15, 0.3, 0.5],
            };
          }
        }

        return {
          model: request.model ?? "jev-latest",
          answers: answers as SystemOneResult<Q>["answers"],
          usage: { input_tokens: 100, output_tokens: 20 },
        };
      },
    };

    const res = await handlePostBuildRecommendation(
      new Request(
        `http://localhost/api/draft-sessions/${sessionId}/build-recommendation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_slot_index: 1 }),
        },
      ),
      String(sessionId),
      db,
      stubJev,
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    // Single-pass systemOne invocation with model "jev-latest"
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]!.model).toBe("jev-latest");
    expect(capturedRequests[0]!.questions.bootBlessing).toBeUndefined();

    // 6-item build: 1 Boots + 5 distinct non-boot tier-3 items
    expect(body.items).toHaveLength(6);
    expect(body.items[0].slug).toBe("swift-boots");
    expect(body.items[0].tag).toBe("Boots");
    expect(body.items[0].blessing).toBeNull();

    const nonBootSlugs = body.items.slice(1).map((i: { slug: string }) => i.slug);
    expect(new Set(nonBootSlugs).size).toBe(5);
    expect(nonBootSlugs).toEqual([
      "blade-of-despair",
      "malefic-roar",
      "demon-hunter-sword",
      "sea-halberd",
      "wind-of-nature",
    ]);
    // Core-first, situational-last ordering
    expect(body.items[1].tag).toBe("Core");
    expect(body.items[2].tag).toBe("Core");
    expect(body.items[3].tag).toBe("Core");
    expect(body.items[4].tag).toBe("Situational");
    expect(body.items[5].tag).toBe("Situational");

    // Emblem + 3 talents + Battle Spell
    expect(body.emblem.slug).toBe("marksman");
    expect(typeof body.emblem.tier1.name).toBe("string");
    expect(typeof body.emblem.tier2.name).toBe("string");
    expect(typeof body.emblem.tier3.name).toBe("string");
    expect(body.battle_spell.slug).toBe("flicker");
    expect(body.hero.id).toBe(tenHeroes[0]!.id);

    // Situational flags surfaced
    expect(body.situational_flags.needsAntiHeal.triggered).toBe(true);
    expect(body.situational_flags.needsMagicDefense.triggered).toBe(true);
    expect(body.situational_flags.needsPenetration.triggered).toBe(true);
    expect(body.situational_flags.needsAntiShield.triggered).toBe(false);
    expect(body.situational_flags.needsPhysicalDefense.triggered).toBe(false);

    // Persisted in draft_recommendations
    const rows = db
      .select()
      .from(draftRecommendations)
      .where(
        and(
          eq(draftRecommendations.session_id, sessionId),
          eq(draftRecommendations.target_slot_index, 1),
          eq(draftRecommendations.kind, "build_recommendation"),
        ),
      )
      .all();
    expect(rows).toHaveLength(1);
    const persisted = JSON.parse(rows[0]!.payload_json);
    expect(persisted.items).toHaveLength(6);

    // Retrievable via GET
    const getRes = await handleGetBuildRecommendation(
      new Request(
        `http://localhost/api/draft-sessions/${sessionId}/build-recommendation?target_slot_index=1`,
      ),
      String(sessionId),
      db,
    );
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.items.map((i: { slug: string }) => i.slug)).toEqual(
      body.items.map((i: { slug: string }) => i.slug),
    );
  });

  it("incorporates Roam and Jungle boot blessings when Target Ally Slot role is Roam or Jungle", async () => {
    const db = createDatabase(":memory:");
    const { sessionId } = await createLockedSession(db);

    const makeStub = (
      preferredBlessing: string,
      preferredBoots: string,
      onCapture: (req: SystemOneRequest<Questions>) => void,
    ): JevClientLike => ({
      async systemOne<const Q extends Questions>(
        request: SystemOneRequest<Q>,
      ): Promise<SystemOneResult<Q>> {
        onCapture(request);
        const answers: Record<string, unknown> = {};
        for (const [key, q] of Object.entries(request.questions)) {
          if (q.type === "choice") {
            const labels = Object.keys(q.criteria);
            const chosen =
              key === "bootBlessing" && labels.includes(preferredBlessing)
                ? preferredBlessing
                : key === "boots" && labels.includes(preferredBoots)
                  ? preferredBoots
                  : labels[0]!;
            answers[key] = {
              type: "choice",
              choice: chosen,
              confidence: 0.9,
              probabilities: Object.fromEntries(labels.map((l) => [l, l === chosen ? 0.9 : 0.01])),
            };
          } else if (q.type === "noul") {
            answers[key] = { type: "noul", noul: 0.25 };
          } else if (q.type === "score") {
            answers[key] = {
              type: "score",
              score: 2.0,
              confidence: 0.8,
              legend: { "0": "Not needed", "1": "Situational", "2": "Strong core fit", "3": "Must-buy counter/core" },
              probabilities: [0.1, 0.2, 0.5, 0.2],
            };
          }
        }
        return {
          model: request.model ?? "jev-latest",
          answers: answers as SystemOneResult<Q>["answers"],
          usage: { input_tokens: 80, output_tokens: 15 },
        };
      },
    });

    // Roam slot (Ally 2)
    let roamReq: SystemOneRequest<Questions> | null = null;
    const roamRes = await handlePostBuildRecommendation(
      new Request(
        `http://localhost/api/draft-sessions/${sessionId}/build-recommendation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_slot_index: 2 }),
        },
      ),
      String(sessionId),
      db,
      makeStub("conceal", "tough-boots", (r) => {
        roamReq = r;
      }),
    );
    expect(roamRes.status).toBe(200);
    const roamBody = await roamRes.json();
    expect(roamReq).not.toBeNull();
    const roamBlessingQ = roamReq!.questions.bootBlessing;
    expect(roamBlessingQ?.type).toBe("choice");
    if (roamBlessingQ?.type === "choice") {
      expect(Object.keys(roamBlessingQ.criteria).sort()).toEqual([
        "conceal",
        "dire-hit",
        "encourage",
        "favor",
      ]);
    }
    expect(roamBody.items[0].slug).toBe("tough-boots");
    expect(roamBody.items[0].blessing.slug).toBe("conceal");
    expect(roamBody.items[0].blessing.category).toBe("Roaming");

    // Jungle slot (Ally 3)
    let jungleReq: SystemOneRequest<Questions> | null = null;
    const jungleRes = await handlePostBuildRecommendation(
      new Request(
        `http://localhost/api/draft-sessions/${sessionId}/build-recommendation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_slot_index: 3 }),
        },
      ),
      String(sessionId),
      db,
      makeStub("ice-retribution", "warrior-boots", (r) => {
        jungleReq = r;
      }),
    );
    expect(jungleRes.status).toBe(200);
    const jungleBody = await jungleRes.json();
    expect(jungleReq).not.toBeNull();
    const jungleBlessingQ = jungleReq!.questions.bootBlessing;
    expect(jungleBlessingQ?.type).toBe("choice");
    if (jungleBlessingQ?.type === "choice") {
      expect(Object.keys(jungleBlessingQ.criteria).sort()).toEqual([
        "bloody-retribution",
        "flame-retribution",
        "ice-retribution",
      ]);
    }
    expect(jungleBody.items[0].slug).toBe("warrior-boots");
    expect(jungleBody.items[0].blessing.slug).toBe("ice-retribution");
    expect(jungleBody.items[0].blessing.category).toBe("Jungling");
  });

  it("rejects unpicked Target Ally Slot (400) and missing Draft Session (404)", async () => {
    const db = createDatabase(":memory:");
    const createRes = await handleCreateDraftSession(
      new Request("http://localhost/api/draft-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      db,
    );
    const created = await createRes.json();

    const stubJev: JevClientLike = {
      async systemOne() {
        throw new Error("Should not be called when slot has no picked hero");
      },
    };

    const unpickedRes = await handlePostBuildRecommendation(
      new Request(
        `http://localhost/api/draft-sessions/${created.session.id}/build-recommendation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_slot_index: 1 }),
        },
      ),
      String(created.session.id),
      db,
      stubJev,
    );
    expect(unpickedRes.status).toBe(400);

    const missingRes = await handlePostBuildRecommendation(
      new Request("http://localhost/api/draft-sessions/99999/build-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_slot_index: 1 }),
      }),
      "99999",
      db,
      stubJev,
    );
    expect(missingRes.status).toBe(404);
  });
});
