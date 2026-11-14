import type { Database } from "bun:sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { count, eq } from "drizzle-orm";
import rawSnapshot from "@/data/patch-kb/snapshot.json";
import * as schema from "@/db/schema";
import {
  battleSpells,
  emblems,
  heroes,
  heroRelationships,
  items,
  patchMeta,
} from "@/db/schema";
import { PatchKbSnapshotSchema, type PatchKbSnapshot } from "./schema";

export type PatchKbDb = BunSQLiteDatabase<typeof schema> & {
  $client: Database;
};

export interface SeedResult {
  seeded: boolean;
  reason: "empty" | "version_upgrade" | "up_to_date";
  patchVersion: string;
}

const PATCH_META_SINGLETON_ID = 1;

/**
 * Loads and validates the repo-committed Patch Knowledge Base snapshot.
 */
export function loadCommittedSnapshot(): PatchKbSnapshot {
  return PatchKbSnapshotSchema.parse(rawSnapshot);
}

/**
 * Lazily and idempotently seeds the Patch Knowledge Base tables when empty
 * or behind the active snapshot's patch_version.
 */
export function ensurePatchKbSeeded(
  db: PatchKbDb,
  snapshot?: PatchKbSnapshot,
): SeedResult {
  const parsed = snapshot
    ? PatchKbSnapshotSchema.parse(snapshot)
    : loadCommittedSnapshot();

  const existingMeta = db
    .select()
    .from(patchMeta)
    .where(eq(patchMeta.id, PATCH_META_SINGLETON_ID))
    .get();

  const [{ value: heroCount }] = db
    .select({ value: count() })
    .from(heroes)
    .all();

  if (
    existingMeta &&
    existingMeta.patch_version === parsed.patch_version &&
    heroCount > 0
  ) {
    return {
      seeded: false,
      reason: "up_to_date",
      patchVersion: existingMeta.patch_version,
    };
  }

  const reason: SeedResult["reason"] = existingMeta ? "version_upgrade" : "empty";

  db.transaction((tx) => {
    tx.insert(patchMeta)
      .values({
        id: PATCH_META_SINGLETON_ID,
        patch_version: parsed.patch_version,
        synced_at: parsed.synced_at,
        rolled_up_meta_summary: parsed.rolled_up_meta_summary,
      })
      .onConflictDoUpdate({
        target: patchMeta.id,
        set: {
          patch_version: parsed.patch_version,
          synced_at: parsed.synced_at,
          rolled_up_meta_summary: parsed.rolled_up_meta_summary,
        },
      })
      .run();

    for (const hero of parsed.heroes) {
      tx.insert(heroes)
        .values(hero)
        .onConflictDoUpdate({
          target: heroes.id,
          set: {
            slug: hero.slug,
            name: hero.name,
            roles: hero.roles,
            lanes: hero.lanes,
            damage_type: hero.damage_type,
            specialty: hero.specialty,
            win_rate: hero.win_rate,
            ban_rate: hero.ban_rate,
            pick_rate: hero.pick_rate,
            recent_patch_summary: hero.recent_patch_summary,
          },
        })
        .run();
    }

    // Replace relationships atomically so removed matchups from prior patches do not linger.
    tx.delete(heroRelationships).run();
    if (parsed.hero_relationships.length > 0) {
      tx.insert(heroRelationships).values(parsed.hero_relationships).run();
    }

    for (const item of parsed.items) {
      tx.insert(items)
        .values(item)
        .onConflictDoUpdate({
          target: items.id,
          set: {
            slug: item.slug,
            name: item.name,
            category: item.category,
            gold_cost: item.gold_cost,
            stats_json: item.stats_json,
            unique_passive: item.unique_passive,
            semantic_tags_json: item.semantic_tags_json,
          },
        })
        .run();
    }

    for (const emblem of parsed.emblems) {
      tx.insert(emblems)
        .values(emblem)
        .onConflictDoUpdate({
          target: emblems.id,
          set: {
            slug: emblem.slug,
            name: emblem.name,
            role_fit: emblem.role_fit,
            attributes_json: emblem.attributes_json,
            talents_json: emblem.talents_json,
          },
        })
        .run();
    }

    for (const spell of parsed.battle_spells) {
      tx.insert(battleSpells)
        .values(spell)
        .onConflictDoUpdate({
          target: battleSpells.id,
          set: {
            slug: spell.slug,
            name: spell.name,
            cooldown_sec: spell.cooldown_sec,
            effect: spell.effect,
            semantic_tags_json: spell.semantic_tags_json,
          },
        })
        .run();
    }
  });

  return {
    seeded: true,
    reason,
    patchVersion: parsed.patch_version,
  };
}
