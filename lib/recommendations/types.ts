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
