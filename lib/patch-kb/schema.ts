import { z } from "zod";

export const HeroRoleSchema = z.enum([
  "Tank",
  "Fighter",
  "Assassin",
  "Mage",
  "Marksman",
  "Support",
]);

export const LaneSchema = z.enum(["EXP", "Jungle", "Mid", "Gold", "Roam"]);

export const DamageTypeSchema = z.enum(["physical", "magic", "mixed", "true"]);

export const RelationTypeSchema = z.enum(["counter", "countered_by", "synergy"]);

export const RankTierSchema = z.literal("mythic_plus");

export const ItemCategorySchema = z.enum([
  "Attack",
  "Magic",
  "Defense",
  "Movement",
  "Jungling",
  "Roaming",
]);

export const HeroSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  roles: z.array(HeroRoleSchema).min(1),
  lanes: z.array(LaneSchema).min(1),
  damage_type: DamageTypeSchema,
  specialty: z.array(z.string().min(1)).min(1),
  win_rate: z.number().min(0).max(100),
  ban_rate: z.number().min(0).max(100),
  pick_rate: z.number().min(0).max(100),
  recent_patch_summary: z.string().min(1),
});

export const HeroRelationshipSnapshotSchema = z.object({
  source_hero_id: z.number().int().positive(),
  target_hero_id: z.number().int().positive(),
  relation_type: RelationTypeSchema,
  win_rate_delta: z.number(),
  rank_tier: RankTierSchema,
  explanation: z.string().min(1),
});

export const ItemSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  category: ItemCategorySchema,
  gold_cost: z.number().int().nonnegative(),
  stats_json: z.record(z.string(), z.number()),
  unique_passive: z.string().min(1),
  semantic_tags_json: z.array(z.string().min(1)),
});

export const EmblemTalentSchema = z.object({
  name: z.string().min(1),
  effect: z.string().min(1),
});

export const EmblemSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  role_fit: z.array(HeroRoleSchema).min(1),
  attributes_json: z.record(z.string(), z.number()),
  talents_json: z.object({
    tier1: z.array(EmblemTalentSchema).min(1),
    tier2: z.array(EmblemTalentSchema).min(1),
    tier3: z.array(EmblemTalentSchema).min(1),
  }),
});

export const BattleSpellSnapshotSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1),
  cooldown_sec: z.number().int().positive(),
  effect: z.string().min(1),
  semantic_tags_json: z.array(z.string().min(1)),
});

export const PatchKbSnapshotSchema = z
  .object({
    patch_version: z.string().min(1),
    synced_at: z.string().min(1),
    rolled_up_meta_summary: z.string().min(1),
    heroes: z.array(HeroSnapshotSchema).min(1),
    hero_relationships: z.array(HeroRelationshipSnapshotSchema),
    items: z.array(ItemSnapshotSchema).min(1),
    emblems: z.array(EmblemSnapshotSchema).min(1),
    battle_spells: z.array(BattleSpellSnapshotSchema).min(1),
  })
  .superRefine((snapshot, ctx) => {
    const heroIds = new Set(snapshot.heroes.map((h) => h.id));
    snapshot.hero_relationships.forEach((rel, index) => {
      if (!heroIds.has(rel.source_hero_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["hero_relationships", index, "source_hero_id"],
          message: `Unknown source_hero_id ${rel.source_hero_id}`,
        });
      }
      if (!heroIds.has(rel.target_hero_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["hero_relationships", index, "target_hero_id"],
          message: `Unknown target_hero_id ${rel.target_hero_id}`,
        });
      }
    });
  });

export type PatchKbSnapshot = z.infer<typeof PatchKbSnapshotSchema>;
