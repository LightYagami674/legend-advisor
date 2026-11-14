'use client';

import { useState, useMemo } from 'react';
import {
  DraftSessionState,
  MOCK_HEROES,
  ROLES,
  Role,
  getHeroById,
  computeBuildRecommendation,
} from './types';

export interface VariantProps {
  state: DraftSessionState;
  onSetMySlot: (slotId: string) => void;
  onSetTargetAllySlot: (slotId: string) => void;
  onSetSlotRole: (slotId: string, role: Role) => void;
  onSetActiveTarget: (kind: 'ban' | 'pick', slotId: string) => void;
  onAssignHero: (kind: 'ban' | 'pick', slotId: string, heroId: string) => void;
  onClearHero: (kind: 'ban' | 'pick', slotId: string) => void;
  onGetSuggestedHeroes: (slotId: string) => void;
  onLockAll: () => void;
  onUpdatePostMatch: (patch: Partial<DraftSessionState['postMatch']>) => void;
}

export function VariantA({
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
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [showDefeatForm, setShowDefeatForm] = useState(false);

  const allySlots = state.slots.filter((s) => s.team === 'ally');
  const enemySlots = state.slots.filter((s) => s.team === 'enemy');
  const targetSlot = state.slots.find((s) => s.id === state.targetAllySlotId) ?? allySlots[0];

  const takenHeroIds = useMemo(
    () =>
      new Set(
        state.slots
          .flatMap((s) => [s.bannedHeroId, s.pickedHeroId])
          .filter((x): x is string => Boolean(x))
      ),
    [state.slots]
  );

  const matchingHeroes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_HEROES.filter((h) => {
      if (takenHeroIds.has(h.id)) return false;
      if (roleFilter !== 'ALL' && !h.roles.includes(roleFilter)) return false;
      if (q && !h.name.toLowerCase().includes(q) && !h.primaryRole.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    }).slice(0, 8);
  }, [query, roleFilter, takenHeroIds]);

  const handleOmnibarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const first = matchingHeroes[0];
    if (!first) return;
    onAssignHero(state.activeInputTarget.kind, state.activeInputTarget.slotId, first.id);
    setQuery('');
  };

  const buildRec = computeBuildRecommendation(state.slots, state.targetAllySlotId, state.mySlotId);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-20 pt-3">
      {/* 1. Top 10-Ban Ribbon */}
      <section className="grid grid-cols-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 p-2.5 lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            Ally Bans
          </span>
          {allySlots.map((slot) => {
            const hero = getHeroById(slot.bannedHeroId);
            const isActive =
              state.activeInputTarget.kind === 'ban' && state.activeInputTarget.slotId === slot.id;
            return (
              <button
                key={`ban-${slot.id}`}
                type="button"
                onClick={() => onSetActiveTarget('ban', slot.id)}
                className={`flex h-9 flex-1 items-center justify-between rounded-lg border px-2 text-xs transition ${
                  isActive
                    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                    : 'border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <span className="truncate">{hero ? hero.name : `B${slot.slotNumber}`}</span>
                {hero && (
                  <span
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onClearHero('ban', slot.id);
                    }}
                    className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                  >
                    ✕
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 px-2">
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-[11px] uppercase text-zinc-300">
            Phase: {state.phase}
          </span>
          {state.phase !== 'locked' && (
            <button
              type="button"
              onClick={onLockAll}
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Lock Draft
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {enemySlots.map((slot) => {
            const hero = getHeroById(slot.bannedHeroId);
            const isActive =
              state.activeInputTarget.kind === 'ban' && state.activeInputTarget.slotId === slot.id;
            return (
              <button
                key={`ban-${slot.id}`}
                type="button"
                onClick={() => onSetActiveTarget('ban', slot.id)}
                className={`flex h-9 flex-1 items-center justify-between rounded-lg border px-2 text-xs transition ${
                  isActive
                    ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                    : 'border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                <span className="truncate">{hero ? hero.name : `B${slot.slotNumber}`}</span>
                {hero && (
                  <span
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onClearHero('ban', slot.id);
                    }}
                    className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                  >
                    ✕
                  </span>
                )}
              </button>
            );
          })}
          <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
            Enemy Bans
          </span>
        </div>
      </section>

      {/* 2. Keyboard-First Command Omnibar */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-3">
        <form onSubmit={handleOmnibarSubmit} className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 font-mono text-xs font-semibold text-amber-300">
            Target: {state.activeInputTarget.slotId.toUpperCase()} ({state.activeInputTarget.kind})
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type hero name (e.g. 'claude', 'tig') and press Enter to assign + auto-advance..."
            className="min-w-[240px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {(['ALL', ...ROLES] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  roleFilter === r
                    ? 'bg-sky-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matchingHeroes.map((hero, idx) => (
            <button
              key={hero.id}
              type="button"
              onClick={() => {
                onAssignHero(state.activeInputTarget.kind, state.activeInputTarget.slotId, hero.id);
                setQuery('');
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                idx === 0 && query.trim()
                  ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                  : 'border-zinc-700 bg-zinc-950 text-zinc-200 hover:border-sky-400'
              }`}
            >
              <span className="font-semibold">{hero.name}</span>
              <span className="text-[10px] text-zinc-400">{hero.primaryRole}</span>
            </button>
          ))}
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
            <span className="text-[11px] text-zinc-400">Click to advise</span>
          </div>
          {allySlots.map((slot) => {
            const hero = getHeroById(slot.pickedHeroId);
            const isMySlot = state.mySlotId === slot.id;
            const isTarget = state.targetAllySlotId === slot.id;
            const isCursor =
              state.activeInputTarget.kind === 'pick' && state.activeInputTarget.slotId === slot.id;

            return (
              <div
                key={slot.id}
                onClick={() => {
                  onSetTargetAllySlot(slot.id);
                  onSetActiveTarget('pick', slot.id);
                }}
                className={`cursor-pointer rounded-xl border p-2.5 transition ${
                  isTarget
                    ? 'border-sky-400 bg-sky-500/10'
                    : isCursor
                      ? 'border-amber-400/70 bg-zinc-950'
                      : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-zinc-400">A{slot.slotNumber}</span>
                    <select
                      value={slot.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onSetSlotRole(slot.id, e.target.value as Role)}
                      className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetMySlot(slot.id);
                    }}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isMySlot
                        ? 'bg-amber-400 text-zinc-950'
                        : 'border border-zinc-700 text-zinc-400 hover:border-amber-400 hover:text-amber-300'
                    }`}
                  >
                    {isMySlot ? '★ My Slot' : 'Set My Slot'}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">
                    {hero ? hero.name : '— Open Pick —'}
                  </span>
                  {hero && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearHero('pick', slot.id);
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

        {/* Center: Decision Stage */}
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-400">
                Target Ally Slot
              </p>
              <h3 className="text-base font-bold text-zinc-100">
                Ally {targetSlot.slotNumber} · {targetSlot.role}{' '}
                {targetSlot.id === state.mySlotId && (
                  <span className="ml-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-xs text-amber-300">
                    My Slot (Profile Active)
                  </span>
                )}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {state.phase !== 'locked' ? (
                <button
                  type="button"
                  onClick={() => onGetSuggestedHeroes(targetSlot.id)}
                  className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-bold text-zinc-950 shadow hover:bg-sky-400"
                >
                  Get Suggested Heroes
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDefeatForm((v) => !v)}
                  className="rounded-lg border border-rose-500/60 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25"
                >
                  {showDefeatForm ? 'Back to Build Recommendation' : 'Match Lost? Post-Match Review'}
                </button>
              )}
            </div>
          </div>

          {/* Candidate Pick View */}
          {state.phase !== 'locked' && !showDefeatForm && (
            <div className="flex flex-col gap-2.5">
              {state.candidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
                  Select a <strong className="text-zinc-200">Target Ally Slot</strong> and click{' '}
                  <strong className="text-sky-300">Get Suggested Heroes</strong> to rank top 3{' '}
                  <code>Candidate Pick</code> options via <code>jev-latest</code>.
                </div>
              ) : (
                state.candidates.map((cand) => (
                  <div
                    key={cand.hero.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-950/90 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 font-mono text-xs font-bold text-sky-300">
                          #{cand.rank}
                        </span>
                        <span className="text-base font-bold text-zinc-100">{cand.hero.name}</span>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                          {cand.hero.tier} · {cand.hero.specialty}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-400">
                          {cand.winProbability}% WR
                        </span>
                        <button
                          type="button"
                          onClick={() => onAssignHero('pick', targetSlot.id, cand.hero.id)}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Pick
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300">{cand.rationale}</p>
                    {cand.profileNote && (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                        {cand.profileNote}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Post-Draft Build Recommendation */}
          {state.phase === 'locked' && !showDefeatForm && buildRec && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-lg bg-zinc-950 px-3 py-2">
                <span className="text-sm font-bold text-emerald-300">
                  Build Recommendation — {buildRec.heroName}
                </span>
                <span className="text-xs text-zinc-400">
                  Spell: <strong className="text-zinc-100">{buildRec.battleSpell}</strong> ·{' '}
                  {buildRec.emblem.name}
                </span>
              </div>
              {buildRec.profileAdaptation && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {buildRec.profileAdaptation}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {buildRec.items.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-100">{item.name}</span>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {item.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-400">{item.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Post-Match Review Defeat Form */}
          {showDefeatForm && (
            <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-zinc-950/90 p-3.5">
              <h4 className="text-sm font-bold text-rose-300">
                Post-Match Review (My Slot: {state.mySlotId.toUpperCase()})
              </h4>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 p-4 text-xs text-zinc-300 hover:border-rose-400">
                <span>
                  {state.postMatch.screenshotName
                    ? `Uploaded: ${state.postMatch.screenshotName}`
                    : 'Drop or click to upload MLBB defeat scoreboard screenshot'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUpdatePostMatch({
                        outcome: 'defeat',
                        screenshotName: file.name,
                      });
                    }
                  }}
                />
              </label>
              <textarea
                rows={3}
                value={state.postMatch.notes}
                onChange={(e) => onUpdatePostMatch({ notes: e.target.value })}
                placeholder="Optional reflection: what felt off? (e.g., got dove at 4:30 turtle, delayed Wind of Nature)"
                className="rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onUpdatePostMatch({ outcome: 'defeat', submitted: true })}
                className="self-end rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
              >
                {state.postMatch.submitted
                  ? '✓ Submitted to Gemini 4 Hydrogen'
                  : 'Analyze Defeat & Update Profile'}
              </button>
            </div>
          )}
        </div>

        {/* Right: Enemy Draft Slots */}
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400">
              Enemy Draft Slots
            </h2>
            <span className="text-[11px] text-zinc-400">Click to log pick</span>
          </div>
          {enemySlots.map((slot) => {
            const hero = getHeroById(slot.pickedHeroId);
            const isCursor =
              state.activeInputTarget.kind === 'pick' && state.activeInputTarget.slotId === slot.id;
            return (
              <div
                key={slot.id}
                onClick={() => onSetActiveTarget('pick', slot.id)}
                className={`cursor-pointer rounded-xl border p-2.5 transition ${
                  isCursor
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-400">
                    E{slot.slotNumber} · {slot.role}
                  </span>
                  {hero && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearHero('pick', slot.id);
                      }}
                      className="text-xs text-zinc-500 hover:text-rose-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {hero ? hero.name : '— Open Pick —'}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
