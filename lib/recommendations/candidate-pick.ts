import { choice, noul, score } from "@typesafe-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db";
import {
  draftRecommendations,
  heroRelationships,
  heroes,
  patchMeta,
} from "@/db/schema";
import { getDraftSessionById } from "@/lib/draft-session/service";
import { jsonResponse, parsePositiveIntId } from "@/lib/http/responses";
import type { FailurePatternDto } from "@/lib/player-profile/schema";
import {
  ensurePlayerProfile,
  listFailurePatterns,
  listHeroComfortPool,
} from "@/lib/player-profile/service";
import { getDefaultJevClient, type JevClient } from "./jev-client";
import type {
  CandidatePickItem,
  CandidatePickResponse,
} from "./types";

export { getDefaultJevClient, type JevClient };

const SYNERGY_RUBRIC = [
  "anti-synergy",
  "weak",
  "neutral",
  "good",
  "strong",
] as const;

const COUNTER_RUBRIC = [
  "hard-countered",
  "disadvantaged",
  "even",
  "favorable",
  "hard-counter",
] as const;

const PATCH_RUBRIC = [
  "weak-in-patch",
  "below-average",
  "balanced",
  "meta-strong",
  "top-meta",
] as const;

export const GenerateCandidatePicksInputSchema = z.object({
  target_slot_index: z.number().int().min(1).max(5).optional(),
});

const SURVIVABILITY_ACTION_RE =
  /\b(surviv|death|deaths|die|died|dying|overextend|position|positioning|gank|burst|cc|escape|kda|feed|feeding|retreat|bush|ambush|safe|tower|vision)\b/i;

function isSurvivabilityActionPattern(pattern: FailurePatternDto): boolean {
  return (
    SURVIVABILITY_ACTION_RE.test(pattern.rule) ||
    SURVIVABILITY_ACTION_RE.test(pattern.pattern_key)
  );
}

