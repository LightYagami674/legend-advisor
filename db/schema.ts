import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type HeroRole =
  | "Tank"
  | "Fighter"
  | "Assassin"
  | "Mage"
  | "Marksman"
  | "Support";

export type Lane = "EXP" | "Jungle" | "Mid" | "Gold" | "Roam";

export type DamageType = "physical" | "magic" | "mixed" | "true";

export type RelationType = "counter" | "countered_by" | "synergy";

export type RankTier = "mythic_plus";

export type ItemCategory =
  | "Attack"
  | "Magic"
  | "Defense"
  | "Movement"
  | "Jungling"
  | "Roaming";

export interface EmblemTalent {
  name: string;
  effect: string;
}

export interface EmblemTalents {
  tier1: EmblemTalent[];
  tier2: EmblemTalent[];
  tier3: EmblemTalent[];
}

export const patchMeta = sqliteTable("patch_meta", {
  id: integer("id").primaryKey(),
  patch_version: text("patch_version").notNull(),
  synced_at: text("synced_at").notNull(),
  rolled_up_meta_summary: text("rolled_up_meta_summary").notNull(),
});

export const heroes = sqliteTable("heroes", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  roles: text("roles", { mode: "json" }).$type<HeroRole[]>().notNull(),
  lanes: text("lanes", { mode: "json" }).$type<Lane[]>().notNull(),
  damage_type: text("damage_type").$type<DamageType>().notNull(),
  specialty: text("specialty", { mode: "json" }).$type<string[]>().notNull(),
  win_rate: real("win_rate").notNull(),
  ban_rate: real("ban_rate").notNull(),
  pick_rate: real("pick_rate").notNull(),
  recent_patch_summary: text("recent_patch_summary").notNull(),
});

export const heroRelationships = sqliteTable(
  "hero_relationships",
  {
    source_hero_id: integer("source_hero_id")
      .notNull()
      .references(() => heroes.id, { onDelete: "cascade" }),
    target_hero_id: integer("target_hero_id")
      .notNull()
      .references(() => heroes.id, { onDelete: "cascade" }),
    relation_type: text("relation_type").$type<RelationType>().notNull(),
    win_rate_delta: real("win_rate_delta").notNull(),
    rank_tier: text("rank_tier").$type<RankTier>().notNull(),
    explanation: text("explanation").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.source_hero_id,
        table.target_hero_id,
        table.relation_type,
        table.rank_tier,
      ],
    }),
  ],
);

export const items = sqliteTable("items", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").$type<ItemCategory>().notNull(),
  gold_cost: integer("gold_cost").notNull(),
  stats_json: text("stats_json", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  unique_passive: text("unique_passive").notNull(),
  semantic_tags_json: text("semantic_tags_json", { mode: "json" })
    .$type<string[]>()
    .notNull(),
});

export const emblems = sqliteTable("emblems", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role_fit: text("role_fit", { mode: "json" }).$type<HeroRole[]>().notNull(),
  attributes_json: text("attributes_json", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  talents_json: text("talents_json", { mode: "json" })
    .$type<EmblemTalents>()
    .notNull(),
});

export const battleSpells = sqliteTable("battle_spells", {
  id: integer("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  cooldown_sec: integer("cooldown_sec").notNull(),
  effect: text("effect").notNull(),
  semantic_tags_json: text("semantic_tags_json", { mode: "json" })
    .$type<string[]>()
    .notNull(),
});

export type DraftPhase = "ban" | "pick" | "locked";

export type DraftSessionStatus = "active" | "locked" | "completed";

export type DraftTeam = "ally" | "enemy";

export const draftSessions = sqliteTable("draft_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patch_version: text("patch_version").notNull(),
  phase: text("phase").$type<DraftPhase>().notNull().default("ban"),
  my_slot_index: integer("my_slot_index").notNull().default(1),
  active_target_slot_index: integer("active_target_slot_index")
    .notNull()
    .default(1),
  status: text("status").$type<DraftSessionStatus>().notNull().default("active"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const draftSlots = sqliteTable(
  "draft_slots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    session_id: integer("session_id")
      .notNull()
      .references(() => draftSessions.id, { onDelete: "cascade" }),
    team: text("team").$type<DraftTeam>().notNull(),
    slot_index: integer("slot_index").notNull(),
    role: text("role").$type<Lane>(),
    banned_hero_id: integer("banned_hero_id").references(() => heroes.id, {
      onDelete: "set null",
    }),
    picked_hero_id: integer("picked_hero_id").references(() => heroes.id, {
      onDelete: "set null",
    }),
    is_locked: integer("is_locked", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex("draft_slots_session_team_slot_idx").on(
      table.session_id,
      table.team,
      table.slot_index,
    ),
  ],
);
