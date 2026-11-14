import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { count, eq } from "drizzle-orm";
import { createDatabase } from "@/db";
import {
  battleSpells,
  emblems,
  heroes,
  heroRelationships,
  items,
  patchMeta,
} from "@/db/schema";
import { PatchKbSnapshotSchema, type PatchKbSnapshot } from "@/lib/patch-kb/schema";
import { ensurePatchKbSeeded, loadCommittedSnapshot } from "@/lib/patch-kb/seed";

describe("Patch Knowledge Base schema, lazy seeding, and snapshot validation", () => {
  it("validates the committed snapshot.json against PatchKbSnapshotSchema", () => {
    const snapshot = loadCommittedSnapshot();
    const parsed = PatchKbSnapshotSchema.safeParse(snapshot);
    expect(parsed.success).toBe(true);

    // Ensure all 5 lanes are represented
    const lanes = new Set(snapshot.heroes.flatMap((h) => h.lanes));
    for (const lane of ["EXP", "Jungle", "Mid", "Gold", "Roam"]) {
      expect(lanes.has(lane as "EXP" | "Jungle" | "Mid" | "Gold" | "Roam")).toBe(true);
    }

    // Ensure all item categories including boots, jungling, and roaming blessings are present
    const categories = new Set(snapshot.items.map((i) => i.category));
    for (const cat of ["Attack", "Magic", "Defense", "Movement", "Jungling", "Roaming"]) {
      expect(
        categories.has(
          cat as "Attack" | "Magic" | "Defense" | "Movement" | "Jungling" | "Roaming",
        ),
      ).toBe(true);
    }

    // Ensure all relationships are mythic_plus
    expect(snapshot.hero_relationships.length).toBeGreaterThan(0);
    for (const rel of snapshot.hero_relationships) {
      expect(rel.rank_tier).toBe("mythic_plus");
    }

    // Ensure emblems have tier1, tier2, tier3 talents and battle spells are populated
    expect(snapshot.emblems.length).toBeGreaterThanOrEqual(7);
    for (const emblem of snapshot.emblems) {
      expect(emblem.talents_json.tier1.length).toBeGreaterThan(0);
      expect(emblem.talents_json.tier2.length).toBeGreaterThan(0);
      expect(emblem.talents_json.tier3.length).toBeGreaterThan(0);
    }
    expect(snapshot.battle_spells.length).toBeGreaterThanOrEqual(12);
  });

  it("rejects invalid rank_tier and dangling hero_relationships in PatchKbSnapshotSchema", () => {
    const valid = loadCommittedSnapshot();

    const badRank = {
      ...valid,
      hero_relationships: [
        {
          ...valid.hero_relationships[0],
          rank_tier: "epic",
        },
      ],
    };
    expect(PatchKbSnapshotSchema.safeParse(badRank).success).toBe(false);

    const danglingRel = {
      ...valid,
      hero_relationships: [
        {
          ...valid.hero_relationships[0],
          target_hero_id: 999999,
        },
      ],
    };
    expect(PatchKbSnapshotSchema.safeParse(danglingRel).success).toBe(false);
  });

  it("lazily seeds an isolated SQLite database on first creation", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "legend-advisor-kb-"));
    try {
      const dbPath = join(tempDir, "test.db");
      const db = createDatabase(dbPath);
      const snapshot = loadCommittedSnapshot();

      const metaRows = db.select().from(patchMeta).all();
      expect(metaRows).toHaveLength(1);
      expect(metaRows[0].patch_version).toBe(snapshot.patch_version);
      expect(metaRows[0].rolled_up_meta_summary).toBe(snapshot.rolled_up_meta_summary);

      const [{ value: heroCount }] = db.select({ value: count() }).from(heroes).all();
      const [{ value: relCount }] = db.select({ value: count() }).from(heroRelationships).all();
      const [{ value: itemCount }] = db.select({ value: count() }).from(items).all();
      const [{ value: emblemCount }] = db.select({ value: count() }).from(emblems).all();
      const [{ value: spellCount }] = db.select({ value: count() }).from(battleSpells).all();

      expect(heroCount).toBe(snapshot.heroes.length);
      expect(relCount).toBe(snapshot.hero_relationships.length);
      expect(itemCount).toBe(snapshot.items.length);
      expect(emblemCount).toBe(snapshot.emblems.length);
      expect(spellCount).toBe(snapshot.battle_spells.length);

      db.$client.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("is idempotent when re-run with the same patch_version", () => {
    const db = createDatabase(":memory:");
    const snapshot = loadCommittedSnapshot();

    const secondRun = ensurePatchKbSeeded(db, snapshot);
    expect(secondRun.seeded).toBe(false);
    expect(secondRun.reason).toBe("up_to_date");
    expect(secondRun.patchVersion).toBe(snapshot.patch_version);

    const [{ value: heroCount }] = db.select({ value: count() }).from(heroes).all();
    expect(heroCount).toBe(snapshot.heroes.length);

    db.$client.close();
  });

  it("upgrades and upserts all tables atomically when patch_version changes", () => {
    const db = createDatabase(":memory:");
    const base = loadCommittedSnapshot();
    const firstHero = base.heroes[0];
    const secondHero = base.heroes[1];
    const firstItem = base.items[0];

    const upgraded: PatchKbSnapshot = {
      ...base,
      patch_version: `${base.patch_version}-next`,
      synced_at: "2026-11-15T00:00:00.000Z",
      rolled_up_meta_summary: "Updated meta summary for patch upgrade test.",
      heroes: base.heroes.map((h) =>
        h.id === firstHero.id
          ? {
              ...h,
              win_rate: 55.5,
              recent_patch_summary: "Buffed base HP and skill scaling.",
            }
          : h,
      ),
      hero_relationships: [
        {
          source_hero_id: firstHero.id,
          target_hero_id: secondHero.id,
          relation_type: "counter",
          win_rate_delta: 4.2,
          rank_tier: "mythic_plus",
          explanation: "Updated matchup after patch buff.",
        },
      ],
      items: base.items.map((item) =>
        item.id === firstItem.id
          ? {
              ...item,
              gold_cost: item.gold_cost + 100,
            }
          : item,
      ),
    };

    const result = ensurePatchKbSeeded(db, upgraded);
    expect(result.seeded).toBe(true);
    expect(result.reason).toBe("version_upgrade");
    expect(result.patchVersion).toBe(upgraded.patch_version);

    const [meta] = db.select().from(patchMeta).all();
    expect(meta.patch_version).toBe(upgraded.patch_version);
    expect(meta.rolled_up_meta_summary).toBe(upgraded.rolled_up_meta_summary);

    const [updatedHero] = db
      .select()
      .from(heroes)
      .where(eq(heroes.id, firstHero.id))
      .all();
    expect(updatedHero.win_rate).toBe(55.5);
    expect(updatedHero.recent_patch_summary).toBe("Buffed base HP and skill scaling.");

    const [updatedItem] = db
      .select()
      .from(items)
      .where(eq(items.id, firstItem.id))
      .all();
    expect(updatedItem.gold_cost).toBe(firstItem.gold_cost + 100);

    // Stale relationships from previous patch should be replaced
    const rels = db.select().from(heroRelationships).all();
    expect(rels).toHaveLength(1);
    expect(rels[0].explanation).toBe("Updated matchup after patch buff.");

    db.$client.close();
  });
});
