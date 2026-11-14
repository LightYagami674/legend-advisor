import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type AppDatabase } from "@/db";
import { handleCreateDraftSession } from "@/lib/draft-session/handlers";
import {
  handleGetPostMatchReview,
  handleGetPostMatchReviews,
  handlePatchPostMatchReview,
  handlePostPostMatchReview,
} from "@/lib/post-match-review/service";
import { handleGetPlayerProfile } from "@/lib/player-profile/service";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function createSession(db: AppDatabase): Promise<number> {
  const res = await handleCreateDraftSession(
    new Request("http://localhost/api/draft-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ my_slot_index: 2 }),
    }),
    db,
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.session.id as number;
}

describe("Post-Match Review API & persistence", () => {
  let db: AppDatabase;
  let uploadDir: string;

  beforeEach(() => {
    db = createDatabase(":memory:");
    uploadDir = mkdtempSync(join(tmpdir(), "legend-advisor-reviews-"));
  });

  afterEach(() => {
    rmSync(uploadDir, { recursive: true, force: true });
  });

  test("uploads primary + optional secondary Data-tab screenshots, persists files locally, and creates a pending review linked to draft_session_id", async () => {
    const sessionId = await createSession(db);

    const formData = new FormData();
    formData.set("draft_session_id", String(sessionId));
    formData.set(
      "screenshot",
      new File([PNG_BYTES], "scoreboard.png", { type: "image/png" }),
    );
    formData.set(
      "secondary_screenshot",
      new File([PNG_BYTES], "data-tab.png", { type: "image/png" }),
    );
    formData.set(
      "user_reflection",
      "Overextended without vision before Lord spawned.",
    );

    const postRes = await handlePostPostMatchReview(
      new Request("http://localhost/api/post-match-reviews", {
        method: "POST",
        body: formData,
      }),
      db,
      uploadDir,
    );

    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.review.draft_session_id).toBe(sessionId);
    expect(postBody.review.status).toBe("pending");
    expect(postBody.review.teammate_driven_loss).toBe(false);
    expect(postBody.review.user_reflection).toBe(
      "Overextended without vision before Lord spawned.",
    );
    expect(postBody.review.analysis_markdown).toBeNull();
    expect(postBody.review.reviewed_at).toBeNull();
    expect(typeof postBody.review.screenshot_path).toBe("string");
    expect(typeof postBody.review.secondary_screenshot_path).toBe("string");

    const primaryFullPath = join(uploadDir, postBody.review.screenshot_path);
    const secondaryFullPath = join(
      uploadDir,
      postBody.review.secondary_screenshot_path,
    );
    expect(existsSync(primaryFullPath)).toBe(true);
    expect(existsSync(secondaryFullPath)).toBe(true);
    expect(new Uint8Array(readFileSync(primaryFullPath))).toEqual(PNG_BYTES);
    expect(new Uint8Array(readFileSync(secondaryFullPath))).toEqual(PNG_BYTES);

    // Reject missing primary screenshot (400) and missing draft_session (404)
    const missingFileForm = new FormData();
    missingFileForm.set("draft_session_id", String(sessionId));
    const missingFileRes = await handlePostPostMatchReview(
      new Request("http://localhost/api/post-match-reviews", {
        method: "POST",
        body: missingFileForm,
      }),
      db,
      uploadDir,
    );
    expect(missingFileRes.status).toBe(400);

    const badSessionForm = new FormData();
    badSessionForm.set("draft_session_id", "99999");
    badSessionForm.set(
      "screenshot",
      new File([PNG_BYTES], "scoreboard.png", { type: "image/png" }),
    );
    const badSessionRes = await handlePostPostMatchReview(
      new Request("http://localhost/api/post-match-reviews", {
        method: "POST",
        body: badSessionForm,
      }),
      db,
      uploadDir,
    );
    expect(badSessionRes.status).toBe(404);
  });

  test("lists reviews by draft_session_id, marks review as reviewed, and commits confirmed Failure Patterns with last_seen_review_id", async () => {
    const sessionId = await createSession(db);

    const formData = new FormData();
    formData.set("draft_session_id", String(sessionId));
    formData.set(
      "screenshot",
      new File([PNG_BYTES], "scoreboard.png", { type: "image/png" }),
    );
    const createRes = await handlePostPostMatchReview(
      new Request("http://localhost/api/post-match-reviews", {
        method: "POST",
        body: formData,
      }),
      db,
      uploadDir,
    );
    expect(createRes.status).toBe(201);
    const { review: createdReview } = await createRes.json();

    // GET list filtered by draft_session_id
    const listRes = await handleGetPostMatchReviews(
      new Request(
        `http://localhost/api/post-match-reviews?draft_session_id=${sessionId}`,
      ),
      db,
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.reviews).toHaveLength(1);
    expect(listBody.reviews[0].id).toBe(createdReview.id);

    // Reject duplicate dimension in confirmed_patterns
    const dupDimRes = await handlePatchPostMatchReview(
      new Request(`http://localhost/api/post-match-reviews/${createdReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_markdown: "## Summary\nLost late game.",
          teammate_driven_loss: false,
          confirmed_patterns: [
            {
              dimension: "action",
              pattern_key: "action-1",
              rule: "Avoid face-checking bushes before Lord.",
              scope_type: "general",
            },
            {
              dimension: "action",
              pattern_key: "action-2",
              rule: "Check minimap before pushing.",
              scope_type: "general",
            },
          ],
        }),
      }),
      String(createdReview.id),
      db,
    );
    expect(dupDimRes.status).toBe(400);

    // Valid review completion with 1 action + 1 build pattern
    const patchRes = await handlePatchPostMatchReview(
      new Request(`http://localhost/api/post-match-reviews/${createdReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_markdown:
            "## Post-Match Analysis\n- **My Slot**: 2/7/4, 580 GPM\n- Missed Antique Cuirass against burst.",
          teammate_driven_loss: false,
          confirmed_patterns: [
            {
              dimension: "action",
              pattern_key: "face-check-lord",
              rule: "Avoid face-checking river bushes when enemy roamer is missing.",
              scope_type: "general",
            },
            {
              dimension: "build",
              pattern_key: "skip-anti-burst-armor",
              rule: "Prioritize Antique Cuirass earlier against physical skill-burst.",
              scope_type: "role",
              scope_value: "EXP",
            },
          ],
        }),
      }),
      String(createdReview.id),
      db,
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.review.status).toBe("reviewed");
    expect(patchBody.review.teammate_driven_loss).toBe(false);
    expect(patchBody.review.reviewed_at).not.toBeNull();
    expect(patchBody.review.analysis_markdown).toContain("580 GPM");
    expect(patchBody.committed_patterns).toHaveLength(2);

    // Verify GET by id reflects reviewed state
    const getOneRes = await handleGetPostMatchReview(
      String(createdReview.id),
      db,
    );
    expect(getOneRes.status).toBe(200);
    const getOneBody = await getOneRes.json();
    expect(getOneBody.review.status).toBe("reviewed");

    // Verify Player Profile persisted both patterns with last_seen_review_id
    const profileRes = await handleGetPlayerProfile(db);
    expect(profileRes.status).toBe(200);
    const profileBody = await profileRes.json();
    expect(profileBody.failure_patterns).toHaveLength(2);
    for (const pattern of profileBody.failure_patterns) {
      expect(pattern.occurrences).toBe(1);
      expect(pattern.status).toBe("active");
      expect(pattern.last_seen_review_id).toBe(String(createdReview.id));
    }
  });

  test("enforces 0 personal Failure Patterns when teammate_driven_loss is true", async () => {
    const sessionId = await createSession(db);

    const formData = new FormData();
    formData.set("draft_session_id", String(sessionId));
    formData.set(
      "screenshot",
      new File([PNG_BYTES], "scoreboard.png", { type: "image/png" }),
    );
    const createRes = await handlePostPostMatchReview(
      new Request("http://localhost/api/post-match-reviews", {
        method: "POST",
        body: formData,
      }),
      db,
      uploadDir,
    );
    const { review } = await createRes.json();

    // Reject teammate_driven_loss = true with confirmed_patterns
    const invalidRes = await handlePatchPostMatchReview(
      new Request(`http://localhost/api/post-match-reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_markdown: "Teammates fed early.",
          teammate_driven_loss: true,
          confirmed_patterns: [
            {
              dimension: "action",
              pattern_key: "should-not-commit",
              rule: "Should not be committed on teammate-driven loss.",
              scope_type: "general",
            },
          ],
        }),
      }),
      String(review.id),
      db,
    );
    expect(invalidRes.status).toBe(400);

    // Accept teammate_driven_loss = true with 0 personal faults
    const validRes = await handlePatchPostMatchReview(
      new Request(`http://localhost/api/post-match-reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_markdown:
            "## Teammate-Driven Loss\nMy Slot held lane and rotated cleanly; 0 personal faults recorded.",
          teammate_driven_loss: true,
          confirmed_patterns: [],
        }),
      }),
      String(review.id),
      db,
    );
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.review.status).toBe("reviewed");
    expect(validBody.review.teammate_driven_loss).toBe(true);
    expect(validBody.committed_patterns).toHaveLength(0);

    const profileRes = await handleGetPlayerProfile(db);
    const profileBody = await profileRes.json();
    expect(profileBody.failure_patterns).toHaveLength(0);
  });
});
