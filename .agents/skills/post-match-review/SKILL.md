---
name: post-match-review
description: Inspect saved Mobile Legends: Bang Bang (MLBB) Post-Match Review scoreboard and optional Data-tab screenshots, reconcile intra-team hero swaps non-destructively against the Draft Session, write analysis_markdown, handle teammate_driven_loss without profiling teammates, and commit user-confirmed Failure Patterns to Player Profile.
---

# Post-Match Review (`post-match-review`)

Use this skill when the user asks to review a pending `Post-Match Review` submitted in Legend Advisor.

All analysis is strictly personal to `My Slot`. Never create or store `Player Profile` or `Failure Pattern` records for allies or enemies.

## Workflow

### 1. Load Review, Draft Session, and Player Profile Context
1. Fetch the pending `Post-Match Review` via `GET /api/post-match-reviews` (or `GET /api/post-match-reviews/{id}`).
2. Load the linked `Draft Session` (`GET /api/draft-sessions/{draft_session_id}`), including all 10 `Draft Slot`s, `my_slot_index`, and any saved `Candidate Pick` / `Build Recommendation` records.
3. Load the user's `Player Profile` (`GET /api/player-profile`) to see existing `hero_comfort_pool` and active `failure_patterns`.
4. Read the saved primary Scoreboard screenshot from `data/uploads/{screenshot_path}` (and the optional Data-tab screenshot from `data/uploads/{secondary_screenshot_path}` when present) using your vision/file-reading capability.

### 2. Visual Inspection Checklist
Extract and verify all visible facts directly from the saved image(s) before writing analysis:

**Primary Scoreboard Screenshot**:
- **Match metadata**: Match duration (`MM:SS`), outcome (Defeat / Victory), and Ally vs. Enemy total kill score.
- **Objectives**: Turret, Lord, and Turtle counts for both teams.
- **Per-player rows (all 10 players)**:
  - Hero portrait (carefully distinguish alternate/collector/collab skin portraits)
  - Battle Spell
  - 6-item build (completed tier-3 items or partial components)
  - `K / D / A`
  - Total Gold and derived `goldPerMin` (`totalGold / durationMinutes`)
  - Post-match rating / medal (MVP, Gold, Silver, Bronze)
  - Highlighted user row corresponding to `My Slot`

**Optional Data-Tab Screenshot** (when `secondary_screenshot_path` is present):
- Hero Damage %
- Teamfight Participation %
- Damage Taken %
- Turret Damage %

### 3. Non-Destructive `Draft Session` Swap Reconciliation
- Compare the 5 Ally heroes and 5 Enemy heroes on the final Scoreboard against the logged `Draft Session` (`draft_slots`).
- If players swapped heroes within a team after the pick phase (e.g., Ally 1 and Ally 3 traded heroes), **silently reconcile** the swap in your analysis so `My Slot` is evaluated on the hero and role actually played in the match.
- **Never** mutate historical `draft_slots` pick/ban order in the database.

### 4. Ambiguity-Only User Clarification Rule
- Ask the user in chat **only** when `My Slot`'s hero or a skin portrait is genuinely ambiguous and cannot be identified with high confidence from the screenshot and `Draft Session` context.
- If the screenshot is clear, proceed directly without unnecessary clarification prompts.

### 5. Diagnose Performance & `teammate_driven_loss` Handling
- Evaluate the match strictly from `My Slot`'s perspective, incorporating `user_reflection` if provided.
- **Teammate-Driven Loss (`teammate_driven_loss = true`)**:
  - If teammates clearly caused an unwinnable loss (e.g., AFK, intentional feeding, or severe early-game collapse across other lanes while `My Slot` maintained solid farm, positioning, and itemization), mark `teammate_driven_loss = true`.
  - Record **0 personal faults** (`confirmed_patterns: []`).
  - Do **not** profile teammates or store any `Failure Pattern` about allies.
- **Personal Learnings (`teammate_driven_loss = false`)**:
  - Identify concrete, actionable learnings for `My Slot` across at most **one candidate `Failure Pattern` per dimension**:
    - `pick`: Draft or comfort-pool mismatch against enemy/ally composition.
    - `action`: Micro/macro decision-making, positioning, objective timing, or map awareness.
    - `synergy`: Coordination with ally win conditions or teamfight timing.
    - `build`: Itemization, boot blessing, emblem, or Battle Spell adaptation vs. enemy threats.

### 6. Present Candidate `Failure Pattern`s for User Confirmation & Commit
1. Present your concise `analysis_markdown` summary and any candidate `Failure Pattern`s (at most 1 per dimension: `pick`, `action`, `synergy`, `build`) to the user in chat.
2. **Wait for user confirmation** before committing any `Failure Pattern`s to `failure_patterns`.
3. Once confirmed (or immediately when `teammate_driven_loss = true` with `confirmed_patterns: []`), persist the review via `PATCH /api/post-match-reviews/{id}`:
   ```json
   {
     "analysis_markdown": "...",
     "teammate_driven_loss": false,
     "confirmed_patterns": [
       {
         "dimension": "build",
         "pattern_key": "skip-anti-burst-armor",
         "rule": "Prioritize Antique Cuirass earlier against physical skill-burst.",
         "scope_type": "role",
         "scope_value": "EXP"
       }
     ]
   }
   ```
4. `PATCH /api/post-match-reviews/{id}` atomically sets `status = 'reviewed'`, records `reviewed_at`, and upserts/reinforces each confirmed `Failure Pattern` with `last_seen_review_id` set to the review's ID.
