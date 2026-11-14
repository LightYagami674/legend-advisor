---
name: patch-kb-sync
description: Sync Mobile Legends: Bang Bang (MLBB) Patch Knowledge Base data from upstream community APIs and wiki sources, summarize patch changes with gemini-3-flash, validate against PatchKbSnapshotSchema, and update data/patch-kb/snapshot.json.
---

# Patch Knowledge Base Sync (`patch-kb-sync`)

Use this skill when a new Mobile Legends: Bang Bang (MLBB) patch drops or when refreshing `data/patch-kb/snapshot.json` with updated Mythic+ win/ban/pick rates, hero relationships, items, emblems, and battle spells.

Runtime SQLite seeding is automatic and lazy via `ensurePatchKbSeeded` in `lib/patch-kb/seed.ts` (invoked by `createDatabase` / `getDb` in `db/index.ts`). Do **not** create standalone `kb:seed` or `kb:sync` CLI scripts.

## Workflow

### 1. Fetch Upstream MLBB Data
Gather raw data from the primary community sources (in priority order):
1. **MLBBDex API** (`https://mlbbdex.com/api/v1`, no-auth JSON):
   - `GET /api/v1/heroes` and `GET /api/v1/heroes/{slug}` for hero roles, lanes, specialties, and damage types.
   - `GET /api/v1/items?category=Attack|Magic|Defense|Movement|Jungling|Roaming` for completed tier-3 equipment, boots, jungling blessings, and roaming blessings.
   - `GET /api/v1/patches` for current `patch_version` and raw patch notes.
   - `GET /api/v1/rankings` for hero win, ban, and pick rates.
2. **Rone Arena API** (`https://arena.rone.dev`):
   - Fetch `mythic_plus` rank-tier telemetry (`win_rate_delta` and `hero_relation` entries for `counter`, `countered_by`, and `synergy`).
   - Only ingest `rank_tier: "mythic_plus"` relationships; discard lower-rank tiers.
3. **MLBB Fandom Wiki** (`https://mobile-legends.fandom.com/api.php`, fallback / verification):
   - Query `Module:Hero/data`, `Module:Equipment/data`, and `Patch Notes X.Y.ZZ` pages if MLBBDex is lagging behind the latest patch.
   - Cross-check the 7 Emblems (with Tier 1 / Tier 2 / Tier 3 talents) and 12 Battle Spells.

### 2. Summarize Patch Changes & Tag Semantics (`gemini-3-flash`)
Use `gemini-3-flash` (via `@ai-sdk/google` or Google AI Studio) to:
1. Synthesize `rolled_up_meta_summary`: a concise 2–3 sentence summary of the active patch's macro meta, priority roles, and counter-build themes.
2. Synthesize per-hero `recent_patch_summary`: a 1-sentence tactical summary of each hero's current patch standing, buffs/nerfs, and draft role.
3. Assign normalized `semantic_tags_json` to items and battle spells (e.g., `anti-heal`, `anti-shield`, `armor-pen`, `magic-pen`, `anti-burst`, `stasis`, `cc-reduction`, `hp-shred`, `anti-attack-speed`, `roam-blessing`, `jungle-blessing`).

### 3. Validate with Zod (`PatchKbSnapshotSchema`)
Before writing `data/patch-kb/snapshot.json`, validate the assembled JSON object against `PatchKbSnapshotSchema` in `lib/patch-kb/schema.ts`:
- `patch_version` is updated to the new patch string (e.g., `"1.9.34"`), which triggers automatic atomic upsert in SQLite on next app startup via `ensurePatchKbSeeded`.
- `synced_at` is an ISO-8601 UTC timestamp.
- All 5 lanes (`EXP`, `Jungle`, `Mid`, `Gold`, `Roam`) are covered.
- All `hero_relationships` have `rank_tier: "mythic_plus"` and reference valid hero IDs present in `heroes`.
- All 6 item categories (`Attack`, `Magic`, `Defense`, `Movement`, `Jungling`, `Roaming`), 7 emblems (with `tier1`, `tier2`, `tier3` talents), and 12 battle spells are present.

### 4. Write Snapshot & Verify
1. Write the validated JSON to `data/patch-kb/snapshot.json` (formatted with 2-space indentation).
2. Run verification in the repo root:
   ```bash
   bun test
   bunx tsc --noEmit
   bun run lint
   ```
3. Commit `data/patch-kb/snapshot.json`. No manual DB migration or seed command is required; `getDb()` will detect the new `patch_version` and upsert all Patch Knowledge Base tables atomically on next boot.
