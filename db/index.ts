import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { ensurePatchKbSeeded } from "@/lib/patch-kb/seed";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof createDatabase>;

export interface CreateDatabaseOptions {
  autoSeed?: boolean;
}

const PATCH_KB_DDL = `
  CREATE TABLE IF NOT EXISTS patch_meta (
    id INTEGER PRIMARY KEY,
    patch_version TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    rolled_up_meta_summary TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS heroes (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    roles TEXT NOT NULL,
    lanes TEXT NOT NULL,
    damage_type TEXT NOT NULL,
    specialty TEXT NOT NULL,
    win_rate REAL NOT NULL,
    ban_rate REAL NOT NULL,
    pick_rate REAL NOT NULL,
    recent_patch_summary TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hero_relationships (
    source_hero_id INTEGER NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
    target_hero_id INTEGER NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    win_rate_delta REAL NOT NULL,
    rank_tier TEXT NOT NULL,
    explanation TEXT NOT NULL,
    PRIMARY KEY (source_hero_id, target_hero_id, relation_type, rank_tier)
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    gold_cost INTEGER NOT NULL,
    stats_json TEXT NOT NULL,
    unique_passive TEXT NOT NULL,
    semantic_tags_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emblems (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role_fit TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    talents_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS battle_spells (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    cooldown_sec INTEGER NOT NULL,
    effect TEXT NOT NULL,
    semantic_tags_json TEXT NOT NULL
  );
`;

/**
 * Creates an isolated SQLite + Drizzle database instance, ensures all Patch KB
 * tables exist, and lazily seeds from the committed snapshot by default.
 */
export function createDatabase(
  dbPath: string = ":memory:",
  options: CreateDatabaseOptions = {},
) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON;");
  if (dbPath !== ":memory:") {
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  sqlite.exec(PATCH_KB_DDL);

  const db = drizzle(sqlite, { schema });

  if (options.autoSeed !== false) {
    ensurePatchKbSeeded(db);
  }

  return db;
}

const DEFAULT_DB_PATH = join(process.cwd(), "data", "legend-advisor.db");
let singletonDb: AppDatabase | null = null;

/**
 * Returns the process-wide SQLite database instance, lazily initializing and
 * seeding it on first access.
 */
export function getDb(): AppDatabase {
  if (!singletonDb) {
    const dbPath = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;
    singletonDb = createDatabase(dbPath);
  }
  return singletonDb;
}
