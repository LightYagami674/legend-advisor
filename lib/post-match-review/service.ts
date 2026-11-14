import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import { draftSessions, postMatchReviews } from "@/db/schema";
import { upsertOrReinforceFailurePattern } from "@/lib/player-profile/service";
import type { FailurePatternDto } from "@/lib/player-profile/schema";
import {
  ReviewPostMatchSchema,
  type PostMatchReviewDto,
} from "./schema";

/**
 * Resolves the default local filesystem directory for uploaded post-match screenshots.
 */
export function getDefaultUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads");
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function resolveImageExtension(file: File): string {
  const fromName = extname(file.name).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,5}$/.test(fromName)) {
    return fromName;
  }
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/webp") return ".webp";
  return ".png";
}

async function saveUploadedImage(
  file: File,
  uploadDir: string,
  sessionId: number,
  slotLabel: "primary" | "secondary",
): Promise<string> {
  mkdirSync(uploadDir, { recursive: true });
  const ext = resolveImageExtension(file);
  const filename = `session-${sessionId}-${Date.now()}-${randomUUID().slice(0, 8)}-${slotLabel}${ext}`;
  const fullPath = join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(fullPath, buffer);
  return filename;
}

/**
 * Lists post_match_reviews, optionally filtered by draft_session_id, newest first.
 */
export function listPostMatchReviews(
  db: AppDatabase,
  draftSessionId?: number,
): PostMatchReviewDto[] {
  const query = draftSessionId
    ? db
        .select()
        .from(postMatchReviews)
        .where(eq(postMatchReviews.draft_session_id, draftSessionId))
    : db.select().from(postMatchReviews);

  return query
    .orderBy(desc(postMatchReviews.created_at), desc(postMatchReviews.id))
    .all();
}

/**
 * Fetches a single post_match_reviews row by id.
 */
export function getPostMatchReviewById(
  db: AppDatabase,
  reviewId: number,
): PostMatchReviewDto | null {
  return (
    db
      .select()
      .from(postMatchReviews)
      .where(eq(postMatchReviews.id, reviewId))
      .get() ?? null
  );
}

/**
 * Handles POST /api/post-match-reviews (multipart/form-data).
 * Validates draft_session_id and required primary Scoreboard screenshot,
 * persists uploaded image(s) to uploadDir, and inserts a pending review.
 */
export async function handlePostPostMatchReview(
  request: Request,
  db: AppDatabase,
  uploadDir: string = getDefaultUploadDir(),
): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected multipart/form-data payload" },
      { status: 400 },
    );
  }

  const rawSessionId = formData.get("draft_session_id");
  const sessionId = parsePositiveInt(
    typeof rawSessionId === "string" ? rawSessionId : null,
  );
  if (!sessionId) {
    return Response.json(
      { error: "draft_session_id must be a positive integer" },
      { status: 400 },
    );
  }

  const session = db
    .select({ id: draftSessions.id })
    .from(draftSessions)
    .where(eq(draftSessions.id, sessionId))
    .get();
  if (!session) {
    return Response.json(
      { error: "Draft Session not found" },
      { status: 404 },
    );
  }

  const primaryFile = formData.get("screenshot");
  if (!(primaryFile instanceof File) || primaryFile.size === 0) {
    return Response.json(
      { error: "Primary Scoreboard screenshot file is required" },
      { status: 400 },
    );
  }

  const secondaryEntry = formData.get("secondary_screenshot");
  const secondaryFile =
    secondaryEntry instanceof File && secondaryEntry.size > 0
      ? secondaryEntry
      : null;

  const rawReflection = formData.get("user_reflection");
  const userReflection =
    typeof rawReflection === "string" && rawReflection.trim().length > 0
      ? rawReflection.trim()
      : null;

  const screenshotPath = await saveUploadedImage(
    primaryFile,
    uploadDir,
    sessionId,
    "primary",
  );
  const secondaryScreenshotPath = secondaryFile
    ? await saveUploadedImage(secondaryFile, uploadDir, sessionId, "secondary")
    : null;

  const now = new Date().toISOString();
  const review = db
    .insert(postMatchReviews)
    .values({
      draft_session_id: sessionId,
      screenshot_path: screenshotPath,
      secondary_screenshot_path: secondaryScreenshotPath,
      user_reflection: userReflection,
      analysis_markdown: null,
      teammate_driven_loss: false,
      status: "pending",
      created_at: now,
      reviewed_at: null,
    })
    .returning()
    .get();

  return Response.json({ review }, { status: 201 });
}

