import {
  TypeSafeClient,
  choice,
  noul,
  score,
  type ChoiceResponse,
  type NoulResponse,
  type Questions,
  type RequestOptions,
  type ScoreResponse,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db";
import {
  battleSpells,
  draftRecommendations,
  draftSessions,
  draftSlots,
  emblems,
  heroComfortPool,
  heroRelationships,
  heroes,
  items,
  patchMeta,
  type EmblemTalent,
} from "@/db/schema";
import { listFailurePatterns } from "@/lib/player-profile/service";
import type {
  ActionReminderItem,
  BuildBlessingDto,
  BuildEmblemTalentDto,
  BuildItemRecommendation,
  BuildRecommendationPayload,
  BuildTierLabel,
  SituationalFlags,
} from "./types";

export interface JevClientLike {
  systemOne<const Q extends Questions>(
    request: SystemOneRequest<Q>,
    options?: RequestOptions,
  ): Promise<SystemOneResult<Q>>;
}

const ITEM_SCORE_RUBRIC = [
  "Not needed",
  "Situational",
  "Strong core fit",
  "Must-buy counter/core",
] as const;

const NOUL_THRESHOLD = 0.5;

const PostBuildRequestSchema = z.object({
  target_slot_index: z.number().int().min(1).max(5).optional(),
});

let defaultJevClient: TypeSafeClient | null = null;

function getDefaultJevClient(): JevClientLike {
  if (!defaultJevClient) {
    defaultJevClient = new TypeSafeClient();
  }
  return defaultJevClient;
}

function parseSessionId(rawId: string): number | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return Response.json(data, { status });
}

function collectTalentCatalog(
  allEmblems: (typeof emblems.$inferSelect)[],
): {
  tier1: Map<string, EmblemTalent>;
  tier2: Map<string, EmblemTalent>;
  tier3: Map<string, EmblemTalent>;
} {
  const tier1 = new Map<string, EmblemTalent>();
  const tier2 = new Map<string, EmblemTalent>();
  const tier3 = new Map<string, EmblemTalent>();

  for (const emblem of allEmblems) {
    for (const t of emblem.talents_json.tier1) {
      if (!tier1.has(t.name)) tier1.set(t.name, t);
    }
    for (const t of emblem.talents_json.tier2) {
      if (!tier2.has(t.name)) tier2.set(t.name, t);
    }
    for (const t of emblem.talents_json.tier3) {
      if (!tier3.has(t.name)) tier3.set(t.name, t);
    }
  }

  return { tier1, tier2, tier3 };
}

function classifyItemScore(rawScore: number): {
  tag: "Core" | "Situational";
  tier_label: Exclude<BuildTierLabel, "Boots">;
} {
  if (rawScore >= 2.5) {
    return { tag: "Core", tier_label: "Must-buy counter/core" };
  }
  if (rawScore >= 1.5) {
    return { tag: "Core", tier_label: "Strong core fit" };
  }
  return { tag: "Situational", tier_label: "Situational" };
}

export type BuildServiceErrorCode = "not_found" | "bad_request";

export type BuildServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: BuildServiceErrorCode; message: string };

/**
 * Generates a post-draft 6-item Build Recommendation for a Target Ally Slot
 * using a single-pass Jev `systemOne` evaluation and persists it to `draft_recommendations`.
 */
