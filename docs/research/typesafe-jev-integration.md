# Research: TypeSafe Jev SDK & Vercel AI SDK (`gemini-4-hydrogen`) Integration Pattern

**Ticket**: [Wayfinder #3 — TypeSafe Jev SDK and Vercel AI SDK integration pattern](https://github.com/LightYagami674/legend-advisor/issues/3)  
**Date**: 2026-11-14

---

## Executive Summary

1. **Official Jev TypeScript SDK**: TypeSafe AI provides an official standalone TypeScript/JavaScript SDK, **`@typesafe-ai/sdk`** ([`typesafe-ai/typesafe-sdk-js`](https://github.com/typesafe-ai/typesafe-sdk-js), [npm](https://www.npmjs.com/package/@typesafe-ai/sdk)), which targets Node.js 20+ and communicates with `POST https://api.typesafe.ai/v1/systemone` via `TypeSafeClient.prototype.systemOne()`.
2. **Vercel AI SDK Compatibility & Dual-SDK Pattern**: Because **Jev** (`jev-latest` / `jev-1.14` / `jev-1.13`) is a non-autoregressive **"System One" decision model** that emits **zero text tokens**—evaluating a shared `state` against a dictionary of typed `questions` (`choice`, `score`, `noul`) in a single parallel forward pass—it does not implement the standard Vercel AI SDK generative `LanguageModel` (`generateText` / `streamText` / `generateObject`) interface. While Jev can be proxied through Vercel AI Gateway or OpenRouter (`typesafe/jev-1.13`), the canonical pattern in a Next.js backend is to run **`@typesafe-ai/sdk` (`TypeSafeClient`) alongside the Vercel AI SDK (`ai` + `@ai-sdk/google` with `google('gemini-4-hydrogen')`)** inside Next.js Route Handlers or Server Actions.
3. **System 1 + System 2 Division of Labor**:
   - **Jev (`@typesafe-ai/sdk`) — System 1 Decision Engine**: Executes fast (~100–250 ms), calibrated probabilistic scoring and selection over the `Draft Session`, `Patch Knowledge Base`, and (strictly when advising `My Slot`) `Player Profile` to rank the top 3 `Candidate Pick` heroes and select the `Build Recommendation` (equipment items, Emblem setup, Battle Spell).
   - **Gemini 4 Hydrogen (`@ai-sdk/google` -> `google('gemini-4-hydrogen')`) — System 2 Reasoning & Multimodal Engine**:
     1. Generates concise tactical explanations/rationales (`streamText` or `generateObject`) grounded in Jev's deterministic decisions and probability breakdowns.
     2. Processes multimodal `Post-Match Review` submissions (scoreboard screenshot + free-text reflection from `My Slot`) via `generateObject` to extract structured `Failure Pattern` learnings (pick-wise, action-wise, synergy-wise, build-wise) into the `Player Profile`.

---

## 1. SDKs, Packages & Authentication

| Capability | Package(s) | Model ID | Auth Env Var | Primary Endpoint / Method |
| :--- | :--- | :--- | :--- | :--- |
| **System 1 Typed Decisions (Jev)** | `@typesafe-ai/sdk` | `"jev-latest"` (or pinned `"jev-1.14"` / `"jev-1.13"`) | `TYPESAFE_API_KEY` | `new TypeSafeClient().systemOne({ model, state, questions })` (`POST https://api.typesafe.ai/v1/systemone`) |
| **System 2 Generative & Multimodal (Gemini 4 Hydrogen)** | `ai`, `@ai-sdk/google`, `zod` | `google("gemini-4-hydrogen")` | `GOOGLE_GENERATIVE_AI_API_KEY` | `generateObject()` / `generateText()` / `streamText()` |

### Key `@typesafe-ai/sdk` Runtime Facts
- **Node.js Requirement**: Node.js 20+ (automatically applies `zstd` request body compression for payloads $\ge 1\text{ KiB}$ on Node.js 22.15+).
- **Server-Only Guard**: `TypeSafeClient` throws at initialization if executed in a browser environment to prevent leaking `TYPESAFE_API_KEY`. Always invoke Jev inside Next.js App Router Route Handlers (`app/api/.../route.ts`) or Server Actions (`"use server"`).
- **Compile-Time Type Inference**: `response.answers` is statically typed from the `questions` object passed to `client.systemOne()`—literal option keys in `choice()` and return structures for `score()` and `noul()` require no manual type casting.
- **Gateway Routing**: `new TypeSafeClient({ apiKey, baseURL })` supports routing through Vercel AI Gateway, Cloudflare AI Gateway, or OpenRouter (`typesafe/jev-1.13`) if centralized gateway billing/observability is desired.

### Key `@ai-sdk/google` (`gemini-4-hydrogen`) Runtime Facts
- **Model Identifier**: `google('gemini-4-hydrogen')` via `@ai-sdk/google`.
- **Thinking Configuration**: Supports `providerOptions.google.thinkingConfig.thinkingLevel` with values `'low' | 'medium' | 'high' | 'xhigh'` and `includeThoughts: boolean` (`GoogleLanguageModelOptions`).
- **Context Window**: Unified 1M-token context window with native multimodal image ingestion (`messages` with `{ type: 'image', image: Buffer | Uint8Array | URL }` alongside text prompts) and strict Zod schema adherence via `generateObject`.

---

## 2. Jev Input & Output Schema Contract (`/v1/systemone`)

Every `client.systemOne()` call submits a single shared `state` and a map of independent `questions` evaluated in parallel in one forward pass.

### Context & Scale Limits
- **Per-Request Context Limit**: **64,000 tokens** total across `state` + all `questions`.
- **Per-Question Context Limit**: **32,000 tokens** for `state` + any single question.
- **Parallel Question Fan-Out**: Hundreds of independent questions can be evaluated simultaneously in a single request ("speculative fan-out") with zero output-token billing.
- **`choice` Option Limit**: Up to **255 options** per `choice` question (sufficient to evaluate the entire Mobile Legends hero pool of ~125+ heroes or item pool in a single question).
- **`score` Rubric Limit**: **2 to 10 ordered levels** per `score` question.

### The Three Core Question Primitives

#### 1. `choice` — Categorical Selection & Full Probability Distribution
Selects from an unordered set of up to 255 discrete options and returns the calibrated probability distribution across **all** candidate keys.

```typescript
import { choice } from "@typesafe-ai/sdk";

// Helper signature:
// choice(instructions: string, criteria: Record<OptionKey, string | null>)
// OR object form: { type: "choice", instructions: string, criteria: Record<OptionKey, string | null> }
```

**Response shape (`response.answers.<key>`)**:
```typescript
interface ChoiceAnswer<K extends string> {
  choice: K;                          // Argmax winning option key
  probabilities: Record<K, number>;   // Calibrated probability (0..1) for EVERY option key (sums to ~1.0)
  confidence: number;                 // Normalized concentration metric (0..1) vs uniform distribution
}
```

#### 2. `score` — Ordered Rubric Evaluation
Grades the `state` along an ordered rubric of 2 to 10 descriptive levels and computes a probability-weighted continuous score.

```typescript
import { score } from "@typesafe-ai/sdk";

// Helper signature:
// score(instructions: string, criteria: string[])
```

**Response shape (`response.answers.<key>`)**:
```typescript
interface ScoreAnswer {
  score: number;                      // Probability-weighted expected value along the rubric indices (0 .. N-1)
  legend: string[];                   // Echoes the ordered rubric descriptions
  probabilities: number[];            // Calibrated probability (0..1) for each rubric level
  confidence: number;                 // Distribution concentration metric (0..1)
}
```

#### 3. `noul` — Calibrated Binary Proposition ($P(\text{true})$)
Evaluates whether a specific yes/no statement holds true for the given `state`.

```typescript
import { noul } from "@typesafe-ai/sdk";

// Helper signature:
// noul(instructions: string, criteria?: { true: string; false: string })
```

**Response shape (`response.answers.<key>`)**:
```typescript
interface NoulAnswer {
  noul: number;                       // Calibrated probability (0.0 to 1.0) that the proposition is true
}
```

---

## 3. Contract for Top 3 `Candidate Pick` Heroes

During a `Draft Session`, when the user selects a `Target Ally Slot` (either `My Slot` or one of the 4 teammate `Draft Slots`), we need the **top 3 `Candidate Pick` heroes** ranked by:
1. Synergy with locked/hovered allies
2. Counter-value against revealed enemies
3. Role/lane need for the `Target Ally Slot`
4. Current `Patch Knowledge Base` strength
5. **Strictly when `Target Ally Slot === My Slot`**: alignment with the user's `Player Profile` (hero comfort pool and accumulated pick-wise / synergy-wise / action-wise `Failure Patterns`).

### Two-Stage or Single-Pass Speculative Fan-Out Pattern

Because a `choice` question supports up to **255 options** and returns `probabilities: Record<HeroId, number>` across every option, and because `systemOne()` supports **hundreds of parallel questions in one call**, we can compute both the overall pick probability distribution and per-dimension rubric scores in **one `client.systemOne()` request** (or a fast two-step pass if evaluating detailed sub-scores only on the top $K$ role-eligible heroes):

```typescript
import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import { google, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const jev = new TypeSafeClient({
  // Reads process.env.TYPESAFE_API_KEY by default
});

export async function recommendCandidatePicks(params: {
  draftSession: DraftSessionState;
  targetAllySlotId: string;
  isMySlot: boolean;
  eligibleHeroes: Array<{ id: string; name: string; roles: string[]; summary: string }>;
  patchKnowledgeBase: PatchKnowledgeExcerpt;
  playerProfile?: PlayerProfile; // ONLY passed when params.isMySlot === true
}) {
  const { draftSession, targetAllySlotId, isMySlot, eligibleHeroes, patchKnowledgeBase, playerProfile } = params;

  // Enforce domain invariant: Player Profile is NEVER included for teammate slots
  const sanitizedState = {
    draftSession,
    targetAllySlotId,
    isMySlot,
    patchKnowledgeBase,
    ...(isMySlot && playerProfile ? { playerProfile } : {}),
  };

  // Map eligible (unbanned, unpicked, role-matching) heroes to choice criteria (<= 255 options)
  const heroCriteria = Object.fromEntries(
    eligibleHeroes.map((h) => [h.id, `${h.name} (${h.roles.join("/")}) — ${h.summary}`])
  );

  // Build parallel questions:
  // 1. Overall calibrated distribution over all eligible heroes
  // 2. Per-hero dimensional rubric scores for the eligible pool
  const perHeroQuestions: Record<string, ReturnType<typeof score> | ReturnType<typeof noul>> = {};
  for (const hero of eligibleHeroes) {
    perHeroQuestions[`synergy_${hero.id}`] = score(
      `How strong is ${hero.name}'s synergy with the current Ally lineup for slot ${targetAllySlotId}?`,
      ["Poor / anti-synergy", "Neutral", "Good combo potential", "Ideal composition fit"]
    );
    perHeroQuestions[`counter_${hero.id}`] = score(
      `How effectively does ${hero.name} counter the revealed Enemy lineup?`,
      ["Hard countered by enemies", "Even matchup", "Counters 1+ enemy threats", "Hard counters enemy core"]
    );
    perHeroQuestions[`patch_${hero.id}`] = score(
      `How strong is ${hero.name} in the current Patch Knowledge Base meta for this role?`,
      ["Off-meta / nerfed", "Viable situational", "Strong meta pick", "S-tier priority pick"]
    );
    if (isMySlot && playerProfile) {
      perHeroQuestions[`profileSafe_${hero.id}`] = noul(
        `Given the user's Player Profile comfort pool and Failure Patterns (pick-wise, action-wise, synergy-wise), is ${hero.name} a safe, high-mastery fit that avoids their recurring failure patterns?`
      );
    }
  }

  const decision = await jev.systemOne({
    model: "jev-latest",
    state: sanitizedState,
    questions: {
      bestHeroPick: choice(
        isMySlot
          ? "Which hero is the best Candidate Pick for My Slot considering ally synergy, enemy counters, role need, patch meta, and the user's Player Profile?"
          : "Which hero is the best Candidate Pick for this Target Ally Slot considering ally synergy, enemy counters, role need, and patch meta?",
        heroCriteria
      ),
      ...perHeroQuestions,
    },
  });

  // Rank all eligible heroes using Jev's calibrated choice probabilities + dimensional rubric scores
  const pickProbs = decision.answers.bestHeroPick.probabilities;

  const scoredCandidates = eligibleHeroes.map((hero) => {
    const choiceProb = pickProbs[hero.id] ?? 0;
    const synergyScore = (decision.answers[`synergy_${hero.id}`] as { score: number }).score / 3; // normalized 0..1
    const counterScore = (decision.answers[`counter_${hero.id}`] as { score: number }).score / 3;
    const patchScore = (decision.answers[`patch_${hero.id}`] as { score: number }).score / 3;
    const profileProb =
      isMySlot && playerProfile
        ? (decision.answers[`profileSafe_${hero.id}`] as { noul: number }).noul
        : null;

    const compositeScore =
      profileProb !== null
        ? 0.35 * choiceProb + 0.20 * synergyScore + 0.20 * counterScore + 0.10 * patchScore + 0.15 * profileProb
        : 0.40 * choiceProb + 0.25 * synergyScore + 0.25 * counterScore + 0.10 * patchScore;

    return {
      heroId: hero.id,
      heroName: hero.name,
      choiceProbability: choiceProb,
      synergyScore,
      counterScore,
      patchScore,
      profileFitProbability: profileProb,
      compositeScore,
    };
  });

  // Top 3 Candidate Picks deterministically ordered by Jev probabilities
  const top3Picks = scoredCandidates
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 3);

  // System 2 (Gemini 4 Hydrogen): Generate concise tactical rationales for the Top 3 Candidate Picks
  const { object: explanations } = await generateObject({
    model: google("gemini-4-hydrogen"),
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: "low" },
      } satisfies GoogleLanguageModelOptions,
    },
    schema: z.object({
      recommendations: z.array(
        z.object({
          heroId: z.string(),
          headline: z.string(),
          synergyNote: z.string(),
          counterNote: z.string(),
          profileWarningOrTip: z.string().optional(),
        })
      ),
    }),
    prompt: `Explain why these top 3 Candidate Picks were selected by the decision model for ${
      isMySlot ? "My Slot (tailored to Player Profile)" : "Target Ally Slot"
    }:\n${JSON.stringify({ top3Picks, draftSession }, null, 2)}`,
  });

  return { top3Picks, explanations: explanations.recommendations };
}
```

---

## 4. Contract for `Build Recommendation` Loadouts

Once the draft locks in, `Build Recommendation` evaluates a locked-in Ally hero against the finalized 5-hero Enemy lineup (and the user's build-wise / action-wise `Failure Patterns` when advising `My Slot`) to select:
1. **Core & Situational Equipment Items** (boots + 5 core/situational items)
2. **Emblem Setup** (Emblem base + Tier 1, Tier 2, Tier 3 talents)
3. **Battle Spell**

### Single-Pass Jev `Build Recommendation` Schema

```typescript
export async function recommendBuildLoadout(params: {
  allyHeroId: string;
  isMySlot: boolean;
  allyLineup: string[];
  enemyLineup: string[];
  patchKnowledgeBase: PatchKnowledgeExcerpt;
  playerProfile?: PlayerProfile; // ONLY passed when params.isMySlot === true
}) {
  const { allyHeroId, isMySlot, allyLineup, enemyLineup, patchKnowledgeBase, playerProfile } = params;

  const state = {
    allyHeroId,
    isMySlot,
    allyLineup,
    enemyLineup,
    patchKnowledgeBase,
    ...(isMySlot && playerProfile ? { playerProfile } : {}),
  };

  const response = await jev.systemOne({
    model: "jev-latest",
    state,
    questions: {
      // 1. Battle Spell choice
      battleSpell: choice(
        "Which Battle Spell gives this hero the highest survival and impact against the finalized Enemy lineup?",
        {
          flicker: "Instant blink repositioning / escape",
          purify: "Cleanse enemy hard CC bursts",
          retribution: "Jungler objective secure and jungle clear",
          vengeance: "Damage reflection and front-line durability",
          petrify: "Close-range AoE stun combo",
          sprint: "Sustained movement speed and slow immunity",
          execute: "Low-HP true damage finisher",
          aegis: "Immediate shield against burst",
          inspire: "Attack speed and lifesteal burst for basic attackers",
          flameshot: "Long-range snipe and close-range knockback",
          revitalize: "AoE healing zone for teamfights",
          arrival: "Global map rotation and split-push pressure",
        }
      ),

      // 2. Emblem Setup choices
      emblemSet: choice("Which primary Emblem set best fits this hero and matchup?", {
        assassin: "Adaptive penetration, attack, and movement speed",
        mage: "Magic power, cooldown reduction, and magic penetration",
        fighter: "Spell vamp, hybrid defense, and adaptive attack",
        tank: "HP, hybrid defense, and HP regen",
        marksman: "Attack speed, adaptive attack, and lifesteal",
        support: "Healing effect, cooldown reduction, and movement speed",
        common: "Hybrid regen, HP, and adaptive attack",
      }),
      talentTier1: choice("Which Tier 1 Emblem talent is optimal?", {
        thrill: "Adaptive attack bonus",
        swift: "Extra attack speed",
        vitality: "Extra max HP",
        rupture: "Adaptive penetration",
        inspire_talent: "Cooldown reduction",
        firmness: "Extra physical and magic defense",
        agility: "Extra movement speed",
        fatal: "Extra critical chance and critical damage",
      }),
      talentTier2: choice("Which Tier 2 Emblem talent is optimal?", {
        seasoned_hunter: "Faster Lord/Turtle/Creep damage",
        tenacity: "Increased defense below 50% HP",
        master_assassin: "Increased damage to isolated heroes",
        bargain_hunter: "Discounted equipment purchases",
        festival_of_blood: "Stacking spell vamp",
        pull_yourself_together: "Reduced Battle Spell & active equipment cooldowns",
        weapons_master: "Bonus physical/magic power from equipment",
        wilderness_blessing: "Extra movement speed in jungle and river",
      }),
      talentTier3: choice("Which Tier 3 Core Emblem talent is optimal?", {
        killing_spree: "HP restore and movement speed on hero takedown",
        quantum_charge: "Basic attack periodically heals and grants movement speed",
        lethal_ignition: "Multi-hit burst scorches enemy",
        brave_smite: "Skill damage heals % max HP",
        concussive_blast: "HP-scaling AoE magic wave after basic attack",
        weakness_finder: "Basic attacks slow movement and attack speed",
        impure_rage: "Skill damage deals % max HP and restores mana",
        temporal_reign: "Casting ultimate reduces non-ultimate skill cooldowns",
        war_cry: "Sustained combat increases all damage dealt",
      }),

      // 3. Boots selection
      boots: choice("Which Boots item counters the Enemy lineup's primary damage/CC profile?", {
        tough_boots: "Magic defense and 30% CC duration reduction",
        warrior_boots: "Physical defense and stacking physical armor",
        arcane_boots: "Flat magic penetration",
        swift_boots: "Attack speed",
        magic_shoes: "Cooldown reduction",
        rapid_boots: "Out-of-combat roaming speed",
        demon_shoes: "Mana regeneration",
      }),

      // 4. Situational defensive / counter triggers (Calibrated Noul probabilities)
      needsAntiHeal: noul(
        "Does the Enemy lineup have high shield/regen/lifesteal requiring an early anti-heal item (Sea Halberd / Glowing Wand / Dominance Ice)?"
      ),
      needsMagicBurstDefense: noul(
        "Does the Enemy lineup have lethal magic burst requiring Athena's Shield or Radiant Armor?"
      ),
      needsPhysicalInvulnerability: noul(
        "Does the Enemy lineup have physical assassin/marksman burst requiring Wind of Nature or Winter Crown / Antique Cuirass?"
      ),

      // 5. Candidate equipment item scoring (fanned out across the hero's eligible item pool)
      // Each candidate item `<itemId>` gets a score() question; top 5 non-boot items form the core + situational build
    },
  });

  return response.answers;
}
```

---

## 5. Multimodal `Post-Match Review` with Gemini 4 Hydrogen

When the user submits a `Post-Match Review` (final match scoreboard screenshot + free-text reflection) after a defeat, `@ai-sdk/google` with `google('gemini-4-hydrogen')` inspects the image and text strictly from the perspective of `My Slot` to extract a structured `Failure Pattern` across the four domain dimensions:

```typescript
import { google, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const FailurePatternSchema = z.object({
  mySlotHeroDetected: z.string(),
  mySlotRole: z.string(),
  enemyThreatsIdentified: z.array(z.string()),
  failureDimensions: z.object({
    pickWise: z.string().describe("What the user could improve in hero selection for My Slot"),
    actionWise: z.string().describe("What the user could improve in macro/positioning/engagements for My Slot"),
    synergyWise: z.string().describe("How the user could better coordinate with the ally composition from My Slot"),
    buildWise: z.string().describe("Which equipment, Emblem, or Battle Spell adjustments would have mitigated the loss for My Slot"),
  }),
});

export async function analyzePostMatchReview(params: {
  scoreboardImageBytes: Uint8Array;
  userReflection: string;
  mySlotContext: { declaredRole: string; heroPlayed?: string };
}) {
  const { object } = await generateObject({
    model: google("gemini-4-hydrogen"),
    schema: FailurePatternSchema,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "high",
        },
      } satisfies GoogleLanguageModelOptions,
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this Mobile Legends defeat strictly from the perspective of My Slot (${JSON.stringify(
              params.mySlotContext
            )}). Never profile or blame teammates. Extract actionable Failure Patterns across pick-wise, action-wise, synergy-wise, and build-wise dimensions.\nUser reflection: ${
              params.userReflection
            }`,
          },
          {
            type: "image",
            image: params.scoreboardImageBytes,
          },
        ],
      },
    ],
  });

  return object;
}
```

---

## Sources

1. **TypeSafe AI Official Documentation & System One Architecture**: `https://typesafe.ai` — Jev model overview (`jev-latest`, `jev-1.14`, `jev-1.13`), `/v1/systemone` API specification, 64k per-request / 32k per-question context limits, and primitive definitions (`choice`, `score`, `noul`).
2. **TypeSafe AI Official TypeScript/JavaScript SDK**: [`typesafe-ai/typesafe-sdk-js`](https://github.com/typesafe-ai/typesafe-sdk-js) & [`@typesafe-ai/sdk` on npm](https://www.npmjs.com/package/@typesafe-ai/sdk) — `TypeSafeClient`, `choice()`, `score()`, `noul()`, `TYPESAFE_API_KEY` authentication, Node.js 20+ runtime requirements, and compile-time `response.answers` type inference.
3. **Vercel AI SDK Google Generative AI Provider (`@ai-sdk/google`)**: `https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai` — `google('gemini-4-hydrogen')` model ID, `GoogleLanguageModelOptions` (`thinkingConfig.thinkingLevel`: `'low' | 'medium' | 'high' | 'xhigh'`), `generateObject`, and `streamText`.
4. **OpenRouter & Vercel AI Gateway System One Routing**: `https://openrouter.ai` (`typesafe/jev-1.13`) and `https://vercel.com/docs/ai-gateway` — Gateway pass-through support for `/v1/systemone` decision payloads.