/**
 * Handles GET /api/post-match-reviews and GET /api/draft-sessions/[id]/post-match-reviews.
 */
export async function handleGetPostMatchReviews(
  request: Request,
  db: AppDatabase,
  explicitSessionId?: string,
): Promise<Response> {
  const url = new URL(request.url);
  const rawSessionId =
    explicitSessionId ?? url.searchParams.get("draft_session_id");

  if (rawSessionId !== null) {
    const sessionId = parsePositiveInt(rawSessionId);
    if (!sessionId) {
      return Response.json(
        { error: "Invalid draft_session_id" },
        { status: 400 },
      );
    }

    if (explicitSessionId !== undefined) {
      const session = db
        .select({ id: draftSessions.id })
        .from(draftSessions)
        .where(eq(draftSessions.id, sessionId))
        .get();
      if (!session) {
        return Response.json(
          { error: "Draft Session not found" },
          { status: 404 },
        );
      }
    }

    return Response.json(
      { reviews: listPostMatchReviews(db, sessionId) },
      { status: 200 },
    );
  }

  return Response.json({ reviews: listPostMatchReviews(db) }, { status: 200 });
}

/**
 * Handles GET /api/post-match-reviews/[id].
 */
export async function handleGetPostMatchReview(
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const reviewId = parsePositiveInt(rawId);
  if (!reviewId) {
    return Response.json({ error: "Invalid review id" }, { status: 400 });
  }

  const review = getPostMatchReviewById(db, reviewId);
  if (!review) {
    return Response.json(
      { error: "Post-Match Review not found" },
      { status: 404 },
    );
  }

  return Response.json({ review }, { status: 200 });
}

/**
 * Handles PATCH /api/post-match-reviews/[id].
 * Marks the review as 'reviewed', saves analysis_markdown & teammate_driven_loss,
 * and commits user-confirmed Failure Patterns (at most 1 per dimension, 0 when teammate_driven_loss = true).
 */
export async function handlePatchPostMatchReview(
  request: Request,
  rawId: string,
  db: AppDatabase,
): Promise<Response> {
  const reviewId = parsePositiveInt(rawId);
  if (!reviewId) {
    return Response.json({ error: "Invalid review id" }, { status: 400 });
  }

  const existing = getPostMatchReviewById(db, reviewId);
  if (!existing) {
    return Response.json(
      { error: "Post-Match Review not found" },
      { status: 404 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReviewPostMatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid Post-Match Review payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { analysis_markdown, teammate_driven_loss, confirmed_patterns } =
    parsed.data;
  const now = new Date().toISOString();

  const result = db.transaction((tx) => {
    const updatedReview = tx
      .update(postMatchReviews)
      .set({
        analysis_markdown,
        teammate_driven_loss,
        status: "reviewed",
        reviewed_at: now,
      })
      .where(eq(postMatchReviews.id, reviewId))
      .returning()
      .get();

    const committedPatterns: FailurePatternDto[] = [];
    if (!teammate_driven_loss) {
      for (const candidate of confirmed_patterns) {
        const { pattern } = upsertOrReinforceFailurePattern(
          tx as unknown as AppDatabase,
          {
            dimension: candidate.dimension,
            pattern_key: candidate.pattern_key,
            rule: candidate.rule,
            scope_type: candidate.scope_type,
            scope_value: candidate.scope_value ?? null,
            last_seen_review_id: String(reviewId),
          },
        );
        committedPatterns.push(pattern);
      }
    }

    return { review: updatedReview, committed_patterns: committedPatterns };
  });

  return Response.json(result, { status: 200 });
}
