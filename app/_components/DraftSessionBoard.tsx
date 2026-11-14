"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LANES, type DraftTeamValue, type LaneValue } from "@/lib/draft-session/schema";
import {
  findNextOpenTarget,
  type ActiveInputTarget,
  type DecisionStageTab,
  type DraftSessionDto,
  type DraftSlotDto,
  type HeroCatalogItem,
} from "@/lib/draft-session/client-types";
import type { BuildRecommendationPayload } from "@/lib/recommendations/types";
import { DecisionStageShell } from "./DecisionStageShell";

interface SessionPayload {
  session: DraftSessionDto;
  slots: DraftSlotDto[];
}

export function DraftSessionBoard() {
  const [heroes, setHeroes] = useState<HeroCatalogItem[]>([]);
  const [session, setSession] = useState<DraftSessionDto | null>(null);
  const [slots, setSlots] = useState<DraftSlotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [laneFilter, setLaneFilter] = useState<LaneValue | "ALL">("ALL");
  const [activeTarget, setActiveTarget] = useState<ActiveInputTarget>({
    kind: "ban",
    team: "ally",
    slot_index: 1,
  });
  const [stageTab, setStageTab] = useState<DecisionStageTab>("candidates");
  const [buildRecs, setBuildRecs] = useState<Record<number, BuildRecommendationPayload>>({});
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  const omnibarInputRef = useRef<HTMLInputElement>(null);

  const applySessionPayload = useCallback((data: SessionPayload) => {
    setSession(data.session);
    setSlots(data.slots);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [heroesRes, sessionRes] = await Promise.all([
          fetch("/api/heroes"),
          fetch("/api/draft-sessions?ensure=true"),
        ]);

        if (!heroesRes.ok || !sessionRes.ok) {
          throw new Error("Failed to load Draft Session data");
        }

        const heroesJson = (await heroesRes.json()) as { heroes: HeroCatalogItem[] };
        const sessionJson = (await sessionRes.json()) as SessionPayload;

        if (cancelled) return;

        setHeroes(heroesJson.heroes);
        applySessionPayload(sessionJson);

        const initialKind = sessionJson.session.phase === "ban" ? "ban" : "pick";
        const initialTarget = findNextOpenTarget(sessionJson.slots, initialKind, {
          kind: initialKind,
          team: "ally",
          slot_index: sessionJson.session.active_target_slot_index,
        });
        setActiveTarget(initialTarget);
        if (sessionJson.session.status === "locked") {
          setStageTab("build");
          const initialSlot = sessionJson.slots.find(
            (s) =>
              s.team === "ally" &&
              s.slot_index === sessionJson.session.active_target_slot_index,
          );
          if (initialSlot?.picked_hero_id) {
            const getRes = await fetch(
              `/api/draft-sessions/${sessionJson.session.id}/build-recommendation?target_slot_index=${initialSlot.slot_index}`,
            );
            if (!cancelled && getRes.ok) {
              const payload = (await getRes.json()) as BuildRecommendationPayload;
              setBuildRecs((prev) => ({
                ...prev,
                [initialSlot.slot_index]: payload,
              }));
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize board");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applySessionPayload]);

  const heroById = useMemo(() => {
    const map = new Map<number, HeroCatalogItem>();
    for (const h of heroes) {
      map.set(h.id, h);
    }
    return map;
  }, [heroes]);

  const takenHeroIds = useMemo(() => {
    const taken = new Set<number>();
    for (const slot of slots) {
      if (slot.banned_hero_id !== null) taken.add(slot.banned_hero_id);
      if (slot.picked_hero_id !== null) taken.add(slot.picked_hero_id);
    }
    return taken;
  }, [slots]);

  const matchingHeroes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return heroes
      .filter((h) => {
        if (takenHeroIds.has(h.id)) return false;
        if (laneFilter !== "ALL" && !h.lanes.includes(laneFilter)) return false;
        if (
          q &&
          !h.name.toLowerCase().includes(q) &&
          !h.lanes.some((l) => l.toLowerCase().includes(q)) &&
          !h.roles.some((r) => r.toLowerCase().includes(q))
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 10);
  }, [heroes, laneFilter, query, takenHeroIds]);

  const allySlots = useMemo(
    () => slots.filter((s) => s.team === "ally").sort((a, b) => a.slot_index - b.slot_index),
    [slots],
  );
  const enemySlots = useMemo(
    () => slots.filter((s) => s.team === "enemy").sort((a, b) => a.slot_index - b.slot_index),
    [slots],
  );

  const patchSession = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!session) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/draft-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update Draft Session");
        }
        applySessionPayload(data as SessionPayload);
        return data as SessionPayload;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update Draft Session");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [applySessionPayload, session],
  );

  const patchSlots = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!session) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/draft-sessions/${session.id}/slots`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update Draft Slot");
        }
        applySessionPayload(data as SessionPayload);
        return data as SessionPayload;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update Draft Slot");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [applySessionPayload, session],
  );

  const handleCreateNewSession = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/draft-sessions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create Draft Session");
      }
      const created = data as SessionPayload;
      applySessionPayload(created);
      setActiveTarget({ kind: "ban", team: "ally", slot_index: 1 });
      setStageTab("candidates");
      setQuery("");
      omnibarInputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Draft Session");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignHero = async (heroId: number) => {
    if (!session) return;
    const target = activeTarget;
    const updatePayload =
      target.kind === "ban"
        ? { team: target.team, slot_index: target.slot_index, banned_hero_id: heroId }
        : { team: target.team, slot_index: target.slot_index, picked_hero_id: heroId };

    const updated = await patchSlots(updatePayload);
    if (!updated) return;

    setQuery("");
    const nextTarget = findNextOpenTarget(updated.slots, target.kind, target);
    setActiveTarget(nextTarget);

    // Advance session phase to "pick" automatically when entering picks
    if (nextTarget.kind === "pick" && updated.session.phase === "ban") {
      await patchSession({ phase: "pick" });
    }
  };

  const handleClearHero = async (
    kind: "ban" | "pick",
    team: DraftTeamValue,
    slotIndex: number,
  ) => {
    const payload =
      kind === "ban"
        ? { team, slot_index: slotIndex, banned_hero_id: null }
        : { team, slot_index: slotIndex, picked_hero_id: null, is_locked: false };
    await patchSlots(payload);
    setActiveTarget({ kind, team, slot_index: slotIndex });
    omnibarInputRef.current?.focus();
  };

  const handleSetRole = async (
    team: DraftTeamValue,
    slotIndex: number,
    roleValue: string,
  ) => {
    const role = roleValue === "" ? null : (roleValue as LaneValue);
    await patchSlots({ team, slot_index: slotIndex, role });
  };

  const handleSelectTargetAllySlot = async (slotIndex: number) => {
    setActiveTarget({ kind: "pick", team: "ally", slot_index: slotIndex });
    omnibarInputRef.current?.focus();
    if (session && session.active_target_slot_index !== slotIndex) {
      await patchSession({ active_target_slot_index: slotIndex });
    }
    if (
      session &&
      stageTab === "build" &&
      (session.status === "locked" || session.phase === "locked") &&
      !buildRecs[slotIndex]
    ) {
      const slot = allySlots.find((s) => s.slot_index === slotIndex);
      if (slot?.picked_hero_id) {
        void fetchOrGenerateBuild(session.id, slotIndex, false);
      }
    }
  };

  const handleSetMySlot = async (slotIndex: number) => {
    await patchSession({ my_slot_index: slotIndex });
  };

  const fetchOrGenerateBuild = useCallback(
    async (
      sessionId: number,
      targetSlotIndex: number,
      forceGenerate: boolean,
    ) => {
      setBuildLoading(true);
      setBuildError(null);
      try {
        if (!forceGenerate) {
          const getRes = await fetch(
            `/api/draft-sessions/${sessionId}/build-recommendation?target_slot_index=${targetSlotIndex}`,
          );
          if (getRes.ok) {
            const payload = (await getRes.json()) as BuildRecommendationPayload;
            setBuildRecs((prev) => ({ ...prev, [targetSlotIndex]: payload }));
            return;
          }
        }

        const postRes = await fetch(
          `/api/draft-sessions/${sessionId}/build-recommendation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target_slot_index: targetSlotIndex }),
          },
        );
        const data = await postRes.json();
        if (!postRes.ok) {
          throw new Error(data.error ?? "Failed to generate Build Recommendation");
        }
        setBuildRecs((prev) => ({
          ...prev,
          [targetSlotIndex]: data as BuildRecommendationPayload,
        }));
      } catch (err) {
        setBuildError(
          err instanceof Error
            ? err.message
            : "Failed to load Build Recommendation",
        );
      } finally {
        setBuildLoading(false);
      }
    },
    [],
  );

  const handleLockDraft = async () => {
    const updated = await patchSession({ lock_all: true });
    if (updated) {
      setStageTab("build");
      const targetSlot = updated.slots.find(
        (s) =>
          s.team === "ally" &&
          s.slot_index === updated.session.active_target_slot_index,
      );
      if (targetSlot?.picked_hero_id) {
        await fetchOrGenerateBuild(
          updated.session.id,
          updated.session.active_target_slot_index,
          true,
        );
      }
    }
  };

  const handleOmnibarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const topMatch = matchingHeroes[0];
    if (!topMatch) return;
    await handleAssignHero(topMatch.id);
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 text-sm text-zinc-400">
        Loading Draft Session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center gap-3 px-4 text-sm text-rose-400">
        <p>{error ?? "Unable to initialize Draft Session."}</p>
        <button
          type="button"
          onClick={handleCreateNewSession}
          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950"
        >
          Retry / Create Session
        </button>
      </div>
    );
  }

  const activeTargetAllySlot = allySlots.find(
    (s) => s.slot_index === session.active_target_slot_index,
  );
  const activeTargetPickedHero =
    activeTargetAllySlot?.picked_hero_id != null
      ? heroById.get(activeTargetAllySlot.picked_hero_id)
      : undefined;
  const isLocked = session.status === "locked" || session.phase === "locked";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-16 pt-4">
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-base font-bold tracking-tight text-zinc-100">
            Legend Advisor
          </h1>
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
            Patch {session.patch_version}
          </span>
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
            Session #{session.id}
          </span>
          {saving && (
            <span className="text-[11px] text-amber-300">Saving…</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCreateNewSession}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-sky-400 hover:text-sky-300"
        >
          + New Draft Session
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Top 10-Ban Ribbon */}
      <section
        aria-label="Ban Ribbon"
        className="grid grid-cols-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 p-2.5 lg:grid-cols-[1fr_auto_1fr]"
      >
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            Ally Bans
          </span>
          {allySlots.map((slot) => {
            const hero =
              slot.banned_hero_id !== null ? heroById.get(slot.banned_hero_id) : undefined;
            const isCursor =
              activeTarget.kind === "ban" &&
              activeTarget.team === "ally" &&
              activeTarget.slot_index === slot.slot_index;
            return (
              <div
                key={`ban-ally-${slot.slot_index}`}
                className={`flex h-9 flex-1 items-center justify-between rounded-lg border px-2 text-xs transition ${
                  isCursor
                    ? "border-amber-400 bg-amber-500/15 text-amber-200"
                    : "border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTarget({ kind: "ban", team: "ally", slot_index: slot.slot_index });
                    omnibarInputRef.current?.focus();
                  }}
                  className="flex-1 truncate text-left"
                >
                  {hero ? hero.name : `B${slot.slot_index}`}
                </button>
                {hero && (
                  <button
                    type="button"
                    aria-label={`Clear Ally Ban ${slot.slot_index}`}
                    onClick={() => handleClearHero("ban", "ally", slot.slot_index)}
                    className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 px-2">
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-[11px] uppercase text-zinc-300">
            Phase: {session.phase}
          </span>
          {!isLocked && (
            <button
              type="button"
              onClick={handleLockDraft}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              Lock Draft
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {enemySlots.map((slot) => {
            const hero =
              slot.banned_hero_id !== null ? heroById.get(slot.banned_hero_id) : undefined;
            const isCursor =
              activeTarget.kind === "ban" &&
              activeTarget.team === "enemy" &&
              activeTarget.slot_index === slot.slot_index;
            return (
              <div
                key={`ban-enemy-${slot.slot_index}`}
                className={`flex h-9 flex-1 items-center justify-between rounded-lg border px-2 text-xs transition ${
                  isCursor
                    ? "border-amber-400 bg-amber-500/15 text-amber-200"
                    : "border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTarget({ kind: "ban", team: "enemy", slot_index: slot.slot_index });
                    omnibarInputRef.current?.focus();
                  }}
                  className="flex-1 truncate text-left"
                >
                  {hero ? hero.name : `B${slot.slot_index}`}
                </button>
                {hero && (
                  <button
                    type="button"
                    aria-label={`Clear Enemy Ban ${slot.slot_index}`}
                    onClick={() => handleClearHero("ban", "enemy", slot.slot_index)}
                    className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
            Enemy Bans
          </span>
        </div>
      </section>

      {/* 2. Keyboard-First Hero Omnibar */}
      <section
        aria-label="Hero Omnibar"
        className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3"
      >
        <form onSubmit={handleOmnibarSubmit} className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 font-mono text-xs font-semibold text-amber-300">
            Target: {activeTarget.team.toUpperCase()}-{activeTarget.slot_index} (
            {activeTarget.kind})
          </div>
          <input
            ref={omnibarInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type hero name (e.g. 'claude', 'tigreal') and press Enter to assign + auto-advance..."
            className="min-w-[240px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {(["ALL", ...LANES] as const).map((lane) => (
              <button
                key={lane}
                type="button"
                onClick={() => setLaneFilter(lane)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  laneFilter === lane
                    ? "bg-sky-500 text-zinc-950"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {lane}
              </button>
            ))}
          </div>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matchingHeroes.length === 0 ? (
            <span className="text-xs text-zinc-500">No matching open heroes</span>
          ) : (
            matchingHeroes.map((hero, idx) => (
              <button
                key={hero.id}
                type="button"
                onClick={() => handleAssignHero(hero.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                  idx === 0 && query.trim().length > 0
                    ? "border-amber-400 bg-amber-500/15 text-amber-200"
                    : "border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-sky-400"
                }`}
              >
                <span className="font-semibold">{hero.name}</span>
                <span className="text-[10px] text-zinc-400">
                  {hero.lanes[0] ?? hero.roles[0]}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* 3. Split-Horizon 3-Column Board */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[290px_1fr_290px]">
        {/* Left: Ally Draft Slots */}
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400">
              Ally Draft Slots
            </h2>
            <span className="text-[11px] text-zinc-400">Click to target</span>
          </div>
          {allySlots.map((slot) => {
            const hero =
              slot.picked_hero_id !== null ? heroById.get(slot.picked_hero_id) : undefined;
            const isMySlot = session.my_slot_index === slot.slot_index;
            const isTarget = session.active_target_slot_index === slot.slot_index;
            const isCursor =
              activeTarget.kind === "pick" &&
              activeTarget.team === "ally" &&
              activeTarget.slot_index === slot.slot_index;

            return (
              <div
                key={`ally-${slot.slot_index}`}
                onClick={() => handleSelectTargetAllySlot(slot.slot_index)}
                className={`cursor-pointer rounded-xl border p-2.5 transition ${
                  isTarget
                    ? "border-sky-400 bg-sky-500/10"
                    : isCursor
                      ? "border-amber-400/70 bg-zinc-950"
                      : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-zinc-400">
                      A{slot.slot_index}
                    </span>
                    <select
                      aria-label={`Ally ${slot.slot_index} Role`}
                      value={slot.role ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        handleSetRole("ally", slot.slot_index, e.target.value)
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                    >
                      <option value="">Role</option>
                      {LANES.map((lane) => (
                        <option key={lane} value={lane}>
                          {lane}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetMySlot(slot.slot_index);
                    }}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                      isMySlot
                        ? "bg-amber-400 text-zinc-950"
                        : "border border-zinc-700 text-zinc-400 hover:border-amber-400 hover:text-amber-300"
                    }`}
                  >
                    {isMySlot ? "★ My Slot" : "Set My Slot"}
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">
                    {hero ? hero.name : "— Open Pick —"}
                  </span>
                  {hero && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearHero("pick", "ally", slot.slot_index);
                      }}
                      className="text-xs text-zinc-500 hover:text-rose-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center: Decision Stage Shell */}
        <DecisionStageShell
          session={session}
          targetSlot={activeTargetAllySlot}
          pickedHero={activeTargetPickedHero}
          activeTab={stageTab}
          onTabChange={(tab) => {
            setStageTab(tab);
            if (
              tab === "build" &&
              isLocked &&
              activeTargetAllySlot?.picked_hero_id &&
              !buildRecs[session.active_target_slot_index] &&
              !buildLoading
            ) {
              void fetchOrGenerateBuild(
                session.id,
                session.active_target_slot_index,
                false,
              );
            }
          }}
          onFocusPickSlot={() => {
            setActiveTarget({
              kind: "pick",
              team: "ally",
              slot_index: session.active_target_slot_index,
            });
            omnibarInputRef.current?.focus();
          }}
          buildRecommendation={
            buildRecs[session.active_target_slot_index] ?? null
          }
          buildLoading={buildLoading}
          buildError={buildError}
          onGenerateBuild={() => {
            void fetchOrGenerateBuild(
              session.id,
              session.active_target_slot_index,
              true,
            );
          }}
        />

        {/* Right: Enemy Draft Slots */}
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Enemy Draft Slots
            </h2>
            <span className="text-[11px] text-zinc-400">Click to log pick</span>
          </div>
          {enemySlots.map((slot) => {
            const hero =
              slot.picked_hero_id !== null ? heroById.get(slot.picked_hero_id) : undefined;
            const isCursor =
              activeTarget.kind === "pick" &&
              activeTarget.team === "enemy" &&
              activeTarget.slot_index === slot.slot_index;

            return (
              <div
                key={`enemy-${slot.slot_index}`}
                onClick={() => {
                  setActiveTarget({ kind: "pick", team: "enemy", slot_index: slot.slot_index });
                  omnibarInputRef.current?.focus();
                }}
                className={`cursor-pointer rounded-xl border p-2.5 transition ${
                  isCursor
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-zinc-400">
                      E{slot.slot_index}
                    </span>
                    <select
                      aria-label={`Enemy ${slot.slot_index} Role`}
                      value={slot.role ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        handleSetRole("enemy", slot.slot_index, e.target.value)
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                    >
                      <option value="">Role</option>
                      {LANES.map((lane) => (
                        <option key={lane} value={lane}>
                          {lane}
                        </option>
                      ))}
                    </select>
                  </div>
                  {hero && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearHero("pick", "enemy", slot.slot_index);
                      }}
                      className="text-xs text-zinc-500 hover:text-rose-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {hero ? hero.name : "— Open Pick —"}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
