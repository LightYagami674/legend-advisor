"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PostMatchReviewDto } from "@/lib/post-match-review/schema";

interface PostMatchReviewTabProps {
  sessionId: number;
  mySlotIndex: number;
  isLocked: boolean;
}

export function PostMatchReviewTab({
  sessionId,
  mySlotIndex,
  isLocked,
}: PostMatchReviewTabProps) {
  const [reviews, setReviews] = useState<PostMatchReviewDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);

  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

  const fetchReviews = useCallback(async (id: number): Promise<PostMatchReviewDto[]> => {
    const res = await fetch(`/api/draft-sessions/${id}/post-match-reviews`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to load Post-Match Reviews");
    }
    const body = await res.json();
    return body.reviews ?? [];
  }, []);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextReviews = await fetchReviews(sessionId);
      setReviews(nextReviews);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Post-Match Reviews",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchReviews, sessionId]);

  useEffect(() => {
    let active = true;
    fetchReviews(sessionId)
      .then((nextReviews) => {
        if (active) {
          setReviews(nextReviews);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Post-Match Reviews",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [fetchReviews, sessionId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primaryFile) {
      setError("Primary Scoreboard screenshot is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("draft_session_id", String(sessionId));
      formData.set("screenshot", primaryFile);
      if (secondaryFile) {
        formData.set("secondary_screenshot", secondaryFile);
      }
      if (reflection.trim().length > 0) {
        formData.set("user_reflection", reflection.trim());
      }

      const res = await fetch("/api/post-match-reviews", {
        method: "POST",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to upload Post-Match Review");
      }

      setPrimaryFile(null);
      setSecondaryFile(null);
      setReflection("");
      if (primaryInputRef.current) primaryInputRef.current.value = "";
      if (secondaryInputRef.current) secondaryInputRef.current.value = "";
      await loadReviews();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload Post-Match Review",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-zinc-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-rose-300">
              Post-Match Review (My Slot: Ally {mySlotIndex})
            </h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Capture-only submission: upload your defeat Scoreboard screenshot
              (and optional Data-tab screenshot) for the{" "}
              <code className="text-rose-300">post-match-review</code> skill to
              analyze.
            </p>
          </div>
          <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
            {isLocked ? "Draft Locked · Ready" : "Draft Unlocked"}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-300">
              <span className="font-semibold">
                Primary Scoreboard Screenshot{" "}
                <span className="text-rose-400">*</span>
              </span>
              <input
                ref={primaryInputRef}
                type="file"
                accept="image/*"
                required
                onChange={(e) => setPrimaryFile(e.target.files?.[0] ?? null)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-zinc-200 hover:file:bg-zinc-700"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-300">
              <span className="font-semibold">
                Secondary Data-Tab Screenshot (Optional)
              </span>
              <input
                ref={secondaryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setSecondaryFile(e.target.files?.[0] ?? null)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-zinc-200 hover:file:bg-zinc-700"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-300">
            <span className="font-semibold">
              User Reflection (Optional)
            </span>
            <textarea
              rows={2}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What felt difficult in lane, teamfights, or itemization?"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400 focus:outline-none"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => void loadReviews()}
              disabled={loading}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh Reviews"}
            </button>
            <button
              type="submit"
              disabled={submitting || !primaryFile}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-500/30 disabled:text-rose-200/70"
            >
              {submitting ? "Uploading..." : "Save Post-Match Review"}
            </button>
          </div>
        </form>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-500">
          No Post-Match Reviews saved for Draft Session #{sessionId} yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="flex flex-col gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-zinc-200">
                    Review #{review.id}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${
                      review.status === "reviewed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {review.status}
                  </span>
                  {review.teammate_driven_loss && (
                    <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                      Teammate-Driven Loss · 0 Personal Faults
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-zinc-500">
                  {new Date(review.created_at).toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap gap-3 font-mono text-[11px] text-zinc-400">
                <span>Primary: {review.screenshot_path}</span>
                {review.secondary_screenshot_path && (
                  <span>Data Tab: {review.secondary_screenshot_path}</span>
                )}
              </div>

              {review.user_reflection && (
                <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
                  <strong className="text-zinc-200">Reflection:</strong>{" "}
                  {review.user_reflection}
                </p>
              )}

              {review.status === "pending" && (
                <p className="text-xs text-amber-300/90">
                  Pending analysis. Run the{" "}
                  <code className="font-mono">post-match-review</code> skill in
                  chat to inspect the saved screenshots and record{" "}
                  <code className="font-mono">Failure Pattern</code> learnings.
                </p>
              )}

              {review.status === "reviewed" && review.analysis_markdown && (
                <div className="rounded-lg border border-emerald-500/20 bg-zinc-900/80 p-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-emerald-300">
                    <span className="font-semibold uppercase tracking-wider">
                      Analysis Markdown
                    </span>
                    {review.reviewed_at && (
                      <span className="font-mono text-zinc-500">
                        Reviewed {new Date(review.reviewed_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-200">
                    {review.analysis_markdown}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
