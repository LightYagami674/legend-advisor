# Upstream MLBB Sources for Hero Meta Profiles & Core Builds

> Research for [LightYagami674/legend-advisor#21](https://github.com/LightYagami674/legend-advisor/issues/21) (under map [#18](https://github.com/LightYagami674/legend-advisor/issues/18), unblocking [#22](https://github.com/LightYagami674/legend-advisor/issues/22)).

## Conclusion

None of the three upstream MLBB sources used by `patch-kb-sync` provides complete, patch-current, English, all-134-hero strengths, weaknesses, meta identity, and core builds out of the box.

The optimal split is:
1. **Ingest deterministic upstream signals** (stats, ratings, skills, Moonton `relation.{strong,weak,assist}.desc`, `glory` counter/compatibility win-rate deltas and game-time curves, and recent `academy/recommended` + MPL pro builds as reference hints).
2. **Synthesize compact per-hero profiles & core builds with `gemini-3-flash`** during `patch-kb-sync`, validating all item/emblem/spell slugs against `snapshot.json`'s canonical catalogs.
3. **Split `jev-latest` context by endpoint** so `candidate-pick.ts` (up to 134 heroes) only receives ultra-compact `strengths`, `weaknesses`, and `meta_identity`, while `build-recommendation.ts` (max 10 draft heroes) also receives `meta_core_build`.

---

## Primary-Source Findings

### 1. MLBBDex API (`https://mlbbdex.com/api/v1`)

- **Available & reliable across all 134 heroes:**
  - `GET /api/v1/heroes` and `GET /api/v1/heroes/{slug}`: `roles`, `lanes`, `specialties`, `damageType`, `attackType` (`Melee`/`Ranged`), `resource`, `ratings` (`offense`, `durability`, `abilityEffects`, `difficulty`), base/level-15 `stats`, and full `skills` descriptions.
  - `GET /api/v1/rankings`: `tier`, `winRate`, `banRate`, `pickRate`, `score`.
  - `GET /api/v1/patches`: patch version list and links to Fandom Wiki patch notes.
- **Gaps:**
  - `/heroes/{slug}` includes an `analysis` object (`summary`, `strengths`, `weaknesses`, `strongAgainst`, `weakAgainst`, `builds` with `items`, `emblem`, `talent`, `spell`), **but** it is sparsely populated (24 populated vs. 63 `null` across 87 non-error responses in a full-roster probe) and authored in **French** (e.g., `miya`). It cannot be used directly as a universal English source, though it is a useful optional hint when present.

### 2. Rone Arena API (`https://arena.rone.dev/api`)

- **Available & reliable:**
  - `GET /api/heroes/{hero_identifier}`:
    - `data.records[0].data.relation.{assist,strong,weak}.desc`: Moonton's official structured matchup & synergy prose (e.g., Terizla strong vs. light melee fighters, weak vs. high mobility/long range).
    - `hero.data.heroskilllist`: official skill descriptions, cooldowns, and tags.
  - `GET /api/heroes/{hero_identifier}/counters?rank=glory` and `/compatibility?rank=glory`:
    - **Note:** The API rejects `rank=mythic_plus` with `VALIDATION_ERROR`; valid enum values are `all | epic | legend | mythic | honor | glory`.
    - Returns `increase_win_rate` (`win_rate_delta`) plus **game-time win-rate buckets** (`min_win_rate10_12` through `min_win_rate20`), which directly expose early/mid/late power-spike curves.
  - `GET /api/academy/equipment` and `/equipment/expanded`: maps Moonton numeric `equipid` to `equipname` and passives.
- **Gaps & caveats:**
  - `hero.data.recommendmasterplan` returned `[]` (empty) across all sampled heroes (`terizla`, `miya`, `fanny`, `eudora`).
  - `GET /api/academy/heroes/{hero_identifier}/recommended` returns up to 20 UGC builds (`channels: ["UGC", "recommend"]`) with `equips.equip_ids`, `emblems`, `spell`, `dominants`, `counters`, `cooperates`, `vote_all`, and `game_version`. However, entries are player-submitted, noisy, keyed by numeric Moonton IDs, and often lag the active patch (e.g., `game_version: "2.1.18"` vs. `2.2.16` in `data/patch-kb/snapshot.json`).
  - `GET /api/esports/{id,ph,my,kh}/matches/{match_id}` provides accurate pro builds, but only covers heroes picked in MPL matches, not all 134 heroes.

### 3. MLBB Fandom Wiki (`https://mobile-legends.fandom.com/api.php`)

- **Available:** `Module:Hero/data`, `Module:Equipment/data`, and `Patch Notes X.Y.ZZ` pages provide canonical base stats, exact ability scaling numbers, and patch-note diffs when MLBBDex lags.
- **Gaps:** Hero pages (e.g., `Terizla`) contain only `Story`, `Abilities`, `Gallery`, `Trivia`, and `References` — no structured strengths, weaknesses, meta identity, or meta core builds.

---

## What `gemini-3-flash` Should Synthesize vs. Ingest Directly

| Field | Source | Rationale |
| :--- | :--- | :--- |
| `roles`, `lanes`, `damage_type`, `specialty`, `win_rate`, `ban_rate`, `pick_rate` | **Direct ingest** (MLBBDex + Rone Arena `glory`/`mythic`) | Objective telemetry; never synthesize. |
| `hero_relationships` (`counter`, `countered_by`, `synergy`) | **Direct ingest** (`glory`/`mythic` `increase_win_rate`) + `gemini-3-flash` 1-line `explanation` | Grounded in `relation.*.desc` and win-rate delta. |
| `strengths` (2–3 short tags/phrases) | **`gemini-3-flash` synthesis** | Distilled from skills, ratings, `relation.strong.desc`, and time-bucketed win rates. |
| `weaknesses` (2–3 short tags/phrases) | **`gemini-3-flash` synthesis** | Distilled from `relation.weak.desc`, top `glory` counters, and kit gaps (e.g., immobile, anti-heal-vulnerable). |
| `meta_identity` (1 concise phrase/sentence) | **`gemini-3-flash` synthesis** | Captures power spike (early/mid/late), win condition, and current-patch draft role. |
| `meta_core_build` (`core_items`, `boots`, `emblem`, `talents`, `battle_spell`) | **`gemini-3-flash` synthesis** grounded in top-voted `academy/recommended` + MPL/MLBBDex hints + `Patch Notes`, **validated against `snapshot.json` slugs** | Eliminates stale/noisy UGC builds and guarantees every slug exists in `items`, `emblems`, and `battle_spells`. |

---

## Budget Analysis: `snapshot.json` & `jev-latest` Context

- **Current baseline (`data/patch-kb/snapshot.json`):** `95,395` bytes across `134` heroes (avg `311.1` bytes/hero), `26` relationships, `35` items, `7` emblems, `12` battle spells.
- **Projected `snapshot.json` growth:** Adding ~300–450 bytes/hero for `strengths`, `weaknesses`, `meta_identity`, and `meta_core_build` adds ~40–60 KB total (~140–155 KB total), keeping `snapshot.json` compact and fast to seed.
- **`jev-latest` context strategy (per [#18](https://github.com/LightYagami674/legend-advisor/issues/18)):**
  - **`lib/recommendations/candidate-pick.ts`:** Pass only `strengths` (2–3 short phrases), `weaknesses` (2–3 short phrases), and `meta_identity` on `eligible_heroes` and picked `ally_picks`/`enemy_picks`. **Omit `meta_core_build`** here (avoids ~20 KB of irrelevant item lists across up to 134 eligible heroes).
  - **`lib/recommendations/build-recommendation.ts`:** Pass `strengths`, `weaknesses`, `meta_identity`, **and** `meta_core_build` for `target_ally_slot.hero`, `ally_team`, and `enemy_team` (at most 10 heroes total), enabling `jev-latest` to match enemy core items/threats (e.g., crit, high heal, magic burst, shields) to counter-items.
