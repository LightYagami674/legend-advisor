import { z } from "zod";

export const LANES = ["EXP", "Jungle", "Mid", "Gold", "Roam"] as const;
export const DRAFT_PHASES = ["ban", "pick", "locked"] as const;
export const DRAFT_STATUSES = ["active", "locked", "completed"] as const;
export const DRAFT_TEAMS = ["ally", "enemy"] as const;

export const LaneSchema = z.enum(LANES);
export const DraftPhaseSchema = z.enum(DRAFT_PHASES);
export const DraftStatusSchema = z.enum(DRAFT_STATUSES);
export const DraftTeamSchema = z.enum(DRAFT_TEAMS);
export const SlotIndexSchema = z.number().int().min(1).max(5);

export const CreateDraftSessionInputSchema = z.object({
  my_slot_index: SlotIndexSchema.optional(),
  active_target_slot_index: SlotIndexSchema.optional(),
});

export const PatchDraftSessionInputSchema = z.object({
  my_slot_index: SlotIndexSchema.optional(),
  active_target_slot_index: SlotIndexSchema.optional(),
  phase: DraftPhaseSchema.optional(),
  status: DraftStatusSchema.optional(),
  lock_all: z.boolean().optional(),
});

export const PatchDraftSlotItemSchema = z.object({
  team: DraftTeamSchema,
  slot_index: SlotIndexSchema,
  role: LaneSchema.nullable().optional(),
  banned_hero_id: z.number().int().positive().nullable().optional(),
  picked_hero_id: z.number().int().positive().nullable().optional(),
  is_locked: z.boolean().optional(),
});

export const PatchDraftSlotsInputSchema = z.union([
  PatchDraftSlotItemSchema,
  z.object({
    updates: z.array(PatchDraftSlotItemSchema).min(1),
  }),
]);

export type LaneValue = z.infer<typeof LaneSchema>;
export type DraftPhaseValue = z.infer<typeof DraftPhaseSchema>;
export type DraftStatusValue = z.infer<typeof DraftStatusSchema>;
export type DraftTeamValue = z.infer<typeof DraftTeamSchema>;
export type CreateDraftSessionInput = z.infer<typeof CreateDraftSessionInputSchema>;
export type PatchDraftSessionInput = z.infer<typeof PatchDraftSessionInputSchema>;
export type PatchDraftSlotItem = z.infer<typeof PatchDraftSlotItemSchema>;
