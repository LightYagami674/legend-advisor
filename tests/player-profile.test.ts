import { describe, expect, test } from "bun:test";
import type { Questions, SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";
import { createDatabase } from "@/db";
import { heroes, postMatchReviews } from "@/db/schema";
import { createDraftSession, updateDraftSession, updateDraftSlots } from "@/lib/draft-session/service";
import {
  handleDeleteFailurePattern,
  handleDeleteHeroComfort,
  handleGetPlayerProfile,
  handlePatchFailurePattern,
  handlePostFailurePattern,
  handlePutPlayerProfile,
  handleUpsertHeroComfort,
  updatePreferredRoles,
  upsertHeroComfort,
  upsertOrReinforceFailurePattern,
} from "@/lib/player-profile/service";
import { generateBuildRecommendation } from "@/lib/recommendations/build-recommendation";
import { generateCandidatePicks, type JevClient } from "@/lib/recommendations/candidate-pick";

describe("Player Profile, Hero Comfort Pool, and Failure Patterns", () => {
  test("supports CRUD, factual occurrences reinforcement, and active/resolved lifecycle", async () => {
    const db = createDatabase(":memory:");
    const allHeroes = db.select().from(heroes).all();
    const layla = allHeroes.find((h) => h.slug === "layla") ?? allHeroes[0]!;
    const miya = allHeroes.find((h) => h.slug === "miya") ?? allHeroes[1]!;

    // 1. Initial GET lazily returns singleton profile with empty pools
    const initialRes = await handleGetPlayerProfile(db);
    expect(initialRes.status).toBe(200);
    const initialBody = (await initialRes.json()) as {
      profile: { id: number; preferred_roles: string[] };
      comfort_pool: unknown[];
      failure_patterns: unknown[];
    };
    expect(initialBody.profile.id).toBe(1);
    expect(initialBody.profile.preferred_roles).toEqual([]);
    expect(initialBody.comfort_pool).toEqual([]);
    expect(initialBody.failure_patterns).toEqual([]);

    // 2. Update preferred_roles
    const putProfileRes = await handlePutPlayerProfile(
      new Request("http://localhost/api/player-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_roles: ["Gold", "Mid"] }),
      }),
      db,
    );
    expect(putProfileRes.status).toBe(200);
    const updatedProfile = (await putProfileRes.json()) as {
      profile: { preferred_roles: string[] };
    };
    expect(updatedProfile.profile.preferred_roles).toEqual(["Gold", "Mid"]);

    // 3. Upsert & edit hero_comfort_pool
    const comfortRes = await handleUpsertHeroComfort(
      new Request("http://localhost/api/player-profile/comfort-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hero_id: layla.id,
          comfort_tier: "main",
          notes: "Position behind frontline before ulting",
          matches_played: 42,
          wins: 28,
        }),
      }),
      db,
    );
    expect(comfortRes.status).toBe(200);

    const avoidRes = await handleUpsertHeroComfort(
      new Request("http://localhost/api/player-profile/comfort-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hero_id: miya.id,
          comfort_tier: "avoid",
          notes: "Keep getting caught by dive assassins",
          matches_played: 8,
          wins: 2,
        }),
      }),
      db,
    );
    expect(avoidRes.status).toBe(200);

    // 4. Create & reinforce failure_patterns by pattern_key (with integer FK to post_match_reviews)
    const { session: reviewSession } = createDraftSession(db, {});
    const nowIso = new Date().toISOString();
    const review1 = db
      .insert(postMatchReviews)
      .values({
        draft_session_id: reviewSession.id,
        screenshot_path: "/tmp/review-1.png",
        status: "reviewed",
        created_at: nowIso,
        reviewed_at: nowIso,
      })
      .returning()
      .get();
    const review2 = db
      .insert(postMatchReviews)
      .values({
        draft_session_id: reviewSession.id,
        screenshot_path: "/tmp/review-2.png",
        status: "reviewed",
        created_at: nowIso,
        reviewed_at: nowIso,
      })
      .returning()
      .get();

    const createPatternRes = await handlePostFailurePattern(
      new Request("http://localhost/api/player-profile/failure-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimension: "action",
          pattern_key: "overextend-no-vision-gold",
          rule: "Do not push past river without enemy jungler visible on minimap",
          scope_type: "role",
          scope_value: "Gold",
          last_seen_review_id: review1.id,
        }),
      }),
      db,
    );
    expect(createPatternRes.status).toBe(201);
    const createdPattern = (await createPatternRes.json()) as {
      pattern: {
        id: number;
        occurrences: number;
        status: string;
        last_seen_review_id: number | null;
      };
    };
    expect(createdPattern.pattern.occurrences).toBe(1);
    expect(createdPattern.pattern.status).toBe("active");
    expect(createdPattern.pattern.last_seen_review_id).toBe(review1.id);

    // Reinforce same pattern_key -> occurrences increments to 2
    const reinforceRes = await handlePostFailurePattern(
      new Request("http://localhost/api/player-profile/failure-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimension: "action",
          pattern_key: "overextend-no-vision-gold",
          rule: "Do not push past river without enemy jungler visible on minimap",
          scope_type: "role",
          scope_value: "Gold",
          last_seen_review_id: review2.id,
        }),
      }),
      db,
    );
    expect(reinforceRes.status).toBe(200);
    const reinforced = (await reinforceRes.json()) as {
      pattern: {
        id: number;
        occurrences: number;
        last_seen_review_id: number | null;
      };
    };
    expect(reinforced.pattern.id).toBe(createdPattern.pattern.id);
    expect(reinforced.pattern.occurrences).toBe(2);
    expect(reinforced.pattern.last_seen_review_id).toBe(review2.id);

    // 5. Mark pattern resolved, verify preserved in history, then reopen
    const resolveRes = await handlePatchFailurePattern(
      new Request(
        `http://localhost/api/player-profile/failure-patterns/${createdPattern.pattern.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        },
      ),
      String(createdPattern.pattern.id),
      db,
    );
    expect(resolveRes.status).toBe(200);
    const resolvedJson = (await resolveRes.json()) as {
      pattern: { status: string; occurrences: number };
    };
    expect(resolvedJson.pattern.status).toBe("resolved");
    expect(resolvedJson.pattern.occurrences).toBe(2);

    // 6. Delete comfort entry & failure pattern
    const delComfortRes = await handleDeleteHeroComfort(String(miya.id), db);
    expect(delComfortRes.status).toBe(200);

    const delPatternRes = await handleDeleteFailurePattern(
      String(createdPattern.pattern.id),
      db,
    );
    expect(delPatternRes.status).toBe(200);

    const finalRes = await handleGetPlayerProfile(db);
    const finalBody = (await finalRes.json()) as {
      comfort_pool: Array<{ hero_id: number }>;
      failure_patterns: unknown[];
    };
    expect(finalBody.comfort_pool.map((c) => c.hero_id)).toEqual([layla.id]);
    expect(finalBody.failure_patterns).toEqual([]);
  });

  test("Candidate Pick injects Player Profile, excludes avoid heroes, evaluates profileSafe, and excludes resolved patterns strictly for My Slot", async () => {
    const db = createDatabase(":memory:");
    const { session } = createDraftSession(db);
    // My Slot = Ally 1 (Gold), Teammate = Ally 2 (Gold)
    updateDraftSession(db, session.id, { my_slot_index: 1, active_target_slot_index: 1 });
    updateDraftSlots(db, session.id, [
      { team: "ally", slot_index: 1, role: "Gold" },
      { team: "ally", slot_index: 2, role: "Gold" },
    ]);

    const allHeroes = db.select().from(heroes).all();
    const goldHeroes = allHeroes.filter((h) => h.lanes.includes("Gold"));
    const avoidedGold = goldHeroes[0]!;
    const mainGold = goldHeroes[1]!;

    updatePreferredRoles(db, ["Gold", "Mid"]);
    upsertHeroComfort(db, {
      hero_id: avoidedGold.id,
      comfort_tier: "avoid",
      notes: "Struggle with positioning",
    });
    upsertHeroComfort(db, {
      hero_id: mainGold.id,
      comfort_tier: "main",
      notes: "Strong late-game spacing",
    });

    // Active pick pattern, active synergy pattern, active survivability action pattern, active build pattern, and resolved pick pattern
    upsertOrReinforceFailurePattern(db, {
      dimension: "pick",
      pattern_key: "avoid-immobile-vs-dive",
      rule: "Avoid immobile marksmen into double-dive assassins",
      scope_type: "role",
      scope_value: "Gold",
    });
    upsertOrReinforceFailurePattern(db, {
      dimension: "synergy",
      pattern_key: "need-peel-for-gold",
      rule: "Pair late-game Gold carry with frontline peel",
      scope_type: "general",
    });
    upsertOrReinforceFailurePattern(db, {
      dimension: "action",
      pattern_key: "die-to-early-gank",
      rule: "Play safe under tower to survive level-4 jungle gank",
      scope_type: "role",
      scope_value: "Gold",
    });
    upsertOrReinforceFailurePattern(db, {
      dimension: "build",
      pattern_key: "delay-antiheal",
      rule: "Buy Sea Halberd second item against sustain",
      scope_type: "general",
    });
    const resolvedPick = upsertOrReinforceFailurePattern(db, {
      dimension: "pick",
      pattern_key: "resolved-pick-habit",
      rule: "Old resolved pick mistake",
      scope_type: "general",
    });
    await handlePatchFailurePattern(
      new Request(
        `http://localhost/api/player-profile/failure-patterns/${resolvedPick.pattern.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        },
      ),
      String(resolvedPick.pattern.id),
      db,
    );

    const capturedRequests: Array<SystemOneRequest<Questions>> = [];
    const stubJev: JevClient = {
      async systemOne<const Q extends Questions>(request: SystemOneRequest<Q>) {
        capturedRequests.push(request);
        const stateObj = request.state as {
          eligible_heroes: Array<{ slug: string }>;
        };
        const probs: Record<string, number> = {};
        const answers: Record<string, unknown> = {};
        for (const [idx, h] of stateObj.eligible_heroes.entries()) {
          probs[h.slug] = h.slug === mainGold.slug ? 0.5 : 0.1 / Math.max(1, idx + 1);
          answers[`synergy_${h.slug}`] = {
            score: 3,
            legend: ["anti-synergy", "weak", "neutral", "good", "strong"],
            probabilities: [0, 0, 0.1, 0.7, 0.2],
            confidence: 0.8,
          };
          answers[`counter_${h.slug}`] = {
            score: 3,
            legend: ["hard-countered", "disadvantaged", "even", "favorable", "hard-counter"],
            probabilities: [0, 0, 0.1, 0.7, 0.2],
            confidence: 0.8,
          };
          answers[`patch_${h.slug}`] = {
            score: 3,
            legend: ["weak-in-patch", "below-average", "balanced", "meta-strong", "top-meta"],
            probabilities: [0, 0, 0.1, 0.7, 0.2],
            confidence: 0.8,
          };
          if (`profileSafe_${h.slug}` in request.questions) {
            answers[`profileSafe_${h.slug}`] = {
              noul: h.slug === mainGold.slug ? 0.92 : 0.65,
            };
          }
        }
        answers.bestHeroPick = {
          choice: stateObj.eligible_heroes[0]!.slug,
          probabilities: probs,
          confidence: 0.85,
        };
        return { answers } as unknown as SystemOneResult<Q>;
      },
    };

    // A) My Slot (Ally 1)
    const mySlotRes = await generateCandidatePicks(db, stubJev, session.id, 1);
    expect(mySlotRes.ok).toBe(true);
    if (!mySlotRes.ok) return;

    const myReq = capturedRequests[0]!;
    const myState = myReq.state as Record<string, unknown>;
    const myEligibleSlugs = (
      myState.eligible_heroes as Array<{ slug: string }>
    ).map((h) => h.slug);

    // avoid-tier hero is hard-excluded
    expect(myEligibleSlugs).not.toContain(avoidedGold.slug);
    expect(myEligibleSlugs).toContain(mainGold.slug);

    // player_profile is injected with active pick/synergy/survivability-action patterns, NEVER resolved or build
    const injectedProfile = myState.player_profile as {
      preferred_roles: string[];
      hero_comfort_pool: Array<{ hero_slug: string; comfort_tier: string }>;
      failure_patterns: Array<{ pattern_key: string; status: string }>;
    };
    expect(injectedProfile).toBeDefined();
    expect(injectedProfile.preferred_roles).toEqual(["Gold", "Mid"]);
    const injectedKeys = injectedProfile.failure_patterns.map((p) => p.pattern_key);
    expect(injectedKeys).toContain("avoid-immobile-vs-dive");
    expect(injectedKeys).toContain("need-peel-for-gold");
    expect(injectedKeys).toContain("die-to-early-gank");
    expect(injectedKeys).not.toContain("delay-antiheal");
    expect(injectedKeys).not.toContain("resolved-pick-habit");

    // profileSafe_<slug> questions were evaluated and surfaced on CandidatePickItem
    expect(`profileSafe_${mainGold.slug}` in myReq.questions).toBe(true);
    expect(`profileSafe_${avoidedGold.slug}` in myReq.questions).toBe(false);
    expect(mySlotRes.data.candidates[0]?.profileSafe).toEqual({
      safe: true,
      probability: 0.92,
    });
    const topMyCandidate = mySlotRes.data.candidates[0]!;
    expect(topMyCandidate.composite_score).toBe(
      Math.round(
        (0.4 * topMyCandidate.choice_prob +
          0.25 * topMyCandidate.synergy_score +
          0.25 * topMyCandidate.counter_score +
          0.1 * topMyCandidate.patch_score) *
          10000,
      ) / 10000,
    );

    // B) Teammate Slot (Ally 2 !== My Slot 1) -> strict isolation
    const mateRes = await generateCandidatePicks(db, stubJev, session.id, 2);
    expect(mateRes.ok).toBe(true);
    if (!mateRes.ok) return;

    const mateReq = capturedRequests[1]!;
    const mateState = mateReq.state as Record<string, unknown>;
    const mateEligibleSlugs = (
      mateState.eligible_heroes as Array<{ slug: string }>
    ).map((h) => h.slug);

    // avoid-tier hero is NOT excluded for teammate
    expect(mateEligibleSlugs).toContain(avoidedGold.slug);
    // NO player_profile in state, NO profileSafe_ questions, NO profileSafe on cards
    expect("player_profile" in mateState).toBe(false);
    expect(
      Object.keys(mateReq.questions).some((k) => k.startsWith("profileSafe_")),
    ).toBe(false);
    for (const c of mateRes.data.candidates) {
      expect(c.profileSafe).toBeUndefined();
      expect("profileSafe" in c).toBe(false);
    }
  });

  test("Candidate Pick falls back to role-eligible heroes when all role-eligible heroes are avoid-tier for My Slot", async () => {
    const db = createDatabase(":memory:");
    const { session } = createDraftSession(db);
    updateDraftSession(db, session.id, { my_slot_index: 1, active_target_slot_index: 1 });
    updateDraftSlots(db, session.id, [{ team: "ally", slot_index: 1, role: "Gold" }]);

    const goldHeroes = db
      .select()
      .from(heroes)
      .all()
      .filter((h) => h.lanes.includes("Gold"));
    for (const h of goldHeroes) {
      upsertHeroComfort(db, { hero_id: h.id, comfort_tier: "avoid" });
    }

    const capturedEligible: string[] = [];
    const stubJev: JevClient = {
      async systemOne<const Q extends Questions>(request: SystemOneRequest<Q>) {
        const stateObj = request.state as {
          eligible_heroes: Array<{ slug: string }>;
        };
        capturedEligible.push(...stateObj.eligible_heroes.map((h) => h.slug));
        const probs: Record<string, number> = {};
        const answers: Record<string, unknown> = {};
        for (const h of stateObj.eligible_heroes) {
          probs[h.slug] = 1 / stateObj.eligible_heroes.length;
          answers[`synergy_${h.slug}`] = {
            score: 2,
            legend: ["anti-synergy", "weak", "neutral", "good", "strong"],
            probabilities: [0, 0, 1, 0, 0],
            confidence: 1,
          };
          answers[`counter_${h.slug}`] = {
            score: 2,
            legend: ["hard-countered", "disadvantaged", "even", "favorable", "hard-counter"],
            probabilities: [0, 0, 1, 0, 0],
            confidence: 1,
          };
          answers[`patch_${h.slug}`] = {
            score: 2,
            legend: ["weak-in-patch", "below-average", "balanced", "meta-strong", "top-meta"],
            probabilities: [0, 0, 1, 0, 0],
            confidence: 1,
          };
          answers[`profileSafe_${h.slug}`] = { noul: 0.4 };
        }
        answers.bestHeroPick = {
          choice: stateObj.eligible_heroes[0]!.slug,
          probabilities: probs,
          confidence: 0.5,
        };
        return { answers } as unknown as SystemOneResult<Q>;
      },
    };

    const res = await generateCandidatePicks(db, stubJev, session.id, 1);
    expect(res.ok).toBe(true);
    expect(capturedEligible.sort()).toEqual(goldHeroes.map((h) => h.slug).sort());
  });

  test("Build Recommendation injects comfort notes + active build patterns and surfaces static actionReminders strictly for My Slot", async () => {
    const db = createDatabase(":memory:");
    const { session } = createDraftSession(db);
    const allHeroes = db.select().from(heroes).all();
    const goldHeroes = allHeroes.filter((h) => h.lanes.includes("Gold"));
    const myHero = goldHeroes[0]!;
    const mateHero = goldHeroes[1]!;

    updateDraftSession(db, session.id, { my_slot_index: 1, active_target_slot_index: 1 });
    updateDraftSlots(db, session.id, [
      { team: "ally", slot_index: 1, role: "Gold", picked_hero_id: myHero.id },
      { team: "ally", slot_index: 2, role: "Gold", picked_hero_id: mateHero.id },
    ]);

    upsertHeroComfort(db, {
      hero_id: myHero.id,
      comfort_tier: "main",
      notes: "Prefer Purify over Flicker against heavy CC",
    });

    upsertOrReinforceFailurePattern(db, {
      dimension: "build",
      pattern_key: "buy-antiheal-early",
      rule: "Build Sea Halberd as 2nd core item against healing comps",
      scope_type: "role",
      scope_value: "Gold",
    });
    upsertOrReinforceFailurePattern(db, {
      dimension: "action",
      pattern_key: "check-minimap-before-push",
      rule: "Track enemy Roam and Jungle before crossing river",
      scope_type: "general",
    });
    const resolvedBuild = upsertOrReinforceFailurePattern(db, {
      dimension: "build",
      pattern_key: "resolved-build-habit",
      rule: "Old resolved build note",
      scope_type: "general",
    });
    const resolvedAction = upsertOrReinforceFailurePattern(db, {
      dimension: "action",
      pattern_key: "resolved-action-habit",
      rule: "Old resolved action note",
      scope_type: "general",
    });
    for (const p of [resolvedBuild.pattern.id, resolvedAction.pattern.id]) {
      await handlePatchFailurePattern(
        new Request(`http://localhost/api/player-profile/failure-patterns/${p}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        }),
        String(p),
        db,
      );
    }

    const capturedStates: Array<Record<string, unknown>> = [];
    const stubBuildJev: JevClient = {
      async systemOne<const Q extends Questions>(request: SystemOneRequest<Q>) {
        capturedStates.push(request.state as Record<string, unknown>);
        const answers: Record<string, unknown> = {};
        for (const [key, q] of Object.entries(request.questions)) {
          const question = q as { type?: string; criteria?: Record<string, unknown> };
          if (question.type === "choice" && question.criteria) {
            const firstKey = Object.keys(question.criteria)[0]!;
            answers[key] = {
              choice: firstKey,
              probabilities: { [firstKey]: 1 },
              confidence: 0.9,
            };
          } else if (question.type === "score") {
            answers[key] = {
              score: 2,
              legend: ["Not needed", "Situational", "Strong core fit", "Must-buy counter/core"],
              probabilities: [0, 0, 1, 0],
              confidence: 0.85,
            };
          } else if (question.type === "noul") {
            answers[key] = { noul: 0.25 };
          }
        }
        return { answers } as unknown as SystemOneResult<Q>;
      },
    };

    // A) My Slot (Ally 1)
    const myBuildRes = await generateBuildRecommendation(
      db,
      session.id,
      1,
      stubBuildJev,
    );
    expect(myBuildRes.ok).toBe(true);
    if (!myBuildRes.ok) return;

    const myState = capturedStates[0]!;
    const injectedProfile = myState.player_profile as {
      hero_comfort_note: { comfort_tier: string; notes: string } | null;
      build_failure_patterns: Array<{ pattern_key: string }>;
    };
    expect(injectedProfile).toBeDefined();
    expect(injectedProfile.hero_comfort_note).toEqual({
      comfort_tier: "main",
      notes: "Prefer Purify over Flicker against heavy CC",
    });
    expect(injectedProfile.build_failure_patterns.map((p) => p.pattern_key)).toEqual([
      "buy-antiheal-early",
    ]);

    // Static actionReminders strip from SQLite (only active, matching scope)
    expect(myBuildRes.data.actionReminders?.map((r) => r.pattern_key)).toEqual([
      "check-minimap-before-push",
    ]);

    // B) Teammate Slot (Ally 2 !== My Slot 1) -> strict isolation
    const mateBuildRes = await generateBuildRecommendation(
      db,
      session.id,
      2,
      stubBuildJev,
    );
    expect(mateBuildRes.ok).toBe(true);
    if (!mateBuildRes.ok) return;

    const mateState = capturedStates[1]!;
    expect("player_profile" in mateState).toBe(false);
    expect(mateBuildRes.data.actionReminders).toBeUndefined();
    expect("actionReminders" in mateBuildRes.data).toBe(false);
  });
});
