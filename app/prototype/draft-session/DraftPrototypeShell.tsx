'use client';

// PROTOTYPE PLAN: Three structurally different variants of the live Draft Session,
// Build Recommendation, and Post-Match Review UI, switchable via `?variant=` on `/prototype/draft-session`.

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PrototypeSwitcher, VariantMeta } from '../_components/PrototypeSwitcher';
import {
  DraftSessionState,
  Role,
  computeCandidatePicks,
  createEmptyDraftSession,
  createLockedDraftSession,
  createMidDraftSession,
} from './types';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';

const VARIANTS: VariantMeta[] = [
  { key: 'A', label: 'Command Strip' },
  { key: 'B', label: 'Draft Arena' },
  { key: 'C', label: 'Stepper Rail' },
];

export function DraftPrototypeShell() {
  const searchParams = useSearchParams();
  const rawVariant = searchParams.get('variant')?.toUpperCase() ?? 'A';
  const variant = VARIANTS.some((v) => v.key === rawVariant) ? rawVariant : 'A';

  const [state, setState] = useState<DraftSessionState>(() => createMidDraftSession());
  const [showState, setShowState] = useState(false);

  const handleSetMySlot = (slotId: string) => {
    setState((prev) => ({
      ...prev,
      mySlotId: slotId,
      candidates:
        prev.suggestionsRequestedForSlotId === slotId
          ? computeCandidatePicks(prev.slots, slotId, slotId)
          : prev.candidates,
    }));
  };

  const handleSetTargetAllySlot = (slotId: string) => {
    setState((prev) => ({
      ...prev,
      targetAllySlotId: slotId,
    }));
  };

  const handleSetSlotRole = (slotId: string, role: Role) => {
    setState((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === slotId ? { ...s, role } : s)),
    }));
  };

  const handleSetActiveTarget = (kind: 'ban' | 'pick', slotId: string) => {
    setState((prev) => ({
      ...prev,
      activeInputTarget: { kind, slotId },
    }));
  };

  const handleAssignHero = (kind: 'ban' | 'pick', slotId: string, heroId: string) => {
    setState((prev) => {
      const nextSlots = prev.slots.map((s) => {
        if (s.id !== slotId) return s;
        return kind === 'ban'
          ? { ...s, bannedHeroId: heroId }
          : { ...s, pickedHeroId: heroId, locked: true };
      });

      // Auto-advance cursor to next open slot of the same kind, or switch bans -> picks
      let nextTarget = prev.activeInputTarget;
      const nextEmptySameKind = nextSlots.find((s) =>
        kind === 'ban' ? !s.bannedHeroId : !s.pickedHeroId
      );
      if (nextEmptySameKind) {
        nextTarget = { kind, slotId: nextEmptySameKind.id };
      } else if (kind === 'ban') {
        const firstEmptyPick = nextSlots.find((s) => !s.pickedHeroId);
        if (firstEmptyPick) {
          nextTarget = { kind: 'pick', slotId: firstEmptyPick.id };
        }
      }

      const allPicked = nextSlots.every((s) => Boolean(s.pickedHeroId));
      const allBanned = nextSlots.every((s) => Boolean(s.bannedHeroId));
      const nextPhase: DraftSessionState['phase'] = allPicked
        ? 'locked'
        : allBanned || kind === 'pick'
          ? 'picks'
          : 'bans';

      return {
        ...prev,
        phase: nextPhase,
        slots: nextSlots,
        activeInputTarget: nextTarget,
      };
    });
  };

  const handleClearHero = (kind: 'ban' | 'pick', slotId: string) => {
    setState((prev) => ({
      ...prev,
      phase: kind === 'pick' && prev.phase === 'locked' ? 'picks' : prev.phase,
      slots: prev.slots.map((s) => {
        if (s.id !== slotId) return s;
        return kind === 'ban'
          ? { ...s, bannedHeroId: null }
          : { ...s, pickedHeroId: null, locked: false };
      }),
    }));
  };

  const handleGetSuggestedHeroes = (slotId: string) => {
    setState((prev) => ({
      ...prev,
      targetAllySlotId: slotId,
      suggestionsRequestedForSlotId: slotId,
      candidates: computeCandidatePicks(prev.slots, slotId, prev.mySlotId),
    }));
  };

  const handleLockAll = () => {
    setState((prev) => ({
      ...prev,
      phase: 'locked',
      slots: prev.slots.map((s) => ({ ...s, locked: true })),
    }));
  };

  const handleUpdatePostMatch = (patch: Partial<DraftSessionState['postMatch']>) => {
    setState((prev) => ({
      ...prev,
      postMatch: { ...prev.postMatch, ...patch },
    }));
  };

  const sharedProps = {
    state,
    onSetMySlot: handleSetMySlot,
    onSetTargetAllySlot: handleSetTargetAllySlot,
    onSetSlotRole: handleSetSlotRole,
    onSetActiveTarget: handleSetActiveTarget,
    onAssignHero: handleAssignHero,
    onClearHero: handleClearHero,
    onGetSuggestedHeroes: handleGetSuggestedHeroes,
    onLockAll: handleLockAll,
    onUpdatePostMatch: handleUpdatePostMatch,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Prototype Preset & State Bar */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 px-4 py-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight text-amber-300">
              Legend Advisor
            </span>
            <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
              PROTOTYPE · Issue #7
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 text-[11px] text-zinc-400">Presets:</span>
            <button
              type="button"
              onClick={() => setState(createEmptyDraftSession())}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-zinc-200 hover:border-zinc-500"
            >
              Empty Draft
            </button>
            <button
              type="button"
              onClick={() => setState(createMidDraftSession())}
              className="rounded-md border border-sky-500/50 bg-sky-500/15 px-2.5 py-1 text-sky-200 hover:bg-sky-500/25"
            >
              Mid-Draft (9/10 Picks)
            </button>
            <button
              type="button"
              onClick={() => setState(createLockedDraftSession())}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2.5 py-1 text-emerald-200 hover:bg-emerald-500/25"
            >
              Locked-In (Post-Draft)
            </button>
            <button
              type="button"
              onClick={() => setShowState((v) => !v)}
              className="ml-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] text-amber-300"
            >
              {showState ? 'Hide State' : 'Inspect State'}
            </button>
          </div>
        </div>
      </header>

      {showState && (
        <div className="mx-auto mt-2 max-w-7xl px-4">
          <pre className="max-h-60 overflow-auto rounded-xl border border-amber-500/30 bg-zinc-900 p-3 font-mono text-[11px] text-amber-200">
            {JSON.stringify(
              {
                phase: state.phase,
                mySlotId: state.mySlotId,
                targetAllySlotId: state.targetAllySlotId,
                activeInputTarget: state.activeInputTarget,
                bansLogged: state.slots.filter((s) => s.bannedHeroId).length,
                picksLogged: state.slots.filter((s) => s.pickedHeroId).length,
                candidates: state.candidates.map((c) => `${c.hero.name} (${c.winProbability}%)`),
                postMatch: state.postMatch,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      {variant === 'A' && <VariantA {...sharedProps} />}
      {variant === 'B' && <VariantB {...sharedProps} />}
      {variant === 'C' && <VariantC {...sharedProps} />}

      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
