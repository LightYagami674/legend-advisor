import { asc, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import {
  failurePatterns,
  heroComfortPool,
  heroes,
  playerProfile,
  type FailurePatternStatus,
  type Lane,
} from "@/db/schema";
import {
  CreateFailurePatternSchema,
  PatchFailurePatternSchema,
  PatchHeroComfortSchema,
  UpdatePlayerProfileSchema,
  UpsertHeroComfortSchema,
  type FailurePatternDto,
  type HeroComfortPoolDto,
  type PlayerProfileBundleDto,
  type PlayerProfileDto,
} from "./schema";

const SINGLETON_PROFILE_ID = 1;

function parsePositiveInt(raw: string): number | null {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

async function parseJsonBody(request: Request): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
}

/**
 * Ensures the singleton player_profile row (id = 1) exists and returns it.
 */
export function ensurePlayerProfile(db: AppDatabase): PlayerProfileDto {
  const existing = db
    .select()
    .from(playerProfile)
    .where(eq(playerProfile.id, SINGLETON_PROFILE_ID))
    .get();

  if (existing) {
    return {
      id: existing.id,
      preferred_roles: existing.preferred_roles_json,
      updated_at: existing.updated_at,
    };
  }

  const now = new Date().toISOString();
  db.insert(playerProfile)
    .values({
      id: SINGLETON_PROFILE_ID,
      preferred_roles_json: [],
      updated_at: now,
    })
    .onConflictDoNothing()
    .run();

  const row = db
    .select()
    .from(playerProfile)
    .where(eq(playerProfile.id, SINGLETON_PROFILE_ID))
    .get()!;

  return {
    id: row.id,
    preferred_roles: row.preferred_roles_json,
    updated_at: row.updated_at,
  };
}

/**
 * Lists all hero_comfort_pool entries joined with Patch KB hero metadata.
 */
export function listHeroComfortPool(db: AppDatabase): HeroComfortPoolDto[] {
  const rows = db
    .select({
      hero_id: heroComfortPool.hero_id,
      hero_slug: heroes.slug,
      hero_name: heroes.name,
      hero_roles: heroes.roles,
      hero_lanes: heroes.lanes,
      comfort_tier: heroComfortPool.comfort_tier,
      notes: heroComfortPool.notes,
      matches_played: heroComfortPool.matches_played,
      wins: heroComfortPool.wins,
      updated_at: heroComfortPool.updated_at,
    })
    .from(heroComfortPool)
    .innerJoin(heroes, eq(heroComfortPool.hero_id, heroes.id))
    .orderBy(asc(heroes.name))
    .all();

  return rows;
}

/**
 * Lists failure_patterns, optionally filtered by status, ordered active-first by occurrences desc.
 */
export function listFailurePatterns(
  db: AppDatabase,
  statusFilter?: FailurePatternStatus,
): FailurePatternDto[] {
  const query = statusFilter
    ? db
        .select()
        .from(failurePatterns)
        .where(eq(failurePatterns.status, statusFilter))
    : db.select().from(failurePatterns);

  return query
    .orderBy(
      asc(failurePatterns.status),
      desc(failurePatterns.occurrences),
      desc(failurePatterns.updated_at),
    )
    .all();
}

/**
 * Returns the complete Player Profile bundle (singleton profile, comfort pool, failure patterns).
 */
export function getPlayerProfileBundle(db: AppDatabase): PlayerProfileBundleDto {
  return {
    profile: ensurePlayerProfile(db),
    comfort_pool: listHeroComfortPool(db),
    failure_patterns: listFailurePatterns(db),
  };
}

/**
 * Updates the singleton Player Profile's preferred_roles list.
 */
export function updatePreferredRoles(
  db: AppDatabase,
  preferredRoles: Lane[],
): PlayerProfileDto {
  const deduped = Array.from(new Set(preferredRoles));
  const now = new Date().toISOString();
  ensurePlayerProfile(db);

  db.update(playerProfile)
    .set({
      preferred_roles_json: deduped,
      updated_at: now,
    })
    .where(eq(playerProfile.id, SINGLETON_PROFILE_ID))
    .run();

  return {
    id: SINGLETON_PROFILE_ID,
    preferred_roles: deduped,
    updated_at: now,
  };
}

/**
 * Upserts a hero entry into hero_comfort_pool.
 */
export function upsertHeroComfort(
  db: AppDatabase,
  input: {
    hero_id: number;
    comfort_tier: HeroComfortPoolDto["comfort_tier"];
    notes?: string;
    matches_played?: number;
    wins?: number;
  },
): { ok: true; entry: HeroComfortPoolDto } | { ok: false; code: "not_found" | "bad_request"; message: string } {
  const hero = db.select().from(heroes).where(eq(heroes.id, input.hero_id)).get();
  if (!hero) {
    return { ok: false, code: "not_found", message: "Hero not found in Patch KB" };
  }

  const existing = db
    .select()
    .from(heroComfortPool)
    .where(eq(heroComfortPool.hero_id, input.hero_id))
    .get();

  const matchesPlayed = input.matches_played ?? existing?.matches_played ?? 0;
  const wins = input.wins ?? existing?.wins ?? 0;
  if (wins > matchesPlayed) {
    return {
      ok: false,
      code: "bad_request",
      message: "wins cannot exceed matches_played",
    };
  }

  const now = new Date().toISOString();
  const notes = input.notes ?? existing?.notes ?? "";

  if (existing) {
    db.update(heroComfortPool)
      .set({
        comfort_tier: input.comfort_tier,
        notes,
        matches_played: matchesPlayed,
        wins,
        updated_at: now,
      })
      .where(eq(heroComfortPool.hero_id, input.hero_id))
      .run();
  } else {
    db.insert(heroComfortPool)
      .values({
        hero_id: input.hero_id,
        comfort_tier: input.comfort_tier,
        notes,
        matches_played: matchesPlayed,
        wins,
        updated_at: now,
      })
      .run();
  }

  return {
    ok: true,
    entry: {
      hero_id: hero.id,
      hero_slug: hero.slug,
      hero_name: hero.name,
      hero_roles: hero.roles,
      hero_lanes: hero.lanes,
      comfort_tier: input.comfort_tier,
      notes,
      matches_played: matchesPlayed,
      wins,
      updated_at: now,
    },
  };
}

/**
 * Deletes a hero_comfort_pool entry by hero_id.
 */
export function deleteHeroComfort(db: AppDatabase, heroId: number): boolean {
  const deleted = db
    .delete(heroComfortPool)
    .where(eq(heroComfortPool.hero_id, heroId))
    .returning()
    .get();
  return Boolean(deleted);
}

/**
 * Creates a new failure_pattern or reinforces an existing one with the same pattern_key
 * by incrementing occurrences factually and updating last_seen_review_id.
 */
export function upsertOrReinforceFailurePattern(
  db: AppDatabase,
  input: {
    dimension: FailurePatternDto["dimension"];
    pattern_key: string;
    rule: string;
    scope_type: FailurePatternDto["scope_type"];
    scope_value?: string | null;
    last_seen_review_id?: string | null;
  },
): { created: boolean; pattern: FailurePatternDto } {
  const now = new Date().toISOString();
  const normalizedScopeValue =
    input.scope_type === "general" ? null : (input.scope_value ?? null);

  const existing = db
    .select()
    .from(failurePatterns)
    .where(eq(failurePatterns.pattern_key, input.pattern_key))
    .get();

  if (existing) {
    const updated = db
      .update(failurePatterns)
      .set({
        dimension: input.dimension,
        rule: input.rule,
        scope_type: input.scope_type,
        scope_value: normalizedScopeValue,
        occurrences: existing.occurrences + 1,
        status: "active",
        last_seen_review_id:
          input.last_seen_review_id !== undefined
            ? input.last_seen_review_id
            : existing.last_seen_review_id,
        updated_at: now,
      })
      .where(eq(failurePatterns.id, existing.id))
      .returning()
      .get();

    return { created: false, pattern: updated };
  }

  const inserted = db
    .insert(failurePatterns)
    .values({
      dimension: input.dimension,
      pattern_key: input.pattern_key,
      rule: input.rule,
      scope_type: input.scope_type,
      scope_value: normalizedScopeValue,
      occurrences: 1,
      status: "active",
      last_seen_review_id: input.last_seen_review_id ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning()
    .get();

  return { created: true, pattern: inserted };
}

/**
 * Updates an existing failure_pattern (edit rule/scope, resolve/reopen, or reinforce occurrences).
 */
export function updateFailurePattern(
  db: AppDatabase,
  id: number,
  patch: {
    dimension?: FailurePatternDto["dimension"];
    rule?: string;
    scope_type?: FailurePatternDto["scope_type"];
    scope_value?: string | null;
    status?: FailurePatternStatus;
    reinforce?: boolean;
    last_seen_review_id?: string | null;
  },
): FailurePatternDto | null {
  const existing = db
    .select()
    .from(failurePatterns)
    .where(eq(failurePatterns.id, id))
    .get();

  if (!existing) return null;

  const nextScopeType = patch.scope_type ?? existing.scope_type;
  const nextScopeValue =
    nextScopeType === "general"
      ? null
      : patch.scope_value !== undefined
        ? patch.scope_value
        : existing.scope_value;

  const updated = db
    .update(failurePatterns)
    .set({
      dimension: patch.dimension ?? existing.dimension,
      rule: patch.rule ?? existing.rule,
      scope_type: nextScopeType,
      scope_value: nextScopeValue,
      status: patch.status ?? existing.status,
      occurrences: patch.reinforce ? existing.occurrences + 1 : existing.occurrences,
      last_seen_review_id:
        patch.last_seen_review_id !== undefined
          ? patch.last_seen_review_id
          : existing.last_seen_review_id,
      updated_at: new Date().toISOString(),
    })
    .where(eq(failurePatterns.id, id))
    .returning()
    .get();

  return updated ?? null;
}

/**
 * Deletes a failure_pattern by id.
 */
export function deleteFailurePattern(db: AppDatabase, id: number): boolean {
  const deleted = db
    .delete(failurePatterns)
    .where(eq(failurePatterns.id, id))
    .returning()
    .get();
  return Boolean(deleted);
}

/**
 * Handles GET /api/player-profile.
 */
export async function handleGetPlayerProfile(db: AppDatabase): Promise<Response> {
  return Response.json(getPlayerProfileBundle(db), { status: 200 });
}

/**
 * Handles PUT /api/player-profile.
 */
export async function handlePutPlayerProfile(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = UpdatePlayerProfileSchema.safeParse(body.data);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid player profile payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const profile = updatePreferredRoles(db, parsed.data.preferred_roles);
  return Response.json({ profile }, { status: 200 });
}

/**
 * Handles GET /api/player-profile/comfort-pool.
 */
export async function handleGetComfortPool(db: AppDatabase): Promise<Response> {
  return Response.json({ comfort_pool: listHeroComfortPool(db) }, { status: 200 });
}

/**
 * Handles POST /api/player-profile/comfort-pool.
 */
export async function handleUpsertHeroComfort(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = UpsertHeroComfortSchema.safeParse(body.data);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid comfort pool payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = upsertHeroComfort(db, parsed.data);
  if (!result.ok) {
    return Response.json(
      { error: result.message },
      { status: result.code === "not_found" ? 404 : 400 },
    );
  }

  return Response.json({ entry: result.entry }, { status: 200 });
}

/**
 * Handles PATCH /api/player-profile/comfort-pool/[heroId].
 */
export async function handlePatchHeroComfort(
  request: Request,
  rawHeroId: string,
  db: AppDatabase,
): Promise<Response> {
  const heroId = parsePositiveInt(rawHeroId);
  if (heroId === null) {
    return Response.json({ error: "Invalid hero_id" }, { status: 400 });
  }

  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = PatchHeroComfortSchema.safeParse(body.data);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid comfort pool patch payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = db
    .select()
    .from(heroComfortPool)
    .where(eq(heroComfortPool.hero_id, heroId))
    .get();

  if (!existing) {
    return Response.json({ error: "Hero comfort entry not found" }, { status: 404 });
  }

  const result = upsertHeroComfort(db, {
    hero_id: heroId,
    comfort_tier: parsed.data.comfort_tier ?? existing.comfort_tier,
    notes: parsed.data.notes ?? existing.notes,
    matches_played: parsed.data.matches_played ?? existing.matches_played,
    wins: parsed.data.wins ?? existing.wins,
  });

  if (!result.ok) {
    return Response.json(
      { error: result.message },
      { status: result.code === "not_found" ? 404 : 400 },
    );
  }

  return Response.json({ entry: result.entry }, { status: 200 });
}

/**
 * Handles DELETE /api/player-profile/comfort-pool/[heroId].
 */
export async function handleDeleteHeroComfort(
  rawHeroId: string,
  db: AppDatabase,
): Promise<Response> {
  const heroId = parsePositiveInt(rawHeroId);
  if (heroId === null) {
    return Response.json({ error: "Invalid hero_id" }, { status: 400 });
  }

  const deleted = deleteHeroComfort(db, heroId);
  if (!deleted) {
    return Response.json({ error: "Hero comfort entry not found" }, { status: 404 });
  }

  return Response.json({ deleted: true, hero_id: heroId }, { status: 200 });
}

/**
 * Handles GET /api/player-profile/failure-patterns.
 */
export async function handleGetFailurePatterns(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  if (statusParam && statusParam !== "active" && statusParam !== "resolved") {
    return Response.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const patterns = listFailurePatterns(
    db,
    statusParam ? (statusParam as FailurePatternStatus) : undefined,
  );
  return Response.json({ failure_patterns: patterns }, { status: 200 });
}

/**
 * Handles POST /api/player-profile/failure-patterns.
 */
export async function handlePostFailurePattern(
  request: Request,
  db: AppDatabase,
): Promise<Response> {
  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = CreateFailurePatternSchema.safeParse(body.data);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid failure pattern payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = upsertOrReinforceFailurePattern(db, parsed.data);
  return Response.json(
    { pattern: result.pattern, reinforced: !result.created },
    { status: result.created ? 201 : 200 },
  );
}

/**
 * Handles PATCH /api/player-profile/failure-patterns/[id].
 */
export async function handlePatchFailurePattern(
  request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const id = parsePositiveInt(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid failure pattern id" }, { status: 400 });
  }

  const body = await parseJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = PatchFailurePatternSchema.safeParse(body.data);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid failure pattern patch payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = updateFailurePattern(db, id, parsed.data);
  if (!updated) {
    return Response.json({ error: "Failure pattern not found" }, { status: 404 });
  }

  return Response.json({ pattern: updated }, { status: 200 });
}

/**
 * Handles DELETE /api/player-profile/failure-patterns/[id].
 */
export async function handleDeleteFailurePattern(
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const id = parsePositiveInt(rawId);
  if (id === null) {
    return Response.json({ error: "Invalid failure pattern id" }, { status: 400 });
  }

  const deleted = deleteFailurePattern(db, id);
  if (!deleted) {
    return Response.json({ error: "Failure pattern not found" }, { status: 404 });
  }

  return Response.json({ deleted: true, id }, { status: 200 });
}