interface NoulAnswerShape {
  noul: number;
}
interface ChoiceAnswerShape {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

interface ScoreAnswerShape {
  score: number;
  legend: string[];
  probabilities: number[];
  confidence: number;
}

function normalizeScore(answer: ScoreAnswerShape | undefined): {
  value: number;
  label: string;
} {
  if (!answer || !Array.isArray(answer.legend) || answer.legend.length <= 1) {
    return { value: 0, label: "unknown" };
  }
  const maxIndex = answer.legend.length - 1;
  const clamped = Math.max(0, Math.min(maxIndex, answer.score));
  return {
    value: clamped / maxIndex,
    label: answer.legend[clamped] ?? String(clamped),
  };
}

function roundScore(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export type CandidatePickServiceResult =
  | { ok: true; data: CandidatePickResponse }
  | { ok: false; code: "not_found" | "bad_request" | "upstream_error"; message: string };

/**
 * Generates and persists a top-3 Candidate Pick ranking for a Target Ally Slot
 * using a single-pass TypeSafe Jev `systemOne` evaluation.
 */
export async function generateCandidatePicks(
  db: AppDatabase,
  jevClient: JevClient,
  sessionId: number,
  requestedSlotIndex?: number,
): Promise<CandidatePickServiceResult> {
  const sessionData = getDraftSessionById(db, sessionId);
  if (!sessionData) {
    return { ok: false, code: "not_found", message: "Draft session not found" };
  }

  const { session, slots } = sessionData;
  const targetSlotIndex = requestedSlotIndex ?? session.active_target_slot_index;
  const targetSlot = slots.find(
    (s) => s.team === "ally" && s.slot_index === targetSlotIndex,
  );
  if (!targetSlot) {
    return {
      ok: false,
      code: "bad_request",
      message: `Invalid Target Ally Slot index: ${targetSlotIndex}`,
    };
  }

  const meta = db.select().from(patchMeta).orderBy(desc(patchMeta.id)).limit(1).get();
  const allHeroes = db.select().from(heroes).all();
  const heroById = new Map(allHeroes.map((h) => [h.id, h]));

  const unavailableHeroIds = new Set<number>();
  for (const slot of slots) {
    if (slot.banned_hero_id !== null) unavailableHeroIds.add(slot.banned_hero_id);
    if (slot.picked_hero_id !== null) unavailableHeroIds.add(slot.picked_hero_id);
  }

  const availableHeroes = allHeroes.filter((h) => !unavailableHeroIds.has(h.id));
  if (availableHeroes.length === 0) {
    return {
      ok: false,
      code: "bad_request",
      message: "No eligible heroes remaining in the draft pool",
    };
  }

  const isMySlot = targetSlotIndex === session.my_slot_index;

  const roleFiltered = targetSlot.role
    ? availableHeroes.filter((h) => h.lanes.includes(targetSlot.role!))
    : availableHeroes;
  const roleEligible = roleFiltered.length > 0 ? roleFiltered : availableHeroes;

  const profileData = isMySlot
    ? {
        profile: ensurePlayerProfile(db),
        comfortPool: listHeroComfortPool(db),
        activePatterns: listFailurePatterns(db, "active"),
      }
    : null;

  let eligibleHeroes = roleEligible;
  if (profileData) {
    const avoidHeroIds = new Set(
      profileData.comfortPool
        .filter((c) => c.comfort_tier === "avoid")
        .map((c) => c.hero_id),
    );
    const nonAvoid = roleEligible.filter((h) => !avoidHeroIds.has(h.id));
    eligibleHeroes = nonAvoid.length > 0 ? nonAvoid : roleEligible;
  }

  const eligibleIds = new Set(eligibleHeroes.map((h) => h.id));

  const pickedAllyIds = new Set<number>();
  const pickedEnemyIds = new Set<number>();
  const allyPicks: Array<{ slot_index: number; role: string | null; hero: string }> = [];
  const enemyPicks: Array<{ slot_index: number; role: string | null; hero: string }> = [];
  const bannedHeroes: string[] = [];

  for (const slot of slots) {
    if (slot.banned_hero_id !== null) {
      const banned = heroById.get(slot.banned_hero_id);
      if (banned) bannedHeroes.push(banned.name);
    }
    if (slot.picked_hero_id !== null) {
      const picked = heroById.get(slot.picked_hero_id);
      if (picked) {
        if (slot.team === "ally") {
          pickedAllyIds.add(picked.id);
          allyPicks.push({
            slot_index: slot.slot_index,
            role: slot.role,
            hero: picked.name,
          });
        } else {
          pickedEnemyIds.add(picked.id);
          enemyPicks.push({
            slot_index: slot.slot_index,
            role: slot.role,
            hero: picked.name,
          });
        }
      }
    }
  }

  const pickedIds = new Set([...pickedAllyIds, ...pickedEnemyIds]);
  const mythicRelationships = db
    .select()
    .from(heroRelationships)
    .where(eq(heroRelationships.rank_tier, "mythic_plus"))
    .all()
    .filter(
      (rel) =>
        (eligibleIds.has(rel.source_hero_id) && pickedIds.has(rel.target_hero_id)) ||
        (pickedIds.has(rel.source_hero_id) && eligibleIds.has(rel.target_hero_id)),
    )
    .map((rel) => ({
      source: heroById.get(rel.source_hero_id)?.slug ?? String(rel.source_hero_id),
      target: heroById.get(rel.target_hero_id)?.slug ?? String(rel.target_hero_id),
      relation_type: rel.relation_type,
      win_rate_delta: rel.win_rate_delta,
      explanation: rel.explanation,
    }));

  const relevantPatterns = profileData
    ? profileData.activePatterns.filter(
        (p) =>
          p.dimension === "pick" ||
          p.dimension === "synergy" ||
          (p.dimension === "action" && isSurvivabilityActionPattern(p)),
      )
    : [];

  const state = {
    patch_version: meta?.patch_version ?? session.patch_version,
    rolled_up_meta_summary: meta?.rolled_up_meta_summary ?? "",
    target_ally_slot: {
      slot_index: targetSlotIndex,
      declared_role: targetSlot.role,
    },
    ally_picks: allyPicks,
    enemy_picks: enemyPicks,
    banned_heroes: bannedHeroes,
    mythic_plus_relationships: mythicRelationships,
    eligible_heroes: eligibleHeroes.map((h) => ({
      slug: h.slug,
      name: h.name,
      roles: h.roles,
      lanes: h.lanes,
      damage_type: h.damage_type,
      specialty: h.specialty,
      win_rate: h.win_rate,
      recent_patch_summary: h.recent_patch_summary,
    })),
    ...(profileData
      ? {
          player_profile: {
            preferred_roles: profileData.profile.preferred_roles,
            hero_comfort_pool: profileData.comfortPool.map((c) => ({
              hero_slug: c.hero_slug,
              hero_name: c.hero_name,
              comfort_tier: c.comfort_tier,
              notes: c.notes,
              matches_played: c.matches_played,
              wins: c.wins,
            })),
            failure_patterns: relevantPatterns.map((p) => ({
              dimension: p.dimension,
              pattern_key: p.pattern_key,
              rule: p.rule,
              scope_type: p.scope_type,
              scope_value: p.scope_value,
              occurrences: p.occurrences,
              status: p.status,
            })),
          },
        }
      : {}),
  };

  const heroCriteria: Record<string, string> = {};
  const questions: Record<
    string,
    ReturnType<typeof choice> | ReturnType<typeof score> | ReturnType<typeof noul>
  > = {};

  for (const hero of eligibleHeroes) {
    heroCriteria[hero.slug] =
      `${hero.name} (${hero.roles.join("/")}, ${hero.lanes.join("/")}, ${hero.damage_type}, WR ${hero.win_rate.toFixed(1)}%): ${hero.recent_patch_summary}`;
  }

  questions.bestHeroPick = choice(
    `Select the strongest Mobile Legends hero pick for Ally Slot ${targetSlotIndex} (${targetSlot.role ?? "Flexible role"}) considering ally synergy, enemy counters, and current patch meta.`,
    heroCriteria,
  );

  for (const hero of eligibleHeroes) {
    questions[`synergy_${hero.slug}`] = score(
      `Rate ${hero.name}'s team synergy with the already-picked ally heroes.`,
      [...SYNERGY_RUBRIC],
    );
    questions[`counter_${hero.slug}`] = score(
      `Rate ${hero.name}'s matchup/counter advantage against the already-picked enemy heroes.`,
      [...COUNTER_RUBRIC],
    );
    questions[`patch_${hero.slug}`] = score(
      `Rate ${hero.name}'s current patch strength in ${state.patch_version} based on win rate and patch summary.`,
      [...PATCH_RUBRIC],
    );
  }

  if (isMySlot) {
    const profileSafeTargets =
      eligibleHeroes.length <= 45
        ? eligibleHeroes
        : [...eligibleHeroes].sort((a, b) => b.win_rate - a.win_rate).slice(0, 30);

    for (const hero of profileSafeTargets) {
      questions[`profileSafe_${hero.slug}`] = noul(
        `Is ${hero.name} safe and well-suited for this player's Player Profile (preferred roles, hero comfort pool, and active pick/synergy/survivability failure patterns) against the current draft?`,
      );
    }
  }

  let answers: Record<string, unknown>;
  try {
    const response = await jevClient.systemOne({
      model: "jev-latest",
      state,
      questions,
    });
    answers = response.answers as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      code: "upstream_error",
      message:
        err instanceof Error
          ? `Jev ranking failed: ${err.message}`
          : "Jev ranking failed",
    };
  }

  const bestPickAnswer = answers.bestHeroPick as ChoiceAnswerShape | undefined;
  const choiceProbs = bestPickAnswer?.probabilities ?? {};

  const scored = eligibleHeroes.map((hero) => {
    const choiceProb = choiceProbs[hero.slug] ?? 0;
    const synergy = normalizeScore(
      answers[`synergy_${hero.slug}`] as ScoreAnswerShape | undefined,
    );
    const counter = normalizeScore(
      answers[`counter_${hero.slug}`] as ScoreAnswerShape | undefined,
    );
    const patch = normalizeScore(
      answers[`patch_${hero.slug}`] as ScoreAnswerShape | undefined,
    );

    const profileSafeAnswer = isMySlot
      ? (answers[`profileSafe_${hero.slug}`] as NoulAnswerShape | undefined)
      : undefined;
    const profileSafeProb =
      profileSafeAnswer && typeof profileSafeAnswer.noul === "number"
        ? Math.max(0, Math.min(1, profileSafeAnswer.noul))
        : undefined;

    const compositeScore =
      0.4 * choiceProb +
      0.25 * synergy.value +
      0.25 * counter.value +
      0.1 * patch.value;

    return {
      hero,
      compositeScore,
      choiceProb,
      synergy,
      counter,
      patch,
      profileSafeProb,
    };
  });

  scored.sort((a, b) => {
    if (b.compositeScore !== a.compositeScore) {
      return b.compositeScore - a.compositeScore;
    }
    if (b.choiceProb !== a.choiceProb) {
      return b.choiceProb - a.choiceProb;
    }
    if (b.hero.win_rate !== a.hero.win_rate) {
      return b.hero.win_rate - a.hero.win_rate;
    }
    return a.hero.slug.localeCompare(b.hero.slug);
  });

  const candidates: CandidatePickItem[] = scored.slice(0, 3).map((entry, idx) => ({
    rank: (idx + 1) as 1 | 2 | 3,
    hero_id: entry.hero.id,
    slug: entry.hero.slug,
    name: entry.hero.name,
    roles: entry.hero.roles,
    lanes: entry.hero.lanes,
    damage_type: entry.hero.damage_type,
    win_rate: entry.hero.win_rate,
    composite_score: roundScore(entry.compositeScore),
    choice_prob: roundScore(entry.choiceProb),
    synergy_score: roundScore(entry.synergy.value),
    counter_score: roundScore(entry.counter.value),
    patch_score: roundScore(entry.patch.value),
    synergy_label: entry.synergy.label,
    counter_label: entry.counter.label,
    patch_label: entry.patch.label,
    ...(isMySlot && entry.profileSafeProb !== undefined
      ? {
          profileSafe: {
            safe: entry.profileSafeProb >= 0.5,
            probability: roundScore(entry.profileSafeProb),
          },
        }
      : {}),
  }));

  const createdAt = new Date().toISOString();
  const payload = {
    target_slot_index: targetSlotIndex,
    candidates,
  };

  const inserted = db
    .insert(draftRecommendations)
    .values({
      session_id: sessionId,
      target_slot_index: targetSlotIndex,
      kind: "candidate_pick",
      payload_json: JSON.stringify(payload),
      created_at: createdAt,
    })
    .returning()
    .get();

  return {
    ok: true,
    data: {
      recommendation_id: inserted.id,
      session_id: sessionId,
      target_slot_index: targetSlotIndex,
      kind: "candidate_pick",
      created_at: createdAt,
      candidates,
    },
  };
}

/**
 * Handles POST /api/draft-sessions/[id]/candidate-picks.
 */
export async function handleGenerateCandidatePicks(
  request: Request,
  rawId: string,
  db: AppDatabase,
  jevClient: JevClient = getDefaultJevClient(),
): Promise<Response> {
  const sessionId = parsePositiveIntId(rawId);
  if (sessionId === null) {
    return jsonResponse({ error: "Invalid session id" }, 400);
  }

  let rawBody: unknown = {};
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
  }

  const parsed = GenerateCandidatePicksInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request payload", details: parsed.error.flatten() },
      400,
    );
  }

  const result = await generateCandidatePicks(
    db,
    jevClient,
    sessionId,
    parsed.data.target_slot_index,
  );

  if (!result.ok) {
    const statusMap = {
      not_found: 404,
      bad_request: 400,
      upstream_error: 502,
    } as const;
    return jsonResponse({ error: result.message }, statusMap[result.code]);
  }

  return jsonResponse(result.data, 200);
}
