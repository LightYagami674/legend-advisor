"use client";

import { useCallback, useEffect, useState } from "react";
import type { HeroCatalogItem } from "@/lib/draft-session/client-types";
import { LANES, type LaneValue } from "@/lib/draft-session/schema";
import {
  COMFORT_TIERS,
  FAILURE_PATTERN_DIMENSIONS,
  FAILURE_PATTERN_SCOPE_TYPES,
  type FailurePatternDto,
  type HeroComfortPoolDto,
  type PlayerProfileBundleDto,
} from "@/lib/player-profile/schema";

interface PlayerProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  heroes: HeroCatalogItem[];
  onProfileChanged?: () => void;
}

const TIER_STYLES: Record<string, string> = {
  main: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  comfort: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  learning: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  avoid: "border-rose-500/40 bg-rose-500/15 text-rose-300",
};

export function PlayerProfileDrawer({
  open,
  onClose,
  heroes,
  onProfileChanged,
}: PlayerProfileDrawerProps) {
  const [bundle, setBundle] = useState<PlayerProfileBundleDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comfort form state
  const [comfortHeroId, setComfortHeroId] = useState<number>(heroes[0]?.id ?? 0);
  const [comfortTier, setComfortTier] =
    useState<(typeof COMFORT_TIERS)[number]>("main");
  const [comfortNotes, setComfortNotes] = useState("");

  // Failure pattern form state
  const [patternDimension, setPatternDimension] =
    useState<(typeof FAILURE_PATTERN_DIMENSIONS)[number]>("action");
  const [patternKey, setPatternKey] = useState("");
  const [patternRule, setPatternRule] = useState("");
  const [patternScopeType, setPatternScopeType] =
    useState<(typeof FAILURE_PATTERN_SCOPE_TYPES)[number]>("general");
  const [patternScopeValue, setPatternScopeValue] = useState("");
  const [patternFilter, setPatternFilter] = useState<"active" | "resolved">(
    "active",
  );
  const [editingPatternId, setEditingPatternId] = useState<number | null>(null);
  const [editingRule, setEditingRule] = useState("");

  const effectiveComfortHeroId = comfortHeroId || heroes[0]?.id || 0;

  const refreshProfile = useCallback(async () => {
    const res = await fetch("/api/player-profile");
    if (!res.ok) throw new Error("Failed to load Player Profile");
    const data = (await res.json()) as PlayerProfileBundleDto;
    setBundle(data);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/player-profile");
        if (!res.ok) throw new Error("Failed to load Player Profile");
        const data = (await res.json()) as PlayerProfileBundleDto;
        if (!cancelled) {
          setBundle(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const togglePreferredRole = async (lane: LaneValue) => {
    if (!bundle) return;
    const current = bundle.profile.preferred_roles;
    const next = current.includes(lane)
      ? current.filter((r) => r !== lane)
      : [...current, lane];

    const res = await fetch("/api/player-profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferred_roles: next }),
    });
    if (res.ok) {
      await refreshProfile();
      onProfileChanged?.();
    }
  };

  const handleSaveComfort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveComfortHeroId) return;
    setError(null);
    const res = await fetch("/api/player-profile/comfort-pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hero_id: effectiveComfortHeroId,
        comfort_tier: comfortTier,
        notes: comfortNotes.trim(),
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to save comfort entry");
      return;
    }
    setComfortNotes("");
    await refreshProfile();
    onProfileChanged?.();
  };

  const handleUpdateComfortTier = async (
    entry: HeroComfortPoolDto,
    tier: (typeof COMFORT_TIERS)[number],
  ) => {
    const res = await fetch(`/api/player-profile/comfort-pool/${entry.hero_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comfort_tier: tier }),
    });
    if (res.ok) {
      await refreshProfile();
      onProfileChanged?.();
    }
  };

  const handleDeleteComfort = async (heroId: number) => {
    const res = await fetch(`/api/player-profile/comfort-pool/${heroId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refreshProfile();
      onProfileChanged?.();
    }
  };

  const handleCreatePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patternKey.trim() || !patternRule.trim()) return;
    setError(null);
    const res = await fetch("/api/player-profile/failure-patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dimension: patternDimension,
        pattern_key: patternKey.trim(),
        rule: patternRule.trim(),
        scope_type: patternScopeType,
        scope_value:
          patternScopeType === "general" ? null : patternScopeValue.trim() || null,
      }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to save failure pattern");
      return;
    }
    setPatternKey("");
    setPatternRule("");
    setPatternScopeValue("");
    await refreshProfile();
    onProfileChanged?.();
  };

  const handlePatchPattern = async (
    id: number,
    patch: Record<string, unknown>,
  ) => {
    const res = await fetch(`/api/player-profile/failure-patterns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setEditingPatternId(null);
      await refreshProfile();
      onProfileChanged?.();
    }
  };

  const handleDeletePattern = async (id: number) => {
    const res = await fetch(`/api/player-profile/failure-patterns/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await refreshProfile();
      onProfileChanged?.();
    }
  };

  const visiblePatterns: FailurePatternDto[] =
    bundle?.failure_patterns.filter((p) => p.status === patternFilter) ?? [];

  return (
    <div
      role="dialog"
      aria-label="Player Profile & Failure Patterns"
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs"
    >
      <div className="flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-amber-300">
              Player Profile (My Slot Only)
            </h2>
            <p className="text-xs text-zinc-400">
              Applied strictly when Target Ally Slot matches My Slot. Teammate
              slots stay completely isolated.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {loading && !bundle ? (
          <p className="text-xs text-zinc-400">Loading Player Profile…</p>
        ) : (
          <>
            {/* Preferred Roles */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Preferred Roles
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LANES.map((lane) => {
                  const active =
                    bundle?.profile.preferred_roles.includes(lane) ?? false;
                  return (
                    <button
                      key={lane}
                      type="button"
                      onClick={() => togglePreferredRole(lane)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        active
                          ? "border-amber-400/50 bg-amber-400/20 text-amber-200"
                          : "border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500"
                      }`}
                    >
                      {lane}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Hero Comfort Pool */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Hero Comfort Pool
              </h3>
              <form
                onSubmit={handleSaveComfort}
                className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_1fr_auto]"
              >
                <select
                  value={effectiveComfortHeroId}
                  onChange={(e) => setComfortHeroId(Number(e.target.value))}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                >
                  {heroes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.lanes.join("/")})
                    </option>
                  ))}
                </select>
                <select
                  value={comfortTier}
                  onChange={(e) =>
                    setComfortTier(e.target.value as (typeof COMFORT_TIERS)[number])
                  }
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100"
                >
                  {COMFORT_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={comfortNotes}
                  onChange={(e) => setComfortNotes(e.target.value)}
                  placeholder="Comfort / build notes..."
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-sky-400"
                >
                  Save
                </button>
              </form>

              <div className="mt-3 flex flex-col gap-1.5">
                {bundle?.comfort_pool.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No heroes in comfort pool yet.
                  </p>
                ) : (
                  bundle?.comfort_pool.map((entry) => (
                    <div
                      key={entry.hero_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-100">
                            {entry.hero_name}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                              TIER_STYLES[entry.comfort_tier] ?? ""
                            }`}
                          >
                            {entry.comfort_tier}
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                            {entry.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label={`Tier for ${entry.hero_name}`}
                          value={entry.comfort_tier}
                          onChange={(e) =>
                            handleUpdateComfortTier(
                              entry,
                              e.target.value as (typeof COMFORT_TIERS)[number],
                            )
                          }
                          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                        >
                          {COMFORT_TIERS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteComfort(entry.hero_id)}
                          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-rose-300 hover:border-rose-500/50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Failure Patterns */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Failure Patterns
                </h3>
                <div className="flex items-center gap-1">
                  {(["active", "resolved"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setPatternFilter(status)}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${
                        patternFilter === status
                          ? "bg-sky-500 text-zinc-950"
                          : "border border-zinc-700 bg-zinc-950 text-zinc-400"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={handleCreatePattern}
                className="mt-2.5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    value={patternDimension}
                    onChange={(e) =>
                      setPatternDimension(
                        e.target
                          .value as (typeof FAILURE_PATTERN_DIMENSIONS)[number],
                      )
                    }
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  >
                    {FAILURE_PATTERN_DIMENSIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={patternScopeType}
                    onChange={(e) =>
                      setPatternScopeType(
                        e.target
                          .value as (typeof FAILURE_PATTERN_SCOPE_TYPES)[number],
                      )
                    }
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  >
                    {FAILURE_PATTERN_SCOPE_TYPES.map((s) => (
                      <option key={s} value={s}>
                        scope: {s}
                      </option>
                    ))}
                  </select>
                  {patternScopeType !== "general" && (
                    <input
                      type="text"
                      value={patternScopeValue}
                      onChange={(e) => setPatternScopeValue(e.target.value)}
                      placeholder={
                        patternScopeType === "role"
                          ? "Role (e.g. Gold)"
                          : "Hero slug (e.g. layla)"
                      }
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                    />
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto]">
                  <input
                    type="text"
                    value={patternKey}
                    onChange={(e) => setPatternKey(e.target.value)}
                    placeholder="pattern-key"
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  />
                  <input
                    type="text"
                    value={patternRule}
                    onChange={(e) => setPatternRule(e.target.value)}
                    placeholder="Actionable rule..."
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                  />
                  <button
                    type="submit"
                    className="rounded bg-emerald-500 px-3 py-1 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                  >
                    Add / Reinforce
                  </button>
                </div>
              </form>

              <div className="mt-3 flex flex-col gap-2">
                {visiblePatterns.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No {patternFilter} failure patterns.
                  </p>
                ) : (
                  visiblePatterns.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 p-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">
                            {p.dimension}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                            {p.scope_type}
                            {p.scope_value ? `:${p.scope_value}` : ""}
                          </span>
                          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                            ×{p.occurrences}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {p.pattern_key}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handlePatchPattern(p.id, { reinforce: true })
                            }
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-amber-300 hover:border-amber-400"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPatternId(p.id);
                              setEditingRule(p.rule);
                            }}
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-zinc-500"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePatchPattern(p.id, {
                                status:
                                  p.status === "active" ? "resolved" : "active",
                              })
                            }
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:border-emerald-400"
                          >
                            {p.status === "active" ? "Resolve" : "Reopen"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePattern(p.id)}
                            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-rose-300 hover:border-rose-500/50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {editingPatternId === p.id ? (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={editingRule}
                            onChange={(e) => setEditingRule(e.target.value)}
                            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handlePatchPattern(p.id, { rule: editingRule })
                            }
                            className="rounded bg-sky-500 px-2 py-1 text-[11px] font-bold text-zinc-950"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <p className="text-zinc-200">{p.rule}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