export async function generateBuildRecommendation(
  db: AppDatabase,
  sessionId: number,
  requestedSlotIndex?: number,
  jevClient: JevClientLike = getDefaultJevClient(),
): Promise<BuildServiceResult<BuildRecommendationPayload>> {
  const session = db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.id, sessionId))
    .get();
  if (!session) {
    return { ok: false, code: "not_found", message: "Draft session not found" };
  }

  const targetSlotIndex =
    requestedSlotIndex ?? session.active_target_slot_index;

  const slots = db
    .select()
    .from(draftSlots)
    .where(eq(draftSlots.session_id, sessionId))
    .orderBy(asc(draftSlots.team), asc(draftSlots.slot_index))
    .all();

  const targetSlot = slots.find(
    (s) => s.team === "ally" && s.slot_index === targetSlotIndex,
  );
  if (!targetSlot) {
    return { ok: false, code: "bad_request", message: "Invalid Target Ally Slot" };
  }
  if (targetSlot.picked_hero_id === null) {
    return {
      ok: false,
      code: "bad_request",
      message: `Ally ${targetSlotIndex} must have a picked hero before generating a Build Recommendation`,
    };
  }

  const meta = db.select().from(patchMeta).where(eq(patchMeta.id, 1)).get();
  const pickedHeroIds = slots
    .map((s) => s.picked_hero_id)
    .filter((id): id is number => id !== null);

  const draftHeroes =
    pickedHeroIds.length > 0
      ? db.select().from(heroes).where(inArray(heroes.id, pickedHeroIds)).all()
      : [];
  const heroById = new Map(draftHeroes.map((h) => [h.id, h]));

  const targetHero = heroById.get(targetSlot.picked_hero_id);
  if (!targetHero) {
    return { ok: false, code: "not_found", message: "Picked hero not found in Patch KB" };
  }

  const relationships =
    pickedHeroIds.length > 0
      ? db
          .select()
          .from(heroRelationships)
          .where(inArray(heroRelationships.source_hero_id, pickedHeroIds))
          .all()
          .filter((r) => pickedHeroIds.includes(r.target_hero_id))
      : [];

  const allItems = db.select().from(items).all();
  const allEmblems = db.select().from(emblems).all();
  const allSpells = db.select().from(battleSpells).all();

  const bootItems = allItems.filter((i) => i.category === "Movement");
  const jungleBlessings = allItems.filter((i) => i.category === "Jungling");
  const roamBlessings = allItems.filter((i) => i.category === "Roaming");
  const tier3NonBootItems = allItems.filter(
    (i) =>
      i.category !== "Movement" &&
      i.category !== "Jungling" &&
      i.category !== "Roaming",
  );

  const { tier1: t1Map, tier2: t2Map, tier3: t3Map } =
    collectTalentCatalog(allEmblems);

  const formatSlotSummary = (s: typeof targetSlot) => {
    const h = s.picked_hero_id ? heroById.get(s.picked_hero_id) : undefined;
    return {
      team: s.team,
      slot_index: s.slot_index,
      role: s.role,
      hero: h
        ? {
            id: h.id,
            slug: h.slug,
            name: h.name,
            roles: h.roles,
            damage_type: h.damage_type,
            specialty: h.specialty,
            recent_patch_summary: h.recent_patch_summary,
          }
        : null,
    };
  };

  const isMySlot = targetSlotIndex === session.my_slot_index;
  let mySlotComfortNote: { comfort_tier: string; notes: string } | null = null;
  let mySlotBuildPatterns: Array<{
    pattern_key: string;
    rule: string;
    scope_type: string;
    scope_value: string | null;
    occurrences: number;
  }> = [];
  let actionReminders: ActionReminderItem[] | undefined;

  if (isMySlot) {
    const comfortRow = db
      .select()
      .from(heroComfortPool)
      .where(eq(heroComfortPool.hero_id, targetHero.id))
      .get();

    if (comfortRow) {
      mySlotComfortNote = {
        comfort_tier: comfortRow.comfort_tier,
        notes: comfortRow.notes,
      };
    }

    const activePatterns = listFailurePatterns(db, "active").filter((p) => {
      if (p.scope_type === "general") return true;
      if (p.scope_type === "role") {
        return targetSlot.role !== null && p.scope_value === targetSlot.role;
      }
      if (p.scope_type === "hero") {
        return (
          p.scope_value === targetHero.slug || p.scope_value === targetHero.name
        );
      }
      return false;
    });

    mySlotBuildPatterns = activePatterns
      .filter((p) => p.dimension === "build")
      .map((p) => ({
        pattern_key: p.pattern_key,
        rule: p.rule,
        scope_type: p.scope_type,
        scope_value: p.scope_value,
        occurrences: p.occurrences,
      }));

    actionReminders = activePatterns
      .filter((p) => p.dimension === "action")
      .map((p) => ({
        id: p.id,
        pattern_key: p.pattern_key,
        rule: p.rule,
        scope_type: p.scope_type,
        scope_value: p.scope_value,
        occurrences: p.occurrences,
      }));
  }

  const state = {
    patch_version: meta?.patch_version ?? session.patch_version,
    rolled_up_meta_summary: meta?.rolled_up_meta_summary ?? "",
    target_ally_slot: {
      slot_index: targetSlot.slot_index,
      role: targetSlot.role,
      hero: {
        id: targetHero.id,
        slug: targetHero.slug,
        name: targetHero.name,
        roles: targetHero.roles,
        lanes: targetHero.lanes,
        damage_type: targetHero.damage_type,
        specialty: targetHero.specialty,
        recent_patch_summary: targetHero.recent_patch_summary,
      },
    },
    ally_team: slots
      .filter((s) => s.team === "ally")
      .map(formatSlotSummary),
    enemy_team: slots
      .filter((s) => s.team === "enemy")
      .map(formatSlotSummary),
    hero_relationships: relationships.map((r) => ({
      source: heroById.get(r.source_hero_id)?.name ?? r.source_hero_id,
      target: heroById.get(r.target_hero_id)?.name ?? r.target_hero_id,
      type: r.relation_type,
      win_rate_delta: r.win_rate_delta,
      explanation: r.explanation,
    })),
    ...(isMySlot
      ? {
          player_profile: {
            hero_comfort_note: mySlotComfortNote,
            build_failure_patterns: mySlotBuildPatterns,
          },
        }
      : {}),
  };

  const questions: Questions = {
    battleSpell: choice(
      `Select the optimal Battle Spell for ${targetHero.name} (${targetSlot.role ?? "flex"}) against this enemy lineup.`,
      Object.fromEntries(
        allSpells.map((s) => [s.slug, `${s.name} (${s.cooldown_sec}s CD): ${s.effect}`]),
      ),
    ),
    emblemSet: choice(
      `Select the optimal Emblem Set for ${targetHero.name} (${targetSlot.role ?? "flex"}).`,
      Object.fromEntries(
        allEmblems.map((e) => [
          e.slug,
          `${e.name} (fits ${e.role_fit.join(", ")}): ${JSON.stringify(e.attributes_json)}`,
        ]),
      ),
    ),
    talentTier1: choice(
      `Select the optimal Tier 1 Emblem Talent for ${targetHero.name}.`,
      Object.fromEntries(
        Array.from(t1Map.values()).map((t) => [t.name, t.effect]),
      ),
    ),
    talentTier2: choice(
      `Select the optimal Tier 2 Emblem Talent for ${targetHero.name}.`,
      Object.fromEntries(
        Array.from(t2Map.values()).map((t) => [t.name, t.effect]),
      ),
    ),
    talentTier3: choice(
      `Select the optimal Tier 3 Emblem Talent for ${targetHero.name}.`,
      Object.fromEntries(
        Array.from(t3Map.values()).map((t) => [t.name, t.effect]),
      ),
    ),
    boots: choice(
      `Select the optimal Movement Boots for ${targetHero.name} (${targetSlot.role ?? "flex"}) against the enemy damage & CC profile.`,
      Object.fromEntries(
        bootItems.map((b) => [
          b.slug,
          `${b.name}: ${b.unique_passive} [${b.semantic_tags_json.join(", ")}]`,
        ]),
      ),
    ),
    needsAntiHeal: noul(
      `Does ${targetHero.name} need Anti-Heal (Sea Halberd / Glowing Wand / Dominance Ice) against the enemy team's sustain/shielding?`,
    ),
    needsAntiShield: noul(
      `Does ${targetHero.name} need Anti-Shield or shield-countering items against enemy shields?`,
    ),
    needsMagicDefense: noul(
      `Does ${targetHero.name} need Magic Defense (Athena's Shield / Radiant Armor / Oracle) against enemy magic burst/DPS?`,
    ),
    needsPhysicalDefense: noul(
      `Does ${targetHero.name} need Physical Defense (Antique Cuirass / Dominance Ice / Immortality) against enemy physical threats?`,
    ),
    needsPenetration: noul(
      `Does ${targetHero.name} need Armor or Magic Penetration (Malefic Roar / Divine Glaive / Genius Wand) against enemy tankiness?`,
    ),
  };

  const blessingPool =
    targetSlot.role === "Roam"
      ? roamBlessings
      : targetSlot.role === "Jungle"
        ? jungleBlessings
        : null;

  if (blessingPool && blessingPool.length > 0) {
    questions.bootBlessing = choice(
      `Select the optimal ${targetSlot.role} boot blessing for ${targetHero.name}.`,
      Object.fromEntries(
        blessingPool.map((b) => [b.slug, `${b.name}: ${b.unique_passive}`]),
      ),
    );
  }

  for (const item of tier3NonBootItems) {
    questions[`item_${item.slug}`] = score(
      `Rate ${item.name} (${item.category}, ${item.gold_cost}g) for ${targetHero.name} (${targetSlot.role ?? "flex"}): ${item.unique_passive} [tags: ${item.semantic_tags_json.join(", ")}]`,
      ITEM_SCORE_RUBRIC,
    );
  }

  const result = await jevClient.systemOne({
    model: "jev-latest",
    state,
    questions,
  });

  const answers = result.answers as Record<
    string,
    ChoiceResponse | NoulResponse | ScoreResponse
  >;

  const chosenBootSlug = (answers.boots as ChoiceResponse).choice;
  const chosenBoot =
    bootItems.find((b) => b.slug === chosenBootSlug) ?? bootItems[0]!;

  let blessing: BuildBlessingDto | null = null;
  if (blessingPool && blessingPool.length > 0 && answers.bootBlessing) {
    const chosenBlessingSlug = (answers.bootBlessing as ChoiceResponse).choice;
    const blessingItem =
      blessingPool.find((b) => b.slug === chosenBlessingSlug) ?? blessingPool[0]!;
    blessing = {
      slug: blessingItem.slug,
      name: blessingItem.name,
      category: blessingItem.category as "Jungling" | "Roaming",
      effect: blessingItem.unique_passive,
    };
  }

  const bootRecommendation: BuildItemRecommendation = {
    slug: chosenBoot.slug,
    name: chosenBoot.name,
    category: chosenBoot.category,
    gold_cost: chosenBoot.gold_cost,
    unique_passive: chosenBoot.unique_passive,
    semantic_tags: chosenBoot.semantic_tags_json,
    tag: "Boots",
    tier_label: "Boots",
    score: 3,
    blessing,
  };

  const scoredNonBoots = tier3NonBootItems
    .map((item) => {
      const ans = answers[`item_${item.slug}`] as ScoreResponse | undefined;
      const itemScore = ans?.score ?? 0;
      const { tag, tier_label } = classifyItemScore(itemScore);
      return {
        item,
        itemScore,
        tag,
        tier_label,
      };
    })
    .sort((a, b) => b.itemScore - a.itemScore)
    .slice(0, 5);

  // Order core-first, situational-last (already descending by score, which puts Core >= 1.5 before Situational < 1.5)
  const orderedNonBoots: BuildItemRecommendation[] = [
    ...scoredNonBoots.filter((x) => x.tag === "Core"),
    ...scoredNonBoots.filter((x) => x.tag === "Situational"),
  ].map(({ item, itemScore, tag, tier_label }) => ({
    slug: item.slug,
    name: item.name,
    category: item.category,
    gold_cost: item.gold_cost,
    unique_passive: item.unique_passive,
    semantic_tags: item.semantic_tags_json,
    tag,
    tier_label,
    score: Number(itemScore.toFixed(2)),
    blessing: null,
  }));

  const chosenEmblemSlug = (answers.emblemSet as ChoiceResponse).choice;
  const chosenEmblem =
    allEmblems.find((e) => e.slug === chosenEmblemSlug) ?? allEmblems[0]!;

  const pickTalent = (
    ansKey: string,
    map: Map<string, EmblemTalent>,
    fallback: EmblemTalent,
  ): BuildEmblemTalentDto => {
    const name = (answers[ansKey] as ChoiceResponse | undefined)?.choice;
    const found = name ? map.get(name) : undefined;
    return found ?? fallback;
  };

  const chosenSpellSlug = (answers.battleSpell as ChoiceResponse).choice;
  const chosenSpell =
    allSpells.find((s) => s.slug === chosenSpellSlug) ?? allSpells[0]!;

  const makeFlag = (key: string, label: string) => {
    const prob = (answers[key] as NoulResponse | undefined)?.noul ?? 0;
    return {
      triggered: prob >= NOUL_THRESHOLD,
      probability: Number(prob.toFixed(3)),
      label,
    };
  };

  const situational_flags: SituationalFlags = {
    needsAntiHeal: makeFlag("needsAntiHeal", "Anti-Heal"),
    needsAntiShield: makeFlag("needsAntiShield", "Anti-Shield"),
    needsMagicDefense: makeFlag("needsMagicDefense", "Magic Defense"),
    needsPhysicalDefense: makeFlag("needsPhysicalDefense", "Physical Defense"),
    needsPenetration: makeFlag("needsPenetration", "Penetration"),
  };

  const now = new Date().toISOString();
  const payload: BuildRecommendationPayload = {
    session_id: sessionId,
    target_slot_index: targetSlotIndex,
    target_role: targetSlot.role,
    hero: {
      id: targetHero.id,
      slug: targetHero.slug,
      name: targetHero.name,
    },
    items: [bootRecommendation, ...orderedNonBoots],
    emblem: {
      slug: chosenEmblem.slug,
      name: chosenEmblem.name,
      tier1: pickTalent("talentTier1", t1Map, chosenEmblem.talents_json.tier1[0]!),
      tier2: pickTalent("talentTier2", t2Map, chosenEmblem.talents_json.tier2[0]!),
      tier3: pickTalent("talentTier3", t3Map, chosenEmblem.talents_json.tier3[0]!),
    },
    battle_spell: {
      slug: chosenSpell.slug,
      name: chosenSpell.name,
      cooldown_sec: chosenSpell.cooldown_sec,
      effect: chosenSpell.effect,
    },
    situational_flags,
    ...(isMySlot ? { actionReminders: actionReminders ?? [] } : {}),
    created_at: now,
  };

  db.transaction((tx) => {
    tx.delete(draftRecommendations)
      .where(
        and(
          eq(draftRecommendations.session_id, sessionId),
          eq(draftRecommendations.target_slot_index, targetSlotIndex),
          eq(draftRecommendations.kind, "build_recommendation"),
        ),
      )
      .run();

    tx.insert(draftRecommendations)
      .values({
        session_id: sessionId,
        target_slot_index: targetSlotIndex,
        kind: "build_recommendation",
        payload_json: JSON.stringify(payload),
        created_at: now,
      })
      .run();
  });

  return { ok: true, data: payload };
}

