import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { draftSessions, draftSlots, heroes, patchMeta } from "@/db/schema";
import type {
  CreateDraftSessionInput,
  LaneValue,
  PatchDraftSessionInput,
  PatchDraftSlotItem,
} from "./schema";

export type DraftSessionRow = typeof draftSessions.$inferSelect;
export type DraftSlotRow = typeof draftSlots.$inferSelect;

export interface DraftSessionWithSlots {
  session: DraftSessionRow;
  slots: DraftSlotRow[];
}

const SLOT_INDICES = [1, 2, 3, 4, 5] as const;

/**
 * Fetches the 10 normalized Draft Slots for a session, ordered ally 1–5 then enemy 1–5.
 */
export function getSessionSlots(
  db: AppDatabase,
  sessionId: number,
): DraftSlotRow[] {
  return db
    .select()
    .from(draftSlots)
    .where(eq(draftSlots.session_id, sessionId))
    .orderBy(asc(draftSlots.team), asc(draftSlots.slot_index))
    .all();
}

/**
 * Creates a new Draft Session and initializes its 10 normalized Draft Slots (5 ally, 5 enemy).
 */
export function createDraftSession(
  db: AppDatabase,
  input: CreateDraftSessionInput = {},
): DraftSessionWithSlots {
  const meta = db.select().from(patchMeta).where(eq(patchMeta.id, 1)).get();
  const patchVersion = meta?.patch_version ?? "current";
  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const session = tx
      .insert(draftSessions)
      .values({
        patch_version: patchVersion,
        phase: "ban",
        my_slot_index: input.my_slot_index ?? 1,
        active_target_slot_index: input.active_target_slot_index ?? 1,
        status: "active",
        created_at: now,
        updated_at: now,
      })
      .returning()
      .get();

    const slotValues = (["ally", "enemy"] as const).flatMap((team) =>
      SLOT_INDICES.map((slotIndex) => ({
        session_id: session.id,
        team,
        slot_index: slotIndex,
        role: null,
        banned_hero_id: null,
        picked_hero_id: null,
        is_locked: false,
      })),
    );

    tx.insert(draftSlots).values(slotValues).run();

    const slots = tx
      .select()
      .from(draftSlots)
      .where(eq(draftSlots.session_id, session.id))
      .orderBy(asc(draftSlots.team), asc(draftSlots.slot_index))
      .all();

    return { session, slots };
  });
}

/**
 * Fetches a Draft Session by ID along with its 10 Draft Slots, or null if not found.
 */
export function getDraftSessionById(
  db: AppDatabase,
  sessionId: number,
): DraftSessionWithSlots | null {
  const session = db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.id, sessionId))
    .get();

  if (!session) return null;

  return {
    session,
    slots: getSessionSlots(db, session.id),
  };
}

/**
 * Fetches the most recently created Draft Session along with its 10 Draft Slots, or null if none exist.
 */
export function getLatestDraftSession(
  db: AppDatabase,
): DraftSessionWithSlots | null {
  const session = db
    .select()
    .from(draftSessions)
    .orderBy(desc(draftSessions.id))
    .limit(1)
    .get();

  if (!session) return null;

  return {
    session,
    slots: getSessionSlots(db, session.id),
  };
}

export type UpdateSlotsResult =
  | { ok: true; data: DraftSessionWithSlots }
  | { ok: false; code: "not_found" | "bad_request" | "conflict"; message: string };

/**
 * Updates one or more Draft Slots for a session, enforcing hero existence and
 * uniqueness across all bans and picks in the session.
 */
