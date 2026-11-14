"use client";

import type {
  DecisionStageTab,
  DraftSessionDto,
  DraftSlotDto,
  HeroCatalogItem,
} from "@/lib/draft-session/client-types";
import type { BuildRecommendationPayload } from "@/lib/recommendations/types";

interface DecisionStageShellProps {
  session: DraftSessionDto;
  targetSlot: DraftSlotDto | undefined;
  pickedHero: HeroCatalogItem | undefined;
  activeTab: DecisionStageTab;
  onTabChange: (tab: DecisionStageTab) => void;
  onFocusPickSlot: () => void;
  buildRecommendation: BuildRecommendationPayload | null;
  buildLoading: boolean;
  buildError: string | null;
  onGenerateBuild: () => void;
}

const TABS: { key: DecisionStageTab; label: string }[] = [
  { key: "candidates", label: "Candidate Pick" },
  { key: "build", label: "Build Recommendation" },
  { key: "post-match", label: "Post-Match Review" },
];

export function DecisionStageShell({
  session,
  targetSlot,
  pickedHero,
  activeTab,
  onTabChange,
  onFocusPickSlot,
  buildRecommendation,
  buildLoading,
  buildError,
  onGenerateBuild,
}: DecisionStageShellProps) {
  const isMySlot = session.active_target_slot_index === session.my_slot_index;
  const isLocked = session.status === "locked" || session.phase === "locked";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            Target Ally Slot
          </p>
          <h2 className="text-base font-bold text-zinc-100">
            Ally {session.active_target_slot_index} ·{" "}
            {targetSlot?.role ?? "Role Unassigned"}
            {isMySlot && (
              <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                My Slot (Profile Active)
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.key
                  ? "bg-sky-500 text-zinc-950"
                  : "border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "candidates" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
            <div className="text-xs text-zinc-300">
              {pickedHero ? (
                <span>
                  Assigned Hero:{" "}
                  <strong className="text-zinc-100">{pickedHero.name}</strong> (
                  {pickedHero.lanes.join(" / ")})
                </span>
              ) : (
                <span>
                  No hero picked yet for{" "}
                  <strong className="text-zinc-100">
                    Ally {session.active_target_slot_index}
                  </strong>
                  .
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onFocusPickSlot}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-amber-400"
              >
                Target Pick Cursor
              </button>
              <button
                type="button"
                disabled
                title="Enabled in Issue #13 (Jev + Gemini 4 Hydrogen Candidate Pick engine)"
                className="cursor-not-allowed rounded-lg bg-sky-500/30 px-3 py-1.5 text-xs font-bold text-sky-200/70"
              >
                Get Suggested Heroes
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
            Select a <strong className="text-zinc-200">Target Ally Slot</strong>{" "}
            on the left and log bans/picks via the omnibar. Top 3{" "}
            <code className="text-sky-300">Candidate Pick</code> rankings for{" "}
            {isMySlot ? "My Slot (with Player Profile)" : "teammate slot"}{" "}
            will render here.
          </div>
        </div>
      )}

      {activeTab === "build" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
            <div className="text-xs text-zinc-300">
              {pickedHero ? (
                <span>
                  Build Target:{" "}
                  <strong className="text-zinc-100">{pickedHero.name}</strong> ·{" "}
                  {targetSlot?.role ?? "Role Unassigned"}
                </span>
              ) : (
                <span>
                  Assign a hero to{" "}
                  <strong className="text-zinc-100">
                    Ally {session.active_target_slot_index}
                  </strong>{" "}
                  to generate a 6-item build.
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={!pickedHero || buildLoading}
              onClick={onGenerateBuild}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                !pickedHero || buildLoading
                  ? "cursor-not-allowed bg-emerald-500/20 text-emerald-200/50"
                  : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              }`}
            >
              {buildLoading
                ? "Evaluating Build..."
                : buildRecommendation
                  ? "Regenerate Build"
                  : "Generate Build Recommendation"}
            </button>
          </div>

          {buildError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {buildError}
            </div>
          )}

          {buildLoading && !buildRecommendation && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-xs text-zinc-400">
              Running single-pass Jev evaluation for 6-item build, Emblem, Battle Spell, and situational counters...
            </div>
          )}

          {buildRecommendation ? (
            <div className="flex flex-col gap-3">
              {/* 6-Item Grid */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {buildRecommendation.items.map((item, idx) => {
                  const tagClass =
                    item.tag === "Boots"
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                      : item.tag === "Core"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30";
                  return (
                    <div
                      key={item.slug}
                      className="flex flex-col justify-between gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-zinc-500">
                            #{idx + 1} · {item.gold_cost}g
                          </span>
                          <h3 className="text-xs font-bold text-zinc-100">
                            {item.name}
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${tagClass}`}
                        >
                          {item.tag}
                        </span>
                      </div>
                      {item.blessing && (
                        <div className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                          {item.blessing.category} Blessing: {item.blessing.name}
                        </div>
                      )}
                      <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">
                        {item.unique_passive}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Emblem + Battle Spell */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Emblem Setup
                    </span>
                    <span className="text-xs font-bold text-sky-300">
                      {buildRecommendation.emblem.name}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1 text-[11px] text-zinc-300">
                    <div>
                      <span className="text-zinc-500">T1:</span>{" "}
                      <strong className="text-zinc-100">
                        {buildRecommendation.emblem.tier1.name}
                      </strong>{" "}
                      — {buildRecommendation.emblem.tier1.effect}
                    </div>
                    <div>
                      <span className="text-zinc-500">T2:</span>{" "}
                      <strong className="text-zinc-100">
                        {buildRecommendation.emblem.tier2.name}
                      </strong>{" "}
                      — {buildRecommendation.emblem.tier2.effect}
                    </div>
                    <div>
                      <span className="text-zinc-500">T3:</span>{" "}
                      <strong className="text-zinc-100">
                        {buildRecommendation.emblem.tier3.name}
                      </strong>{" "}
                      — {buildRecommendation.emblem.tier3.effect}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Battle Spell
                    </span>
                    <span className="text-xs font-bold text-amber-300">
                      {buildRecommendation.battle_spell.name} (
                      {buildRecommendation.battle_spell.cooldown_sec}s CD)
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-300">
                    {buildRecommendation.battle_spell.effect}
                  </p>
                </div>
              </div>

              {/* Situational Flags */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Situational Flags:
                </span>
                {Object.entries(buildRecommendation.situational_flags).map(
                  ([key, flag]) => (
                    <span
                      key={key}
                      className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                        flag.triggered
                          ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                          : "border-zinc-800 bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      {flag.label} ({Math.round(flag.probability * 100)}%)
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : (
            !buildLoading && (
              <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
                {isLocked ? (
                  <span>
                    Draft is <strong className="text-emerald-400">locked</strong>. Click{" "}
                    <strong className="text-emerald-300">
                      Generate Build Recommendation
                    </strong>{" "}
                    for{" "}
                    <strong className="text-zinc-200">
                      {pickedHero?.name ?? `Ally ${session.active_target_slot_index}`}
                    </strong>
                    .
                  </span>
                ) : (
                  <span>
                    Lock the draft once all picks are logged to auto-generate a{" "}
                    <code className="text-emerald-300">Build Recommendation</code>{" "}
                    for{" "}
                    <strong className="text-zinc-200">
                      Ally {session.active_target_slot_index}
                    </strong>
                    .
                  </span>
                )}
              </div>
            )
          )}
        </div>
      )}

      {activeTab === "post-match" && (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-zinc-950/70 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-rose-300">
              Post-Match Review (My Slot: Ally {session.my_slot_index})
            </h3>
            <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
              {isLocked ? "Ready after defeat" : "Lock draft first"}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Upload a defeat scoreboard screenshot and optional reflection after
            the match to extract{" "}
            <code className="text-rose-300">Failure Pattern</code> learnings
            for <strong className="text-zinc-200">My Slot</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
