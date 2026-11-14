import { z } from "zod";
import type { PostMatchReviewStatus } from "@/db/schema";
import { CreateFailurePatternSchema } from "@/lib/player-profile/schema";

export const ConfirmedFailurePatternInputSchema = CreateFailurePatternSchema.omit({
  last_seen_review_id: true,
});

export const ReviewPostMatchSchema = z
  .object({
    analysis_markdown: z.string().trim().min(1),
    teammate_driven_loss: z.boolean().optional().default(false),
    confirmed_patterns: z
      .array(ConfirmedFailurePatternInputSchema)
      .max(4)
      .optional()
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.teammate_driven_loss && data.confirmed_patterns.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "teammate_driven_loss = true must record 0 personal Failure Patterns",
        path: ["confirmed_patterns"],
      });
    }

    const seenDimensions = new Set<string>();
    for (const pattern of data.confirmed_patterns) {
      if (seenDimensions.has(pattern.dimension)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most one Failure Pattern per dimension (${pattern.dimension}) may be committed per review`,
          path: ["confirmed_patterns"],
        });
        break;
      }
      seenDimensions.add(pattern.dimension);
    }
  });

export type ConfirmedFailurePatternInput = z.infer<
  typeof ConfirmedFailurePatternInputSchema
>;

export interface PostMatchReviewDto {
  id: number;
  draft_session_id: number;
  screenshot_path: string;
  secondary_screenshot_path: string | null;
  user_reflection: string | null;
  analysis_markdown: string | null;
  teammate_driven_loss: boolean;
  status: PostMatchReviewStatus;
  created_at: string;
  reviewed_at: string | null;
}
