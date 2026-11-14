# Mobile Legends: Bang Bang (MLBB) Data Sources & Patch Knowledge Base Ingestion

**Issue:** [#4 — Mobile Legends hero, item, emblem, and patch notes data sources](https://github.com/LightYagami674/legend-advisor/issues/4)  
**Date:** 2026-11-14

## Executive Summary

Moonton does **not** publish an official, developer-documented public REST API for *Mobile Legends: Bang Bang* (MLBB). However, Moonton's official web properties (`mobilelegends.com` and MLBB Academy) pull live telemetry—including hero roles, lanes, win/pick/ban rates, counter-pick scores, teammate synergy scores, recommended equipment/emblem/spell builds, and patch notes—from Moonton's first-party Game Mobile Service (`api.gms.moontontech.com`). Meanwhile, static game encyclopedia definitions (base attributes, skill multipliers, item passives, emblem talent trees, battle spell cooldowns, and structured patch change histories) are canonically maintained in Lua data modules on the **Mobile Legends: Bang Bang Fandom Wiki** (`Module:Hero/data`, `Module:Equipment/data`) and **Liquipedia MLBB**.

Two actively maintained open-source community APIs—**Rone Arena API** (`ridwaanhall/rone-arena-api`, hosted at `arena.rone.dev`) and **MLBBDex API** (`achedon12/mlbb`, hosted at `mlbbdex.com/api/v1`)—already wrap and normalize both Moonton's GMS endpoints and the Fandom Wiki modules into clean, unauthenticated JSON endpoints.

For Legend Advisor's local **`Patch Knowledge Base`**, the most maintainable architecture is an **offline-first, repository-committed JSON snapshot** (`data/patch-kb/`) updated via an on-demand CLI ingestion script (`scripts/sync-patch-kb`) that merges static definitions from MLBBDex / Fandom Wiki with live meta counters, synergies, and builds from Rone Arena / Moonton GMS, plus an LLM-assisted patch-note parser that converts raw patch texts into structured balance deltas (`buff` / `nerf` / `adjusted`).

---

## 1. Primary & Upstream Data Sources

### 1.1 Moonton First-Party GMS Endpoints (`api.gms.moontontech.com`)

Moonton's official website (`m.mobilelegends.com`) and the official MLBB Academy portal fetch data from an internal Content & Telemetry Gateway at `https://api.gms.moontontech.com/api/gms/source/{source_id}/{resource_id}`.

* **What it owns (Primary Source):**
  * **Hero Meta Telemetry:** Official win rate, pick rate, and ban rate segmented by rank tier (e.g., Mythic, Mythical Glory+) and timeframe.
  * **Counters & Synergies (`hero_relation` & matchup win-rate deltas):**
    * *Explicit Qualitative Relationships:* Each hero profile defines `assist` (Best Teammates / synergies), `strong` (Heroes they counter), and `weak` (Heroes they are countered by), paired with official explanatory text describing *why* the interaction works.
    * *Quantitative Matchup Matrices:* Empirical win-rate deltas when playing *against* specific enemy heroes (counter score) or *with* specific ally heroes (compatibility/synergy score).
  * **Official Academy Catalog:** Recommended lane assignments (`Gold Lane`, `EXP Lane`, `Mid Lane`, `Jungling`, `Roaming`), pro/top-player recommended Equipment sets, Emblem talent setups, and Battle Spells per hero.
  * **Official Patch Notes Announcements:** In-game/web CMS announcements for each patch version.
* **Constraints & Reliability:**
  * Undocumented internal POST/GET endpoints requiring specific JSON filter payloads and standard browser `User-Agent` / `Referer` headers to pass Aliyun WAF.
  * Internal `source_id` / `resource_id` paths (e.g., `2669606/...`) occasionally rotate when Moonton revamps its web frontend.
* **Citations:**
  * Moonton Official Portal & Academy: `https://m.mobilelegends.com/`
  * Documented upstream GMS mappings in `ridwaanhall/mlbb-api-docs` (`https://github.com/ridwaanhall/mlbb-api-docs`) and `ridwaanhall/rone-arena-api` (`https://github.com/ridwaanhall/rone-arena-api`).

### 1.2 Mobile Legends Fandom Wiki (`mobile-legends.fandom.com`)

The MLBB Fandom Wiki is the most exhaustive structured encyclopedia for static game mechanics, maintained via MediaWiki Scribunto Lua data modules and accessible via `https://mobile-legends.fandom.com/api.php`.

* **What it owns:**
  * **`Module:Hero/data`:** Canonical hero catalog keyed by hero ID/name, including `id`, `name`, `role1`, `role2` (`Tank`, `Fighter`, `Assassin`, `Mage`, `Marksman`, `Support`), `specialty1`, `specialty2` (`Burst`, `Charge`, `Crowd Control`, `Regen`, `Poke`, `Finisher`, `Damage`, `Magic Damage`, `Mixed Damage`), `lane1`, `lane2`, `durability` / `offense` / `skill_effects` / `difficulty` ratings, and level 1–15 scaling `stats` (`hp`, `phys_atk`, `phys_def`, `mag_def`, `move_spd`, etc.).
  * **`Module:Equipment/data`:** Complete item catalog keyed by equipment name, containing `type` (`Attack`, `Magic`, `Defense`, `Movement`, `Roaming`, `Jungling`), `price`, `upgrade_price`, `bonus` (stat modifiers), `unique` (unique attribute strings), `passive` (named passive descriptions, cooldowns, and scaling formulas), and `recipe` (component item build tree).
  * **Emblems & Battle Spells (`Emblems`, `Battle Spells` wiki pages / modules):** Full specifications for the 7 revamped Emblem sets (`Common`, `Tank`, `Assassin`, `Mage`, `Fighter`, `Support`, `Marksman`—base hybrid/adaptive attributes) and the 3-tier Talent system (Tier 1 Basic Talents like *Rupture*, *Firmness*, *Agility*; Tier 2 Talents like *Tenacity*, *Master Assassin*, *Wilderness Blessing*, *Bargain Hunter*; Tier 3 Core Talents like *Killing Spree*, *Lethal Ignition*, *Impure Rage*, *Concussive Blast*, *Quantum Charge*, *Temporal Reign*, *War Cry*), plus all 12 Battle Spells (*Retribution*, *Flicker*, *Execute*, *Inspire*, *Sprint*, *Revitalize*, *Aegis*, *Petrify*, *Purify*, *Flameshot*, *Arrival*, *Vengeance*) with cooldowns and effects.
  * **Patch Notes Archive (`Patch Notes X.Y.ZZ`):** Complete historical and current patch notes separated into New/Revamped Heroes, Hero Adjustments (labeled with `[↑]` Buff, `[↓]` Nerf, `[~]` Adjusted), Battlefield Adjustments, and Equipment/Emblem Changes.
* **Constraints & Reliability:**
  * MediaWiki Action API (`?action=query&prop=revisions&rvprop=content&titles=Module:Hero/data&format=json`) is public, requires no auth, and is licensed under `CC BY-SA`.
  * Requires a lightweight Lua-table-to-JSON parser (or consumption via MLBBDex, which parses it nightly).
* **Citations:**
  * MLBB Wiki Module:Hero/data: `https://mobile-legends.fandom.com/wiki/Module:Hero/data`
  * MLBB Wiki Module:Equipment/data: `https://mobile-legends.fandom.com/wiki/Module:Equipment/data`
  * MLBB Wiki Emblems & Battle Spells: `https://mobile-legends.fandom.com/wiki/Emblems`, `https://mobile-legends.fandom.com/wiki/Battle_Spells`

### 1.3 Liquipedia MLBB (`liquipedia.net/mobilelegends`)

Liquipedia runs on MediaWiki (`https://liquipedia.net/mobilelegends/api.php`) and maintains structured templates for competitive MLBB esports and patches (`Category:Patches`).

* **What it owns:**
  * Clean, standardized wikitext templates for patch notes (`Patch_X.Y.ZZ`), item summaries, and competitive tournament pick/ban statistics (MPL, M-Series).
* **Constraints & Reliability:**
  * Strict API usage policy: requires a descriptive custom `User-Agent` header and enforces rate limits (max 1 request per 2 seconds; `action=parse` max 1 request per 30 seconds).
  * Less granular on raw hero/item/emblem numerical modifiers than the Fandom Wiki's Lua modules.
* **Citations:**
  * Liquipedia MLBB Portal: `https://liquipedia.net/mobilelegends/Main_Page`
  * Liquipedia API Terms of Use: `https://liquipedia.net/api-terms-of-use`

---

## 2. Community REST APIs & Open-Source Datasets on GitHub

Rather than reverse-engineering Moonton's WAF headers or writing a custom Lua parser from scratch, two open-source community projects already aggregate these primary sources into clean REST APIs and repositories:

### 2.1 Rone Arena API (`ridwaanhall/rone-arena-api`)

* **Repository:** `https://github.com/ridwaanhall/rone-arena-api` (Docs: `https://github.com/ridwaanhall/mlbb-api-docs`, Live Base URL: `https://arena.rone.dev`)
* **Architecture:** FastAPI (Python) wrapper over Moonton's official GMS & Academy endpoints, with OpenAPI 3.0 schemas and official Python (`OpenMLBB`) / TypeScript (`mlbb-sdk`) SDKs.
* **Coverage across Legend Advisor needs:**
  * **Heroes & Roles/Lanes:** Hero metadata, official role/lane distributions, skill combos, and stat ratings.
  * **Counters & Synergies:** Direct access to Moonton's qualitative hero relationships (`assist`, `strong`, `weak`) AND quantitative matchup win-rate matrices (counter scores and teammate compatibility scores across rank tiers).
  * **Equipment, Emblems & Battle Spells:** Exposed under the `/api/.../academy` service group (items, emblems, spells, recommended hero builds).
  * **Rankings & Meta Strength:** Live win, pick, and ban rates segmented by rank (e.g., Mythic, Mythical Glory) and timeframe.

### 2.2 MLBBDex (`achedon12/mlbb` / `mlbbdex.com`)

* **Repository:** `https://github.com/achedon12/mlbb` (Live Base URL: `https://mlbbdex.com/api/v1`)
* **Architecture:** Open-source web platform and no-auth public JSON API that automatically syncs nightly from the Mobile Legends Fandom Wiki (`Module:Hero/data`, `Module:Equipment/data`, patch pages) and Rone Arena (`arena.rone.dev`).
* **Endpoints:**
  * `GET /api/v1/heroes` & `GET /api/v1/heroes/{slug}` — Full hero profile, roles, lanes, specialties, base stats, skills, and meta analysis.
  * `GET /api/v1/items` (`?category=Attack|Magic|Defense|Movement|Jungling|Roaming`) — Shop items with stats, unique passives, gold cost, and crafting recipes.
  * `GET /api/v1/patches` — Chronological game versions and patch notes.
  * `GET /api/v1/rankings` — Calculated tier rankings, win rates, ban rates, and pick rates.

### 2.3 Static JSON Datasets (`p3hndrx/MLBB-API`)

* **Repository:** `https://github.com/p3hndrx/MLBB-API`
* **Coverage:** Static JSON schema files (`hero-meta.json`, `item-meta.json`, `emblem-meta.json`) originally built for *MLBB-EquipmentPlanner*. Useful as a reference for JSON schema design of numerical stat modifiers, though updated less frequently than MLBBDex and Rone Arena.

---

## 3. Data Coverage Matrix by Domain Concept

| Patch Knowledge Base Entity | Authoritative Primary Source | Best Structured API / Feed | Key Fields Needed for `Candidate Pick` & `Build Recommendation` |
| :--- | :--- | :--- | :--- |
| **Heroes** (Roles, Lanes, Damage Types, Specialties) | Fandom Wiki (`Module:Hero/data`) & Moonton Academy | `mlbbdex.com/api/v1/heroes/{slug}` + `arena.rone.dev` | `id`, `slug`, `name`, `roles` (`Tank`, `Fighter`, `Assassin`, `Mage`, `Marksman`, `Support`), `lanes` (`EXP`, `Gold`, `Mid`, `Jungle`, `Roam`), `damageType` (`Physical`, `Magic`, `Mixed`, `True`), `specialties` (`Burst`, `CC`, `Regen`, `Poke`, `Initiator`) |
| **Counters & Synergies** | Moonton GMS (`hero_relation` & matchup telemetry) | `arena.rone.dev` (Heroes relation & counter/compatibility endpoints) | Qualitative `counters` / `counteredBy` / `synergies` (with official interaction reasons) + quantitative matchup win-rate deltas & rank-filtered pick/ban/win rates |
| **Equipment Items** | Fandom Wiki (`Module:Equipment/data`) & Moonton Academy | `mlbbdex.com/api/v1/items` + `arena.rone.dev` (Academy equipment) | `id`, `name`, `category` (`Attack`, `Magic`, `Defense`, `Movement`, `Roaming`, `Jungling`), `price`, `stats`, `uniquePassive` (tagged by function: e.g., `anti-heal`, `magic-burst-shield`, `true-damage-hp`, `percent-penetration`), `recipe` |
| **Emblems & Talents** | Fandom Wiki (`Emblems`) & Moonton Academy | `arena.rone.dev` (Academy emblems) + curated static JSON | 7 Emblem bases (`Common`, `Tank`, `Assassin`, `Mage`, `Fighter`, `Support`, `Marksman`) + Tier 1 (8 talents), Tier 2 (8 talents), Tier 3 Core (8 talents) with stat/effect descriptions |
| **Battle Spells** | Fandom Wiki (`Battle Spells`) & Moonton Academy | `arena.rone.dev` (Academy spells) + curated static JSON | 12 Battle Spells (`Retribution` [Ice/Flame/Bloody], `Flicker`, `Execute`, `Inspire`, `Sprint`, `Revitalize`, `Aegis`, `Petrify`, `Purify`, `Flameshot`, `Arrival`, `Vengeance`) with cooldowns and counter-tags (e.g., `Purify` vs heavy CC, `Vengeance` vs DPS marksmen) |
| **Patch Balance Adjustments** | Fandom Wiki (`Patch Notes X.Y.ZZ`) & Moonton GMS CMS | `mlbbdex.com/api/v1/patches` + MediaWiki API `mobile-legends.fandom.com/api.php` | `patchVersion`, `releaseDate`, `heroAdjustments` (`heroId`, `direction`: `buff` \| `nerf` \| `adjusted`, `summary`), `itemAdjustments`, `emblemAdjustments` |

---

## 4. Recommended Architecture to Seed & Update the Local `Patch Knowledge Base`

### Why Not Query External APIs at Runtime?
1. **Latency & Reliability:** During a live `Draft Session`, `Candidate Pick` and `Build Recommendation` queries must resolve immediately. Depending on third-party community servers (`arena.rone.dev`, `mlbbdex.com`) or Moonton's WAF-protected GMS endpoints in the request path introduces availability risk and network latency.
2. **Domain Enrichment:** Raw item descriptions (e.g., *"Reduces shield and HP regen of target by 50%"* on Dominance Ice / Sea Halberd / Glowing Wand) and hero kit traits (e.g., *"High HP Regen"*, *"Suppress CC"*, *"Dash-reliant"*) benefit from deterministic domain tags (`anti-heal`, `anti-shield`, `suppress`, `anti-dash`) stored directly in the local `Patch Knowledge Base` so the recommendation engine and LLM have clean, high-signal context.

### Maintainable 3-Stage Ingestion Pipeline (`scripts/sync-patch-kb`)

Store the `Patch Knowledge Base` as **versioned, schema-validated JSON files** committed to the repository (e.g., `data/patch-kb/heroes.json`, `items.json`, `emblems.json`, `spells.json`, `patch-notes.json`, and `meta-snapshot.json`) and validated at build/startup time with TypeScript/Zod schemas.

1. **Stage 1 — Base Catalog Sync (Automated CLI Script):**
   * Pull hero and equipment definitions from **MLBBDex API** (`https://mlbbdex.com/api/v1/heroes`, `/api/v1/items`), with direct fallback to the **MLBB Fandom Wiki MediaWiki API** (`Module:Hero/data`, `Module:Equipment/data`).
   * Keep **Emblems** (7 bases + 24 talents) and **Battle Spells** (12 spells) in a curated local JSON file synced against **Rone Arena's Academy endpoints**, as emblems and spells rarely change structurally between seasons.
2. **Stage 2 — Meta, Counters & Synergies Sync (Automated CLI Script):**
   * Query **Rone Arena API** (`arena.rone.dev`)—or directly query Moonton's GMS endpoint with browser headers as a fallback—to update each hero's rank-filtered win/pick/ban rate, official `assist` / `strong` / `weak` relations, and empirical counter/synergy matchup scores.
3. **Stage 3 — Patch Notes Ingestion & Semantic Tagging (LLM-Assisted CLI Step):**
   * Fetch the latest patch notes via `GET https://mlbbdex.com/api/v1/patches` or `mobile-legends.fandom.com/api.php` (`Patch Notes X.Y.ZZ`).
   * Run a one-time build-time LLM extraction pass (structured output schema) over the new patch notes to produce:
     * Per-hero balance delta (`buff`, `nerf`, `adjusted`, `revamp`) + concise 1-sentence tactical summary (e.g., *"Buffed early-game Skill 1 base damage and reduced Ultimate cooldown"*).
     * Per-item / emblem stat or passive updates, preserving semantic counter-tags (`anti-heal`, `magic-defense-burst`, `physical-penetration`, `true-damage`).
   * Output a clean git diff in `data/patch-kb/` for human review and commit whenever a new MLBB patch drops (roughly every 3–5 weeks) or when meta rankings are refreshed.