/**
 * Fetches the latest persisted Build Recommendation for a session and target slot, if any.
 */
export function getPersistedBuildRecommendation(
  db: AppDatabase,
  sessionId: number,
  targetSlotIndex: number,
): BuildRecommendationPayload | null {
  const row = db
    .select()
    .from(draftRecommendations)
    .where(
      and(
        eq(draftRecommendations.session_id, sessionId),
        eq(draftRecommendations.target_slot_index, targetSlotIndex),
        eq(draftRecommendations.kind, "build_recommendation"),
      ),
    )
    .orderBy(desc(draftRecommendations.id))
    .get();

  if (!row) return null;
  return JSON.parse(row.payload_json) as BuildRecommendationPayload;
}

/**
 * Handles POST /api/draft-sessions/[id]/build-recommendation.
 */
export async function handlePostBuildRecommendation(
  request: Request,
  rawId: string,
  db: AppDatabase,
  jevClient: JevClientLike = getDefaultJevClient(),
): Promise<Response> {
  const sessionId = parseSessionId(rawId);
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

  const parsed = PostBuildRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Invalid request payload", details: parsed.error.flatten() },
      400,
    );
  }

  const result = await generateBuildRecommendation(
    db,
    sessionId,
    parsed.data.target_slot_index,
    jevClient,
  );

  if (!result.ok) {
    const status = result.code === "not_found" ? 404 : 400;
    return jsonResponse({ error: result.message }, status);
  }

  return jsonResponse(result.data, 200);
}

/**
 * Handles GET /api/draft-sessions/[id]/build-recommendation.
 */
export async function handleGetBuildRecommendation(
  request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const sessionId = parseSessionId(rawId);
  if (sessionId === null) {
    return jsonResponse({ error: "Invalid session id" }, 400);
  }

  const session = db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.id, sessionId))
    .get();
  if (!session) {
    return jsonResponse({ error: "Draft session not found" }, 404);
  }

  const url = new URL(request.url);
  const rawSlot = url.searchParams.get("target_slot_index");
  const targetSlotIndex = rawSlot
    ? Number(rawSlot)
    : session.active_target_slot_index;

  if (
    !Number.isInteger(targetSlotIndex) ||
    targetSlotIndex < 1 ||
    targetSlotIndex > 5
  ) {
    return jsonResponse({ error: "Invalid target_slot_index" }, 400);
  }

  const payload = getPersistedBuildRecommendation(db, sessionId, targetSlotIndex);
  if (!payload) {
    return jsonResponse(
      { error: "Build recommendation not found for target slot" },
      404,
    );
  }

  return jsonResponse(payload, 200);
}
