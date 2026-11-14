"use client";

import type {
  DecisionStageTab,
  DraftSessionDto,
  DraftSlotDto,
  HeroCatalogItem,
} from "@/lib/draft-session/client-types";
import type {
  ActionReminderItem,
  BuildRecommendationPayload,
  CandidatePickResponse,
} from "@/lib/recommendations/types";
import { PostMatchReviewTab } from "./PostMatchReviewTab";

interface DecisionStageShellProps {
  session: DraftSessionDto;
  targetSlot: DraftSlotDto | undefined;
  pickedHero: HeroCatalogItem | undefined;
  actionReminders: ActionReminderItem[];
  activeTab: DecisionStageTab;
  onTabChange: (tab: DecisionStageTab) => void;
  onFocusPickSlot: () => void;
  candidateResult: CandidatePickResponse | null;
  candidatesLoading: boolean;
  candidatesError: string | null;
  onRequestCandidates: () => void;
  onPickCandidateHero: (heroId: number) => void;
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
  actionReminders,
  activeTab,
  onTabChange,
  onFocusPickSlot,
  candidateResult,
  candidatesLoading,
  candidatesError,
  onRequestCandidates,
  onPickCandidateHero,
  buildRecommendation,
  buildLoading,
  buildError,
  onGenerateBuild,
}: DecisionStageShellProps) {
  const isMySlot = session.active_target_slot_index === session.my_slot_index;
  const isLocked = session.status === "locked" || session.phase === "locked";
  const matchingCandidates =
    candidateResult &&
    candidateResult.session_id === session.id &&
    candidateResult.target_slot_index === session.active_target_slot_index
      ? candidateResult.candidates
      : null;

  const visibleActionReminders =
    isMySlot && (activeTab === "candidates" || activeTab === "build")
      ? activeTab === "build" && buildRecommendation?.actionReminders
        ? buildRecommendation.actionReminders
        : actionReminders
      : [];

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

      {/* Static Action Reminders (My Slot Only, Candidate Pick & Build Recommendation stages) */}
      {visibleActionReminders.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            My Slot Action Reminders (Active Failure Patterns)
          </span>
          <ul className="flex flex-col gap-1 text-xs text-amber-100">
            {visibleActionReminders.map((reminder) => (
              <li
                key={reminder.id}
                className="flex items-center justify-between gap-2"
              >
                <span>• {reminder.rule}</span>
                <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-200">
                  ×{reminder.occurrences}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                onClick={onRequestCandidates}
                disabled={candidatesLoading || isLocked}
                className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-500/30 disabled:text-sky-200/70"
              >
                {candidatesLoading ? "Ranking..." : "Get Candidate Picks"}
              </button>
            </div>
          </div>

          {candidatesError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {candidatesError}
            </div>
          )}

          {candidatesLoading ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center text-sm text-sky-300">
              Evaluating eligible heroes for Ally {session.active_target_slot_index}...
            </div>
          ) : matchingCandidates && matchingCandidates.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {matchingCandidates.map((candidate) => (
                <div
                  key={candidate.hero_id}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 font-mono text-xs font-bold text-sky-300">
                        #{candidate.rank}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-zinc-100">
                            {candidate.name}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                            {candidate.roles.join(" / ")}
                          </span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                            {candidate.damage_type}
                          </span>
                          {candidate.profileSafe && (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                                candidate.profileSafe.safe
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                  : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                              }`}
                            >
                              {candidate.profileSafe.safe
                                ? `Profile Safe (${Math.round(candidate.profileSafe.probability * 100)}%)`
                                : `Profile Risk (${Math.round(candidate.profileSafe.probability * 100)}%)`}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          {candidate.lanes.join(" / ")} · Win{" "}
                          <span className="font-semibold text-emerald-400">
                            {candidate.win_rate.toFixed(1)}%
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                          Composite
                        </p>
                        <p className="font-mono text-sm font-bold text-sky-300">
                          {(candidate.composite_score * 100).toFixed(1)}%
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => onPickCandidateHero(candidate.hero_id)}
                        className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Pick Hero
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-800/80 pt-2 text-[11px] sm:grid-cols-4">
                    <div className="rounded bg-zinc-900/90 px-2 py-1">
                      <span className="text-zinc-400">Choice Prob</span>
                      <p className="font-mono font-semibold text-zinc-200">
                        {(candidate.choice_prob * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded bg-zinc-900/90 px-2 py-1">
                      <span className="text-zinc-400">Synergy</span>
                      <p className="font-mono font-semibold text-zinc-200">
                        {(candidate.synergy_score * 100).toFixed(0)}%{" "}
                        <span className="font-sans text-[10px] text-zinc-400">
                          ({candidate.synergy_label})
                        </span>
                      </p>
                    </div>
                    <div className="rounded bg-zinc-900/90 px-2 py-1">
                      <span className="text-zinc-400">Counter</span>
                      <p className="font-mono font-semibold text-zinc-200">
                        {(candidate.counter_score * 100).toFixed(0)}%{" "}
                        <span className="font-sans text-[10px] text-zinc-400">
                          ({candidate.counter_label})
                        </span>
                      </p>
                    </div>
                    <div className="rounded bg-zinc-900/90 px-2 py-1">
                      <span className="text-zinc-400">Patch</span>
                      <p className="font-mono font-semibold text-zinc-200">
                        {(candidate.patch_score * 100).toFixed(0)}%{" "}
                        <span className="font-sans text-[10px] text-zinc-400">
                          ({candidate.patch_label})
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
              Select a <strong className="text-zinc-200">Target Ally Slot</strong>{" "}
              on the left and click{" "}
              <strong className="text-sky-300">Get Candidate Picks</strong>. Top 3{" "}
              <code className="text-sky-300">Candidate Pick</code> rankings for{" "}
              {isMySlot ? "My Slot (with Player Profile)" : "teammate slot"}{" "}
              will render here.
            </div>
          )}
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
        <PostMatchReviewTab
          sessionId={session.id}
          mySlotIndex={session.my_slot_index}
          isLocked={isLocked}
        />
      )}
    </div>
  );
}
