---
name: recommendation-judge
description: PROTOTYPE — Evaluate Candidate Pick and Build Recommendation optimality against captured state, questions, and jev-latest output using Mythic+ scenarios.
disable-model-invocation: true
---

<!-- PROTOTYPE: Throwaway draft for Wayfinder #19. Not production. -->

# Recommendation Judge

Grade `Candidate Pick` and `Build Recommendation` runs for optimality, and attribute every failure to its exact layer (`context-gap`, `rubric-gap`, `jev-reasoning-gap`, or `post-processing-gap`).

## Steps

1. **Load the scenario & trace**: Read the scenario fixture from [`PROTOTYPE_SCENARIOS.md`](PROTOTYPE_SCENARIOS.md) (later `references/eval-scenarios.md`) and the captured `{ state, questions, answers, output }` payload from the target run.
2. **Audit `state` completeness**: Verify `state` contains the facts required for the scenario's decision—draft hero strengths/weaknesses, ally/enemy meta builds (for `Build Recommendation`), `mythic_plus_relationships`, and `My Slot` `Player Profile` constraints when `isMySlot` is true.
   - *Gate*: Missing or truncated domain facts in `state` → tag `context-gap` before blaming `jev-latest`.
3. **Audit `questions` & rubrics**: Check that `choice`/`score`/`noul` prompts and rubric labels discriminate the scenario's key tension (e.g., anti-heal vs raw damage, counter-pick trap, `profileSafe` vs `avoid` tier).
   - *Gate*: Ambiguous or uncalibrated rubric/prompt → tag `rubric-gap`.
4. **Judge `jev-latest` answers & final output**: Apply the grading rules in [`PROTOTYPE_RUBRIC.md`](references/PROTOTYPE_RUBRIC.md) (disclosed reference) to score:
   - `Candidate Pick`: Top-3 hero validity, role/lane fit, counter/synergy accuracy, counter-pick trap avoidance, and `My Slot` `Player Profile` adherence (`profileSafe` + no `avoid` hero).
   - `Build Recommendation`: Situational `noul` triggers (`needsAntiHeal`, `needsAntiShield`, `needsMagicDefense`, `needsPhysicalDefense`, `needsPenetration`), boots + blessing fit, core/counter item ordering, emblem + spell synergy, and `build`/`action` `Failure Pattern` alignment for `My Slot`.
5. **Emit structured verdict**: Output one verdict block per scenario (`PASS` / `WARN` / `FAIL`) with per-dimension scores, expected-vs-actual diff, and primary root-cause tag.

## Completion Criteria

- Every scenario in the active suite has a `PASS` / `WARN` / `FAIL` verdict, numeric/categorical sub-scores, and a root-cause attribution if not `PASS`.
- Before/after comparison table generated when comparing two pipeline revisions.