export function updateDraftSlots(
  db: AppDatabase,
  sessionId: number,
  updates: PatchDraftSlotItem[],
): UpdateSlotsResult {
  const existing = getDraftSessionById(db, sessionId);
  if (!existing) {
    return { ok: false, code: "not_found", message: "Draft session not found" };
  }

  const referencedHeroIds = new Set<number>();
  for (const u of updates) {
    if (typeof u.banned_hero_id === "number") referencedHeroIds.add(u.banned_hero_id);
    if (typeof u.picked_hero_id === "number") referencedHeroIds.add(u.picked_hero_id);
  }

  if (referencedHeroIds.size > 0) {
    const ids = [...referencedHeroIds];
    const foundHeroes = db
      .select({ id: heroes.id })
      .from(heroes)
      .where(inArray(heroes.id, ids))
      .all();
    if (foundHeroes.length !== ids.length) {
      return {
        ok: false,
        code: "bad_request",
        message: "One or more referenced hero IDs do not exist",
      };
    }
  }

  // Simulate resulting slot state to enforce no duplicate hero across bans/picks
  const simulated = existing.slots.map((slot) => ({ ...slot }));
  for (const u of updates) {
    const target = simulated.find(
      (s) => s.team === u.team && s.slot_index === u.slot_index,
    );
    if (!target) continue;
    if (u.role !== undefined) target.role = u.role;
    if (u.banned_hero_id !== undefined) target.banned_hero_id = u.banned_hero_id;
    if (u.picked_hero_id !== undefined) target.picked_hero_id = u.picked_hero_id;
    if (u.is_locked !== undefined) target.is_locked = u.is_locked;
  }

  const seenHeroes = new Set<number>();
  for (const slot of simulated) {
    for (const heroId of [slot.banned_hero_id, slot.picked_hero_id]) {
      if (heroId === null) continue;
      if (seenHeroes.has(heroId)) {
        return {
          ok: false,
          code: "conflict",
          message: `Hero ${heroId} is already banned or picked in this Draft Session`,
        };
      }
      seenHeroes.add(heroId);
    }
  }

  const now = new Date().toISOString();

  const data = db.transaction((tx) => {
    for (const u of updates) {
      const setPayload: Partial<typeof draftSlots.$inferInsert> = {};
      if (u.role !== undefined) setPayload.role = u.role;
      if (u.banned_hero_id !== undefined) {
        setPayload.banned_hero_id = u.banned_hero_id;
      }
      if (u.picked_hero_id !== undefined) {
        setPayload.picked_hero_id = u.picked_hero_id;
      }
      if (u.is_locked !== undefined) setPayload.is_locked = u.is_locked;

      if (Object.keys(setPayload).length > 0) {
        tx.update(draftSlots)
          .set(setPayload)
          .where(
            and(
              eq(draftSlots.session_id, sessionId),
              eq(draftSlots.team, u.team),
              eq(draftSlots.slot_index, u.slot_index),
            ),
          )
          .run();
      }
    }

    const session = tx
      .update(draftSessions)
      .set({ updated_at: now })
      .where(eq(draftSessions.id, sessionId))
      .returning()
      .get();

    const slots = tx
      .select()
      .from(draftSlots)
      .where(eq(draftSlots.session_id, sessionId))
      .orderBy(asc(draftSlots.team), asc(draftSlots.slot_index))
      .all();

    return { session, slots };
  });

  return { ok: true, data };
}

/**
 * Updates Draft Session metadata (My Slot, Target Ally Slot, phase, status)
 * and optionally locks all 10 Draft Slots atomically.
 */
export function updateDraftSession(
  db: AppDatabase,
  sessionId: number,
  input: PatchDraftSessionInput,
): DraftSessionWithSlots | null {
  const existing = getDraftSessionById(db, sessionId);
  if (!existing) return null;

  const now = new Date().toISOString();

  return db.transaction((tx) => {
    const sessionUpdate: Partial<typeof draftSessions.$inferInsert> = {
      updated_at: now,
    };

    if (input.my_slot_index !== undefined) {
      sessionUpdate.my_slot_index = input.my_slot_index;
    }
    if (input.active_target_slot_index !== undefined) {
      sessionUpdate.active_target_slot_index = input.active_target_slot_index;
    }
    if (input.phase !== undefined) {
      sessionUpdate.phase = input.phase;
    }
    if (input.status !== undefined) {
      sessionUpdate.status = input.status;
    }

    if (input.lock_all) {
      sessionUpdate.phase = "locked";
      sessionUpdate.status = "locked";
      tx.update(draftSlots)
        .set({ is_locked: true })
        .where(eq(draftSlots.session_id, sessionId))
        .run();
    }

    const session = tx
      .update(draftSessions)
      .set(sessionUpdate)
      .where(eq(draftSessions.id, sessionId))
      .returning()
      .get();

    const slots = tx
      .select()
      .from(draftSlots)
      .where(eq(draftSlots.session_id, sessionId))
      .orderBy(asc(draftSlots.team), asc(draftSlots.slot_index))
      .all();

    return { session, slots };
  });
}

/**
 * Lists Patch Knowledge Base heroes ordered by name, with optional query and lane filters.
 */
export function listHeroes(
  db: AppDatabase,
  filters: { q?: string; lane?: LaneValue } = {},
) {
  const meta = db.select().from(patchMeta).where(eq(patchMeta.id, 1)).get();
  const allHeroes = db.select().from(heroes).orderBy(asc(heroes.name)).all();

  const q = filters.q?.trim().toLowerCase() ?? "";
  const lane = filters.lane;

  const filtered = allHeroes.filter((h) => {
    if (lane && !h.lanes.includes(lane)) return false;
    if (
      q &&
      !h.name.toLowerCase().includes(q) &&
      !h.slug.toLowerCase().includes(q) &&
      !h.roles.some((r) => r.toLowerCase().includes(q)) &&
      !h.lanes.some((l) => l.toLowerCase().includes(q))
    ) {
      return false;
    }
    return true;
  });

  return {
    patch_version: meta?.patch_version ?? "current",
    heroes: filtered,
  };
}
