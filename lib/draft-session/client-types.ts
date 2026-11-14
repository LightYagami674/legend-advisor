import type {
  DraftPhaseValue,
  DraftStatusValue,
  DraftTeamValue,
  LaneValue,
} from "./schema";

export interface HeroCatalogItem {
  id: number;
  slug: string;
  name: string;
  roles: string[];
  lanes: LaneValue[];
  damage_type: string;
  specialty: string[];
  win_rate: number;
  ban_rate: number;
  pick_rate: number;
  recent_patch_summary: string;
}

export interface DraftSessionDto {
  id: number;
  patch_version: string;
  phase: DraftPhaseValue;
  my_slot_index: number;
  active_target_slot_index: number;
  status: DraftStatusValue;
  created_at: string;
  updated_at: string;
}

export interface DraftSlotDto {
  id: number;
  session_id: number;
  team: DraftTeamValue;
  slot_index: number;
  role: LaneValue | null;
  banned_hero_id: number | null;
  picked_hero_id: number | null;
  is_locked: boolean;
}

export interface ActiveInputTarget {
  kind: "ban" | "pick";
  team: DraftTeamValue;
  slot_index: number;
}

export type DecisionStageTab = "candidates" | "build" | "post-match";

/**
 * Computes the next open ban or pick slot after assigning a hero,
 * transitioning from bans to picks once all 10 bans are filled.
 */
export function findNextOpenTarget(
  slots: DraftSlotDto[],
  justAssignedKind: "ban" | "pick",
  currentTarget: ActiveInputTarget,
): ActiveInputTarget {
  const ordered = [
    ...slots.filter((s) => s.team === "ally").sort((a, b) => a.slot_index - b.slot_index),
    ...slots.filter((s) => s.team === "enemy").sort((a, b) => a.slot_index - b.slot_index),
  ];

  const nextSameKind = ordered.find((s) =>
    justAssignedKind === "ban" ? s.banned_hero_id === null : s.picked_hero_id === null,
  );
  if (nextSameKind) {
    return {
      kind: justAssignedKind,
      team: nextSameKind.team,
      slot_index: nextSameKind.slot_index,
    };
  }

  if (justAssignedKind === "ban") {
    const firstOpenPick = ordered.find((s) => s.picked_hero_id === null);
    if (firstOpenPick) {
      return {
        kind: "pick",
        team: firstOpenPick.team,
        slot_index: firstOpenPick.slot_index,
      };
    }
  }

  return currentTarget;
}
