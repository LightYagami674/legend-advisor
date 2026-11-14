'use client';

import { useState, useMemo } from 'react';
import {
  ACTIVE_FAILURE_PATTERNS,
  MOCK_HEROES,
  ROLES,
  Role,
  getHeroById,
  computeBuildRecommendation,
} from './types';
import type { VariantProps } from './VariantA';

type StepId = 'setup' | 'bans' | 'picks' | 'build' | 'review';

const STEPS: { id: StepId; num: string; title: string; subtitle: string }[] = [
  { id: 'setup', num: '01', title: 'My Slot & Role', subtitle: 'Declare lane + profile' },
  { id: 'bans', num: '02', title: 'Ban Phase (10)', subtitle: 'Rapid 5v5 ban log' },
  { id: 'picks', num: '03', title: 'Pick Phase (10)', subtitle: 'Picks + Candidate Picks' },
  { id: 'build', num: '04', title: 'Build Recommendation', subtitle: 'Items, Emblem, Spell' },
  { id: 'review', num: '05', title: 'Post-Match Review', subtitle: 'Defeat upload + notes' },
];

export function VariantC({
  state,
  onSetMySlot,
  onSetTargetAllySlot,
  onSetSlotRole,
  onSetActiveTarget,
  onAssignHero,
  onClearHero,
  onGetSuggestedHeroes,
  onLockAll,
  onUpdatePostMatch,
}: VariantProps) {
  const [step, setStep] = useState<StepId>(
    state.phase === 'locked' ? 'build' : state.phase === 'picks' ? 'picks' : 'setup'
  );
  const [quickSearch, setQuickSearch] = useState('');

  const allySlots = state.slots.filter((s) => s.team === 'ally');
  const enemySlots = state.slots.filter((s) => s.team === 'enemy');
  const targetSlot = state.slots.find((s) => s.id === state.targetAllySlotId) ?? allySlots[0];
  const buildRec = computeBuildRecommendation(state.slots, state.targetAllySlotId, state.mySlotId);

  const takenHeroIds = useMemo(
    () =>
      new Set(
        state.slots
          .flatMap((s) => [s.bannedHeroId, s.pickedHeroId])
          .filter((x): x is string => Boolean(x))
      ),
    [state.slots]
  );

  const quickHeroes = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    return MOCK_HEROES.filter(
      (h) => !takenHeroIds.has(h.id) && (!q || h.name.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [quickSearch, takenHeroIds]);

  const banCount = state.slots.filter((s) => s.bannedHeroId).length;
  const pickCount = state.slots.filter((s) => s.pickedHeroId).length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-20 pt-3">
      {/* Pinned Compact Draft Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-sky-400">ALLY:</span>
          {allySlots.map((s) => {
            const h = getHeroById(s.pickedHeroId);
            return (
              <span
                key={s.id}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                  s.id === state.mySlotId
                    ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {s.role}: {h ? h.name : '—'}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-rose-400">ENEMY:</span>
          {enemySlots.map((s) => {
            const h = getHeroById(s.pickedHeroId);
            return (
              <span
                key={s.id}
                className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300"
              >
                {h ? h.name : `E${s.slotNumber}`}
              </span>
            );
          })}
        </div>
      </div>

      {/* Main Stepper Layout */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
        {/* Left Vertical Phase Rail */}
        <nav className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5">
          {STEPS.map((s) => {
            const active = step === s.id;
            const badge =
              s.id === 'bans'
                ? `${banCount}/10`
                : s.id === 'picks'
                  ? `${pickCount}/10`
                  : null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                  active
                    ? 'border-amber-400 bg-amber-500/15 text-zinc-100'
                    : 'border-transparent bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <div>
                  <div className="text-xs font-bold">
                    <span className="mr-1.5 font-mono text-amber-400">{s.num}</span>
                    {s.title}
                  </div>
                  <div className="text-[10px] text-zinc-500">{s.subtitle}</div>
                </div>
                {badge && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Single-Focus Stage */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          {step === 'setup' && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-bold text-zinc-100">
                  Step 1 · Select Your My Slot & Role
                </h2>
                <p className="text-xs text-zinc-400">
                  Personal Player Profile Failure Patterns only apply to My Slot.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                {allySlots.map((slot) => {
                  const isMine = state.mySlotId === slot.id;
                  return (
                    <div
                      key={slot.id}
                      onClick={() => {
                        onSetMySlot(slot.id);
                        onSetTargetAllySlot(slot.id);
                      }}
                      className={`cursor-pointer rounded-xl border p-3 transition ${
                        isMine
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-xs font-bold text-zinc-200">
                        Ally {slot.slotNumber} {isMine && '★'}
                      </div>
                      <select
                        value={slot.role}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSetSlotRole(slot.id, e.target.value as Role)}
                        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onSetActiveTarget('ban', 'ally-1');
                    setStep('bans');
                  }}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-300"
                >
                  Continue to Ban Phase →
                </button>
              </div>
            </div>
          )}

          {step === 'bans' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-100">
                  Step 2 · Rapid 10-Ban Logger ({banCount}/10)
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    onSetActiveTarget('pick', state.mySlotId);
                    setStep('picks');
                  }}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950"
                >
                  Proceed to Picks →
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Ally Bans', list: allySlots, color: 'text-sky-400' },
                  { label: 'Enemy Bans', list: enemySlots, color: 'text-rose-400' },
                ].map((group) => (
                  <div key={group.label} className="flex flex-col gap-1.5">
                    <span className={`text-xs font-bold uppercase ${group.color}`}>
                      {group.label}
                    </span>
                    {group.list.map((slot) => {
                      const hero = getHeroById(slot.bannedHeroId);
                      const active =
                        state.activeInputTarget.kind === 'ban' &&
                        state.activeInputTarget.slotId === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => onSetActiveTarget('ban', slot.id)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                            active
                              ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-200'
                          }`}
                        >
                          <span>
                            Slot {slot.slotNumber}: {hero ? hero.name : '— Tap to ban —'}
                          </span>
                          {hero && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onClearHero('ban', slot.id);
                              }}
                              className="text-zinc-500 hover:text-rose-400"
                            >
                              ✕
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <input
                  type="text"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={`Quick-ban for ${state.activeInputTarget.slotId.toUpperCase()}...`}
                  className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100"
                />
                <div className="flex flex-wrap gap-1.5">
                  {quickHeroes.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        onAssignHero('ban', state.activeInputTarget.slotId, h.id);
                        setQuickSearch('');
                      }}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:border-amber-400"
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'picks' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  Step 3 · Pick Phase & Candidate Picks ({pickCount}/10)
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onGetSuggestedHeroes(targetSlot.id)}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950"
                  >
                    Get Suggested Heroes ({targetSlot.role})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLockAll();
                      setStep('build');
                    }}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Lock Picks → Build
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-sky-400">
                    Click any Target Ally Slot
                  </span>
                  {allySlots.map((slot) => {
                    const hero = getHeroById(slot.pickedHeroId);
                    const isTarget = state.targetAllySlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          onSetTargetAllySlot(slot.id);
                          onSetActiveTarget('pick', slot.id);
                        }}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                          isTarget
                            ? 'border-sky-400 bg-sky-500/15 text-zinc-100'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300'
                        }`}
                      >
                        <span>
                          A{slot.slotNumber} ({slot.role}){' '}
                          {slot.id === state.mySlotId ? '★ My Slot' : ''}
                        </span>
                        <span className="font-bold">{hero ? hero.name : 'Open'}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-rose-400">Enemy Picks</span>
                  {enemySlots.map((slot) => {
                    const hero = getHeroById(slot.pickedHeroId);
                    const active =
                      state.activeInputTarget.kind === 'pick' &&
                      state.activeInputTarget.slotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => onSetActiveTarget('pick', slot.id)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                          active
                            ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300'
                        }`}
                      >
                        <span>
                          E{slot.slotNumber} ({slot.role})
                        </span>
                        <span className="font-bold">{hero ? hero.name : 'Open'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {state.candidates.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {state.candidates.map((c) => (
                    <div
                      key={c.hero.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-sky-500/40 bg-zinc-950 p-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-100">
                            #{c.rank} {c.hero.name}
                          </span>
                          <span className="font-mono text-xs text-emerald-400">
                            {c.winProbability}%
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400">{c.rationale}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAssignHero('pick', targetSlot.id, c.hero.id)}
                        className="rounded-md bg-sky-500 py-1 text-xs font-bold text-zinc-950"
                      >
                        Pick {c.hero.name}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'build' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-zinc-100">
                  Step 4 · Build Recommendation
                </h2>
                <div className="flex gap-1">
                  {allySlots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSetTargetAllySlot(s.id)}
                      className={`rounded px-2 py-1 text-xs ${
                        state.targetAllySlotId === s.id
                          ? 'bg-emerald-500 font-bold text-zinc-950'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {s.role}
                    </button>
                  ))}
                </div>
              </div>
              {buildRec ? (
                <div className="flex flex-col gap-2">
                  <div className="rounded-lg bg-zinc-950 p-3 text-xs text-zinc-300">
                    <strong className="text-emerald-300">{buildRec.heroName}</strong> · Spell:{' '}
                    <strong>{buildRec.battleSpell}</strong> · {buildRec.emblem.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {buildRec.items.map((item) => (
                      <div
                        key={item.name}
                        className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
                      >
                        <div className="text-xs font-bold text-zinc-100">{item.name}</div>
                        <div className="text-[10px] text-zinc-400">{item.note}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  Assign a hero to this Target Ally Slot (or use the Locked-In preset) to view its
                  Build Recommendation.
                </p>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-rose-300">
                Step 5 · Post-Match Review (Defeat Learning Loop)
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ACTIVE_FAILURE_PATTERNS.map((fp) => (
                  <div
                    key={fp.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[11px]"
                  >
                    <div className="font-bold uppercase text-amber-300">{fp.dimension}</div>
                    <p className="mt-1 text-zinc-400">{fp.summary}</p>
                  </div>
                ))}
              </div>
              <label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-4 text-xs text-zinc-300 hover:border-rose-400">
                <span>
                  {state.postMatch.screenshotName ?? 'Upload Defeat Scoreboard Screenshot'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUpdatePostMatch({ outcome: 'defeat', screenshotName: file.name });
                    }
                  }}
                />
              </label>
              <textarea
                rows={3}
                value={state.postMatch.notes}
                onChange={(e) => onUpdatePostMatch({ notes: e.target.value })}
                placeholder="Notes on what happened..."
                className="rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-xs text-zinc-100"
              />
              <button
                type="button"
                onClick={() => onUpdatePostMatch({ outcome: 'defeat', submitted: true })}
                className="self-end rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white"
              >
                {state.postMatch.submitted ? '✓ Saved Post-Match Review' : 'Submit Review'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
