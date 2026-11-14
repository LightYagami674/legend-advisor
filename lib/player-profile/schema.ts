import { z } from "zod";
import type {
  ComfortTier,
  FailurePatternDimension,
  FailurePatternScopeType,
  FailurePatternStatus,
  HeroRole,
  Lane,
} from "@/db/schema";
import { LANES } from "@/lib/draft-session/schema";

export const COMFORT_TIERS = ["main", "comfort", "learning", "avoid"] as const;

export const FAILURE_PATTERN_DIMENSIONS = [
  "pick",
  "action",
  "synergy",
  "build",
] as const;

export const FAILURE_PATTERN_SCOPE_TYPES = ["general", "role", "hero"] as const;

export const FAILURE_PATTERN_STATUSES = ["active", "resolved"] as const;

export const UpdatePlayerProfileSchema = z.object({
  preferred_roles: z.array(z.enum(LANES)).max(5),
});

export const UpsertHeroComfortSchema = z
  .object({
    hero_id: z.number().int().positive(),
    comfort_tier: z.enum(COMFORT_TIERS),
    notes: z.string().max(500).optional(),
    matches_played: z.number().int().min(0).optional(),
    wins: z.number().int().min(0).optional(),
  })
  .refine(
    (data) =>
      data.wins === undefined ||
      data.matches_played === undefined ||
      data.wins <= data.matches_played,
    { message: "wins cannot exceed matches_played", path: ["wins"] },
  );

export const PatchHeroComfortSchema = z
  .object({
    comfort_tier: z.enum(COMFORT_TIERS).optional(),
    notes: z.string().max(500).optional(),
    matches_played: z.number().int().min(0).optional(),
    wins: z.number().int().min(0).optional(),
  })
  .refine(
    (data) =>
      data.wins === undefined ||
      data.matches_played === undefined ||
      data.wins <= data.matches_played,
    { message: "wins cannot exceed matches_played", path: ["wins"] },
  );

export const CreateFailurePatternSchema = z.object({
  dimension: z.enum(FAILURE_PATTERN_DIMENSIONS),
  pattern_key: z.string().trim().min(2).max(120),
  rule: z.string().trim().min(3).max(500),
  scope_type: z.enum(FAILURE_PATTERN_SCOPE_TYPES),
  scope_value: z.string().trim().min(1).max(80).nullable().optional(),
  last_seen_review_id: z.string().trim().min(1).max(120).nullable().optional(),
});

export const PatchFailurePatternSchema = z.object({
  dimension: z.enum(FAILURE_PATTERN_DIMENSIONS).optional(),
  rule: z.string().trim().min(3).max(500).optional(),
  scope_type: z.enum(FAILURE_PATTERN_SCOPE_TYPES).optional(),
  scope_value: z.string().trim().min(1).max(80).nullable().optional(),
  status: z.enum(FAILURE_PATTERN_STATUSES).optional(),
  reinforce: z.boolean().optional(),
  last_seen_review_id: z.string().trim().min(1).max(120).nullable().optional(),
});

export interface PlayerProfileDto {
  id: number;
  preferred_roles: Lane[];
  updated_at: string;
}

export interface HeroComfortPoolDto {
  hero_id: number;
  hero_slug: string;
  hero_name: string;
  hero_roles: HeroRole[];
  hero_lanes: Lane[];
  comfort_tier: ComfortTier;
  notes: string;
  matches_played: number;
  wins: number;
  updated_at: string;
}

export interface FailurePatternDto {
  id: number;
  dimension: FailurePatternDimension;
  pattern_key: string;
  rule: string;
  scope_type: FailurePatternScopeType;
  scope_value: string | null;
  occurrences: number;
  status: FailurePatternStatus;
  last_seen_review_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerProfileBundleDto {
  profile: PlayerProfileDto;
  comfort_pool: HeroComfortPoolDto[];
  failure_patterns: FailurePatternDto[];
}
