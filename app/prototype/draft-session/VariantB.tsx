'use client';

import { useState, useMemo } from 'react';
import {
  MOCK_HEROES,
  ROLES,
  Role,
  getHeroById,
  computeBuildRecommendation,
} from './types';
import type { VariantProps } from './VariantA';

export function VariantB({
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
  const [roleTab, setRoleTab] = useState<Role | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [advisorOpen, setAdvisorOpen] = useState(state.candidates.length > 0);
  const [postTab, setPostTab] = useState<'build' | 'review'>('build');

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

  const filteredHeroes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK_HEROES.filter((h) => {
      if (roleTab !== 'ALL' && !h.roles.includes(roleTab)) return false;
      if (q && !h.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [roleTab, search]);

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 px-4 pb-20 pt-3 lg:grid-cols-[260px_1fr_260px]">
      {/* Left Mirror Column: Ally 1-5 (Ban + Pick inline) */}
      <aside className="flex flex-col gap-2 rounded-2xl border border-sky-900/60 bg-gradient-to-b from-sky-950/40 to-zinc-950 p-3">
        <div className="flex items-center justify-between border-b border-sky-900/40 pb-2">
          <span className="text-xs font-extrabold uppercase tracking-widest text-sky-300">
            Blue Side (Ally)
          </span>
          <span className="font-mono text-[10px] text-zinc-400">Ban · Pick</span>
        </div>

        {allySlots.map((slot) => {
          const banHero = getHeroById(slot.bannedHeroId);
          const pickHero = getHeroById(slot.pickedHeroId);
          const isMySlot = state.mySlotId === slot.id;
          const isTarget = state.targetAllySlotId === slot.id;
          const isBanActive =
            state.activeInputTarget.kind === 'ban' && state.activeInputTarget.slotId === slot.id;
          const isPickActive =
            state.activeInputTarget.kind === 'pick' && state.activeInputTarget.slotId === slot.id;

          return (
            <div
              key={slot.id}
              onClick={() => onSetTargetAllySlot(slot.id)}
              className={`flex flex-col gap-1.5 rounded-xl border p-2 transition ${
                isTarget
                  ? 'border-sky-400 bg-sky-500/10'
                  : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetMySlot(slot.id);
                    }}
                    className={`rounded px-1.5 py-0.5 font-bold ${
                      isMySlot ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {isMySlot ? '★ ME' : `A${slot.slotNumber}`}
                  </button>
                  <select
                    value={slot.role}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onSetSlotRole(slot.id, e.target.value as Role)}
                    className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-200"
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
                    onSetTargetAllySlot(slot.id);
                    onGetSuggestedHeroes(slot.id);
                    setAdvisorOpen(true);
                  }}
                  className="text-[10px] font-semibold text-sky-400 hover:underline"
                >
                  Advise
                </button>
              </div>

              <div className="grid grid-cols-[76px_1fr] gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetActiveTarget('ban', slot.id);
                  }}
                  className={`truncate rounded-lg border px-1.5 py-1.5 text-left text-[11px] ${
                    isBanActive
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {banHero ? `✕ ${banHero.name}` : `Ban ${slot.slotNumber}`}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetTargetAllySlot(slot.id);
                    onSetActiveTarget('pick', slot.id);
                  }}
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${
                    isPickActive
                      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-100'
                  }`}
                >
                  <span className="truncate">{pickHero ? pickHero.name : 'Select Pick'}</span>
                  {pickHero && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearHero('pick', slot.id);
                      }}
                      className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                    >
                      ✕
                    </span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </aside>

      {/* Center Arena: Hero Pool Grid OR Post-Draft Workspace + Overlay Advisor */}
      <main className="relative flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/75 p-4">
        {/* Arena Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2 py-1 font-mono text-xs font-bold text-amber-300">
              Active: {state.activeInputTarget.slotId.toUpperCase()} ({state.activeInputTarget.kind})
            </span>
            <span className="text-xs text-zinc-400">
              Target Ally: <strong className="text-sky-300">{targetSlot.role}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {state.phase !== 'locked' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onGetSuggestedHeroes(targetSlot.id);
                    setAdvisorOpen(true);
                  }}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-sky-400"
                >
                  Get Suggested Heroes
                </button>
                <button
                  type="button"
                  onClick={onLockAll}
                  className="rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
                >
                  Lock All Picks
                </button>
              </>
            )}
          </div>
        </div>

        {state.phase !== 'locked' ? (
          <>
            {/* Role Filter Tabs + Search */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {(['ALL', ...ROLES] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleTab(r)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      roleTab === r
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter hero grid..."
                className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400 focus:outline-none"
              />
            </div>

            {/* 1-Click Hero Pool Grid */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {filteredHeroes.map((hero) => {
                const isTaken = takenHeroIds.has(hero.id);
                return (
                  <button
                    key={hero.id}
                    type="button"
                    disabled={isTaken}
                    onClick={() =>
                      onAssignHero(
                        state.activeInputTarget.kind,
                        state.activeInputTarget.slotId,
                        hero.id
                      )
                    }
                    className={`flex flex-col items-start rounded-xl border p-2 text-left transition ${
                      isTaken
                        ? 'cursor-not-allowed border-zinc-800/50 bg-zinc-950/40 opacity-35'
                        : 'border-zinc-700 bg-zinc-950 hover:border-amber-400 hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-xs font-bold text-zinc-100">{hero.name}</span>
                      <span className="text-[10px] font-mono text-amber-300">{hero.tier}</span>
                    </div>
                    <span className="mt-1 text-[10px] text-zinc-400">{hero.primaryRole}</span>
                  </button>
                );
              })}
            </div>

            {/* Slide-Over Advisor Drawer */}
            {advisorOpen && (
              <div className="mt-2 rounded-xl border border-sky-500/50 bg-zinc-950/95 p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                    Top 3 Candidate Picks · {targetSlot.role} (
                    {targetSlot.id === state.mySlotId ? 'My Slot' : `Ally ${targetSlot.slotNumber}`})
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdvisorOpen(false)}
                    className="text-xs text-zinc-400 hover:text-zinc-100"
                  >
                    Close ✕
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {state.candidates.map((c) => (
                    <div
                      key={c.hero.id}
                      className="flex flex-col justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/90 p-2.5"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-100">
                            #{c.rank} {c.hero.name}
                          </span>
                          <span className="font-mono text-xs font-bold text-emerald-400">
                            {c.winProbability}%
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400">{c.rationale}</p>
                        {c.profileNote && (
                          <p className="mt-1 text-[10px] text-amber-300">{c.profileNote}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAssignHero('pick', targetSlot.id, c.hero.id);
                          setAdvisorOpen(false);
                        }}
                        className="w-full rounded-md bg-sky-500 py-1 text-xs font-bold text-zinc-950 hover:bg-sky-400"
                      >
                        Lock {c.hero.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Post-Draft Tabbed Workspace */
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 border-b border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => setPostTab('build')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  postTab === 'build'
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                Build Recommendation
              </button>
              <button
                type="button"
                onClick={() => setPostTab('review')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  postTab === 'review'
                    ? 'bg-rose-500 text-white'
                    : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                Post-Match Review (If Defeat)
              </button>
            </div>

            {postTab === 'build' && buildRec && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-3">
                  <div>
                    <div className="text-sm font-bold text-zinc-100">
                      {buildRec.heroName} ({targetSlot.role})
                    </div>
                    <div className="text-xs text-zinc-400">
                      {buildRec.emblem.name}: {buildRec.emblem.talents.join(' · ')}
                    </div>
                  </div>
                  <span className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-xs font-bold text-sky-300">
                    Spell: {buildRec.battleSpell}
                  </span>
                </div>
                {buildRec.profileAdaptation && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                    {buildRec.profileAdaptation}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {buildRec.items.map((item) => (
                    <div
                      key={item.name}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5"
                    >
                      <div className="text-xs font-bold text-zinc-100">{item.name}</div>
                      <div className="text-[10px] text-emerald-400">{item.tag}</div>
                      <div className="mt-1 text-[11px] text-zinc-400">{item.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {postTab === 'review' && (
              <div className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-zinc-950 p-4">
                <label className="flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-zinc-700 p-5 text-xs text-zinc-300 hover:border-rose-400">
                  <span>
                    {state.postMatch.screenshotName ??
                      'Upload Defeat Scoreboard Screenshot (PNG/JPG)'}
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
                  placeholder="Optional defeat notes for My Slot..."
                  className="rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => onUpdatePostMatch({ outcome: 'defeat', submitted: true })}
                  className="self-end rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white"
                >
                  {state.postMatch.submitted ? '✓ Saved Review' : 'Submit Post-Match Review'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Right Mirror Column: Enemy 1-5 (Ban + Pick inline) */}
      <aside className="flex flex-col gap-2 rounded-2xl border border-rose-900/60 bg-gradient-to-b from-rose-950/40 to-zinc-950 p-3">
        <div className="flex items-center justify-between border-b border-rose-900/40 pb-2">
          <span className="font-mono text-[10px] text-zinc-400">Pick · Ban</span>
          <span className="text-xs font-extrabold uppercase tracking-widest text-rose-300">
            Red Side (Enemy)
          </span>
        </div>

        {enemySlots.map((slot) => {
          const banHero = getHeroById(slot.bannedHeroId);
          const pickHero = getHeroById(slot.pickedHeroId);
          const isBanActive =
            state.activeInputTarget.kind === 'ban' && state.activeInputTarget.slotId === slot.id;
          const isPickActive =
            state.activeInputTarget.kind === 'pick' && state.activeInputTarget.slotId === slot.id;

          return (
            <div
              key={slot.id}
              className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-2"
            >
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>
                  E{slot.slotNumber} · {slot.role}
                </span>
              </div>
              <div className="grid grid-cols-[1fr_76px] gap-1.5">
                <button
                  type="button"
                  onClick={() => onSetActiveTarget('pick', slot.id)}
                  className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${
                    isPickActive
                      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-100'
                  }`}
                >
                  <span className="truncate">{pickHero ? pickHero.name : 'Select Pick'}</span>
                  {pickHero && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearHero('pick', slot.id);
                      }}
                      className="ml-1 text-[10px] text-zinc-500 hover:text-rose-400"
                    >
                      ✕
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSetActiveTarget('ban', slot.id)}
                  className={`truncate rounded-lg border px-1.5 py-1.5 text-left text-[11px] ${
                    isBanActive
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {banHero ? `✕ ${banHero.name}` : `Ban ${slot.slotNumber}`}
                </button>
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
