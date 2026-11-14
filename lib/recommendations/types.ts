import type { ItemCategory, Lane } from "@/db/schema";
import type { LaneValue } from "@/lib/draft-session/schema";

export interface CandidatePickItem {
  rank: 1 | 2 | 3;
  hero_id: number;
  slug: string;
  name: string;
  roles: string[];
  lanes: LaneValue[];
  damage_type: string;
  win_rate: number;
  composite_score: number;
  choice_prob: number;
  synergy_score: number;
  counter_score: number;
  patch_score: number;
  synergy_label: string;
  counter_label: string;
  patch_label: string;
}

export interface CandidatePickResponse {
  recommendation_id: number;
  session_id: number;
  target_slot_index: number;
  kind: "candidate_pick";
  created_at: string;
  candidates: CandidatePickItem[];
}

export type BuildItemTag = "Boots" | "Core" | "Situational";

export type BuildTierLabel =
  | "Boots"
  | "Must-buy counter/core"
  | "Strong core fit"
  | "Situational";

export interface BuildBlessingDto {
  slug: string;
  name: string;
  category: "Jungling" | "Roaming";
  effect: string;
}

export interface BuildItemRecommendation {
  slug: string;
  name: string;
  category: ItemCategory;
  gold_cost: number;
  unique_passive: string;
  semantic_tags: string[];
  tag: BuildItemTag;
  tier_label: BuildTierLabel;
  score: number;
  blessing: BuildBlessingDto | null;
}

export interface BuildEmblemTalentDto {
  name: string;
  effect: string;
}

export interface BuildEmblemRecommendation {
  slug: string;
  name: string;
  tier1: BuildEmblemTalentDto;
  tier2: BuildEmblemTalentDto;
  tier3: BuildEmblemTalentDto;
}

export interface BuildBattleSpellRecommendation {
  slug: string;
  name: string;
  cooldown_sec: number;
  effect: string;
}

export interface SituationalFlagEntry {
  triggered: boolean;
  probability: number;
  label: string;
}

export interface SituationalFlags {
  needsAntiHeal: SituationalFlagEntry;
  needsAntiShield: SituationalFlagEntry;
  needsMagicDefense: SituationalFlagEntry;
  needsPhysicalDefense: SituationalFlagEntry;
  needsPenetration: SituationalFlagEntry;
}

export interface BuildRecommendationPayload {
  session_id: number;
  target_slot_index: number;
  target_role: Lane | null;
  hero: {
    id: number;
    slug: string;
    name: string;
  };
  items: BuildItemRecommendation[];
  emblem: BuildEmblemRecommendation;
  battle_spell: BuildBattleSpellRecommendation;
  situational_flags: SituationalFlags;
  created_at: string;
}
