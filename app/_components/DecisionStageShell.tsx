"use client";

import type {
  DecisionStageTab,
  DraftSessionDto,
  DraftSlotDto,
  HeroCatalogItem,
} from "@/lib/draft-session/client-types";

interface DecisionStageShellProps {
  session: DraftSessionDto;
  targetSlot: DraftSlotDto | undefined;
  pickedHero: HeroCatalogItem | undefined;
  activeTab: DecisionStageTab;
  onTabChange: (tab: DecisionStageTab) => void;
  onFocusPickSlot: () => void;
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
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
            {isLocked ? (
              <span>
                Draft is <strong className="text-emerald-400">locked</strong>.{" "}
                <code className="text-emerald-300">Build Recommendation</code>{" "}
                for{" "}
                <strong className="text-zinc-200">
                  {pickedHero?.name ?? `Ally ${session.active_target_slot_index}`}
                </strong>{" "}
                (items, Emblem, Battle Spell) will render here.
              </span>
            ) : (
              <span>
                Lock the draft once all picks are logged to generate a{" "}
                <code className="text-emerald-300">Build Recommendation</code>{" "}
                for{" "}
                <strong className="text-zinc-200">
                  Ally {session.active_target_slot_index}
                </strong>
                .
              </span>
            )}
          </div>
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
