// PROTOTYPE ONLY — throwaway types & mock data for Issue #7 UI exploration.

export type Role = 'EXP' | 'Jungle' | 'Mid' | 'Gold' | 'Roam';

export const ROLES: Role[] = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];

export interface HeroOption {
  id: string;
  name: string;
  primaryRole: Role;
  roles: Role[];
  tier: 'S+' | 'S' | 'A' | 'B';
  specialty: string;
  counters: string[];
  synergies: string[];
}

export interface DraftSlot {
  id: string; // e.g. 'ally-1' .. 'ally-5', 'enemy-1' .. 'enemy-5'
  team: 'ally' | 'enemy';
  slotNumber: 1 | 2 | 3 | 4 | 5;
  role: Role;
  bannedHeroId: string | null;
  pickedHeroId: string | null;
  locked: boolean;
}

export interface FailurePattern {
  id: string;
  dimension: 'pick-wise' | 'action-wise' | 'synergy-wise' | 'build-wise';
  summary: string;
  status: 'active' | 'resolved';
}

export interface CandidatePick {
  rank: 1 | 2 | 3;
  hero: HeroOption;
  winProbability: number; // 0..100
  synergyScore: number;
  counterScore: number;
  rationale: string;
  profileNote: string | null; // only populated when Target Ally Slot === My Slot
}

export interface BuildRecommendation {
  slotId: string;
  heroName: string;
  isMySlot: boolean;
  items: { name: string; tag: 'Core' | 'Situational' | 'Boots'; note: string }[];
  emblem: { name: string; talents: string[] };
  battleSpell: string;
  profileAdaptation: string | null;
}

export interface PostMatchReviewDraft {
  outcome: 'defeat' | 'victory' | null;
  screenshotName: string | null;
  screenshotPreviewUrl: string | null;
  notes: string;
  submitted: boolean;
}

export interface DraftSessionState {
  phase: 'bans' | 'picks' | 'locked' | 'post-match';
  mySlotId: string; // e.g. 'ally-3'
  targetAllySlotId: string; // e.g. 'ally-3'
  activeInputTarget: { kind: 'ban' | 'pick'; slotId: string };
  slots: DraftSlot[];
  suggestionsRequestedForSlotId: string | null;
  candidates: CandidatePick[];
  postMatch: PostMatchReviewDraft;
}

export const MOCK_HEROES: HeroOption[] = [
  { id: 'tigreal', name: 'Tigreal', primaryRole: 'Roam', roles: ['Roam'], tier: 'S', specialty: 'Crowd Control / Set', counters: ['layla', 'miya', 'pharsa'], synergies: ['pharsa', 'claude', 'ling'] },
  { id: 'khufra', name: 'Khufra', primaryRole: 'Roam', roles: ['Roam'], tier: 'S+', specialty: 'Anti-Dash / Engage', counters: ['fanny', 'ling', 'joy', 'wanwan'], synergies: ['beatrix', 'valentina'] },
  { id: 'mathilda', name: 'Mathilda', primaryRole: 'Roam', roles: ['Roam', 'Mid'], tier: 'S+', specialty: 'Mobility / Shield', counters: ['tigreal', 'pharsa'], synergies: ['fredrinn', 'nolan', 'claude'] },
  { id: 'angela', name: 'Angela', primaryRole: 'Roam', roles: ['Roam'], tier: 'S', specialty: 'Global Shield / Heal', counters: ['saber'], synergies: ['ling', 'joy', 'yu-zhong'] },
  { id: 'fanny', name: 'Fanny', primaryRole: 'Jungle', roles: ['Jungle'], tier: 'S+', specialty: 'High Mobility / Burst', counters: ['layla', 'pharsa', 'novaria'], synergies: ['angela', 'mathilda'] },
  { id: 'ling', name: 'Ling', primaryRole: 'Jungle', roles: ['Jungle'], tier: 'S', specialty: 'Wall Mobility / Finisher', counters: ['pharsa', 'claude', 'beatrix'], synergies: ['angela', 'tigreal'] },
  { id: 'nolan', name: 'Nolan', primaryRole: 'Jungle', roles: ['Jungle'], tier: 'S+', specialty: 'Fast Clear / Burst', counters: ['novaria', 'layla'], synergies: ['mathilda', 'arlott'] },
  { id: 'fredrinn', name: 'Fredrinn', primaryRole: 'Jungle', roles: ['Jungle', 'EXP'], tier: 'S', specialty: 'Utility Tank / Taunt', counters: ['fanny', 'nolan'], synergies: ['mathilda', 'valentina'] },
  { id: 'joy', name: 'Joy', primaryRole: 'Jungle', roles: ['Jungle', 'EXP'], tier: 'S', specialty: 'Dash / Magic Burst', counters: ['beatrix', 'novaria'], synergies: ['angela', 'floryn'] },
  { id: 'valentina', name: 'Valentina', primaryRole: 'Mid', roles: ['Mid'], tier: 'S+', specialty: 'Ult Copy / Tempo', counters: ['tigreal', 'angela', 'pharsa'], synergies: ['fredrinn', 'khufra'] },
  { id: 'pharsa', name: 'Pharsa', primaryRole: 'Mid', roles: ['Mid'], tier: 'S', specialty: 'Long-Range Poke / Zoning', counters: ['layla', 'tigreal'], synergies: ['tigreal', 'khufra'] },
  { id: 'novaria', name: 'Novaria', primaryRole: 'Mid', roles: ['Mid'], tier: 'S', specialty: 'Vision / Snipe', counters: ['angela', 'mathilda'], synergies: ['claude', 'nolan'] },
  { id: 'zhuxin', name: 'Zhuxin', primaryRole: 'Mid', roles: ['Mid'], tier: 'S+', specialty: 'Sustained CC / Control', counters: ['fredrinn', 'yu-zhong'], synergies: ['arlott', 'claude'] },
  { id: 'claude', name: 'Claude', primaryRole: 'Gold', roles: ['Gold'], tier: 'S+', specialty: 'AOE DPS / Dive', counters: ['tigreal', 'pharsa'], synergies: ['mathilda', 'tigreal'] },
  { id: 'beatrix', name: 'Beatrix', primaryRole: 'Gold', roles: ['Gold'], tier: 'S', specialty: 'Versatile Burst / Waveclear', counters: ['khufra', 'claude'], synergies: ['khufra', 'fredrinn'] },
  { id: 'harith', name: 'Harith', primaryRole: 'Gold', roles: ['Gold', 'Mid'], tier: 'S+', specialty: 'Magic DPS / Dash', counters: ['tigreal', 'fredrinn'], synergies: ['mathilda', 'angela'] },
  { id: 'wanwan', name: 'Wanwan', primaryRole: 'Gold', roles: ['Gold'], tier: 'A', specialty: 'Purify / Kite', counters: ['tigreal', 'fredrinn'], synergies: ['angela', 'mathilda'] },
  { id: 'layla', name: 'Layla', primaryRole: 'Gold', roles: ['Gold'], tier: 'B', specialty: 'Late-Game Range', counters: [], synergies: ['tigreal'] },
  { id: 'arlott', name: 'Arlott', primaryRole: 'EXP', roles: ['EXP', 'Roam'], tier: 'S+', specialty: 'CC Chain / Sustain', counters: ['claude', 'harith'], synergies: ['zhuxin', 'nolan'] },
  { id: 'yu-zhong', name: 'Yu Zhong', primaryRole: 'EXP', roles: ['EXP'], tier: 'S', specialty: 'Backline Dive / Sustain', counters: ['pharsa', 'beatrix'], synergies: ['angela', 'mathilda'] },
  { id: 'terizla', name: 'Terizla', primaryRole: 'EXP', roles: ['EXP'], tier: 'S', specialty: 'Frontline / AOE Knockup', counters: ['arlott', 'fredrinn'], synergies: ['pharsa', 'claude'] },
  { id: 'edith', name: 'Edith', primaryRole: 'EXP', roles: ['EXP', 'Roam'], tier: 'S', specialty: 'Tank / Marksman Burst', counters: ['yu-zhong', 'terizla'], synergies: ['novaria', 'nolan'] },
];

export const ACTIVE_FAILURE_PATTERNS: FailurePattern[] = [
  {
    id: 'fp-1',
    dimension: 'pick-wise',
    summary: 'Avoid blind-picking immobile Gold/Mid heroes before enemy Jungle/Roam dive is revealed.',
    status: 'active',
  },
  {
    id: 'fp-2',
    dimension: 'build-wise',
    summary: 'Delaying Antique Cuirass / Wind of Nature against 2+ physical divers causes mid-game snowball deaths.',
    status: 'active',
  },
  {
    id: 'fp-3',
    dimension: 'synergy-wise',
    summary: 'Low-CC drafts struggle to contest Lord without a secondary disengage or zone tool.',
    status: 'active',
  },
  {
    id: 'fp-4',
    dimension: 'action-wise',
    summary: 'Over-extending past river at 4:00–5:00 before Turtle spawn when enemy Mid is missing.',
    status: 'active',
  },
];

export function createEmptyDraftSession(): DraftSessionState {
  const defaultRoles: Role[] = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];
  const slots: DraftSlot[] = [
    ...defaultRoles.map((role, idx) => ({
      id: `ally-${idx + 1}`,
      team: 'ally' as const,
      slotNumber: (idx + 1) as 1 | 2 | 3 | 4 | 5,
      role,
      bannedHeroId: null,
      pickedHeroId: null,
      locked: false,
    })),
    ...defaultRoles.map((role, idx) => ({
      id: `enemy-${idx + 1}`,
      team: 'enemy' as const,
      slotNumber: (idx + 1) as 1 | 2 | 3 | 4 | 5,
      role,
      bannedHeroId: null,
      pickedHeroId: null,
      locked: false,
    })),
  ];

  return {
    phase: 'bans',
    mySlotId: 'ally-4',
    targetAllySlotId: 'ally-4',
    activeInputTarget: { kind: 'ban', slotId: 'ally-1' },
    slots,
    suggestionsRequestedForSlotId: null,
    candidates: [],
    postMatch: {
      outcome: null,
      screenshotName: null,
      screenshotPreviewUrl: null,
      notes: '',
      submitted: false,
    },
  };
}

export function createMidDraftSession(): DraftSessionState {
  const base = createEmptyDraftSession();
  const allyBans = ['fanny', 'zhuxin', 'harith', 'nolan', 'mathilda'];
  const enemyBans = ['ling', 'valentina', 'arlott', 'angela', 'khufra'];
  const allyPicks: (string | null)[] = ['terizla', 'fredrinn', 'pharsa', null, 'tigreal'];
  const enemyPicks: (string | null)[] = ['yu-zhong', 'joy', 'novaria', 'beatrix', null];

  const slots = base.slots.map((slot) => {
    const idx = slot.slotNumber - 1;
    if (slot.team === 'ally') {
      return {
        ...slot,
        bannedHeroId: allyBans[idx] ?? null,
        pickedHeroId: allyPicks[idx] ?? null,
        locked: Boolean(allyPicks[idx]),
      };
    }
    return {
      ...slot,
      bannedHeroId: enemyBans[idx] ?? null,
      pickedHeroId: enemyPicks[idx] ?? null,
      locked: Boolean(enemyPicks[idx]),
    };
  });

  return {
    ...base,
    phase: 'picks',
    mySlotId: 'ally-4',
    targetAllySlotId: 'ally-4',
    activeInputTarget: { kind: 'pick', slotId: 'ally-4' },
    slots,
    suggestionsRequestedForSlotId: 'ally-4',
    candidates: computeCandidatePicks(slots, 'ally-4', 'ally-4'),
  };
}

export function createLockedDraftSession(): DraftSessionState {
  const mid = createMidDraftSession();
  const slots = mid.slots.map((slot) => {
    if (slot.id === 'ally-4') return { ...slot, pickedHeroId: 'claude', locked: true };
    if (slot.id === 'enemy-5') return { ...slot, pickedHeroId: 'edith', locked: true };
    return { ...slot, locked: true };
  });

  return {
    ...mid,
    phase: 'locked',
    activeInputTarget: { kind: 'pick', slotId: 'ally-4' },
    slots,
  };
}

export function getHeroById(id: string | null): HeroOption | undefined {
  if (!id) return undefined;
  return MOCK_HEROES.find((h) => h.id === id);
}

export function computeCandidatePicks(
  slots: DraftSlot[],
  targetSlotId: string,
  mySlotId: string
): CandidatePick[] {
  const targetSlot = slots.find((s) => s.id === targetSlotId);
  const targetRole = targetSlot?.role ?? 'Gold';
  const takenIds = new Set(
    slots.flatMap((s) => [s.bannedHeroId, s.pickedHeroId]).filter((x): x is string => Boolean(x))
  );
  const allyPicked = slots
    .filter((s) => s.team === 'ally' && s.pickedHeroId)
    .map((s) => s.pickedHeroId as string);
  const enemyPicked = slots
    .filter((s) => s.team === 'enemy' && s.pickedHeroId)
    .map((s) => s.pickedHeroId as string);

  const pool = MOCK_HEROES.filter(
    (h) => !takenIds.has(h.id) && (h.roles.includes(targetRole) || h.primaryRole === targetRole)
  );
  const fallbackPool = pool.length >= 3 ? pool : MOCK_HEROES.filter((h) => !takenIds.has(h.id));

  const scored = fallbackPool.map((hero) => {
    const synHits = hero.synergies.filter((id) => allyPicked.includes(id)).length;
    const ctrHits = hero.counters.filter((id) => enemyPicked.includes(id)).length;
    const tierBonus = hero.tier === 'S+' ? 6 : hero.tier === 'S' ? 4 : 1;
    const raw = 50 + synHits * 6 + ctrHits * 7 + tierBonus;
    return {
      hero,
      winProbability: Math.min(72, raw),
      synergyScore: Math.min(98, 70 + synHits * 11),
      counterScore: Math.min(98, 68 + ctrHits * 12),
    };
  });

  scored.sort((a, b) => b.winProbability - a.winProbability);
  const top3 = scored.slice(0, 3);
  const isMySlot = targetSlotId === mySlotId;

  return top3.map((entry, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    hero: entry.hero,
    winProbability: entry.winProbability,
    synergyScore: entry.synergyScore,
    counterScore: entry.counterScore,
    rationale: `Fits ${targetRole} (${entry.hero.specialty}); pairs well with ${
      allyPicked.length ? getHeroById(allyPicked[0])?.name ?? 'ally frontline' : 'current draft'
    } and pressures ${
      enemyPicked.length ? getHeroById(enemyPicked[0])?.name ?? 'enemy core' : 'enemy backline'
    }.`,
    profileNote: isMySlot
      ? `My Slot Profile: Respects your active pick-wise pattern (high mobility/self-peel vs dive).`
      : null,
  }));
}

export function computeBuildRecommendation(
  slots: DraftSlot[],
  targetSlotId: string,
  mySlotId: string
): BuildRecommendation | null {
  const slot = slots.find((s) => s.id === targetSlotId);
  const hero = getHeroById(slot?.pickedHeroId ?? null);
  if (!slot || !hero) return null;

  const isMySlot = targetSlotId === mySlotId;
  return {
    slotId: slot.id,
    heroName: hero.name,
    isMySlot,
    items: [
      { name: 'Tough Boots', tag: 'Boots', note: 'CC reduction vs enemy engage' },
      { name: 'Demon Hunter Sword', tag: 'Core', note: 'Shreds frontline HP' },
      { name: 'Golden Staff', tag: 'Core', note: 'Attack-speed power spike' },
      { name: 'Corrosion Scythe', tag: 'Core', note: 'Kiting & slow pressure' },
      { name: 'Wind of Nature', tag: 'Situational', note: '2s physical immunity vs divers' },
      { name: 'Athena’s Shield', tag: 'Situational', note: 'Absorbs burst magic poke' },
    ],
    emblem: {
      name: `${hero.primaryRole} Custom Emblem`,
      talents: ['Agility (+4% Movespeed)', 'Weapon Master (+5% Attack)', 'Quantum Charge'],
    },
    battleSpell: hero.primaryRole === 'Gold' ? 'Purify' : hero.primaryRole === 'Jungle' ? 'Retribution' : 'Flicker',
    profileAdaptation: isMySlot
      ? 'Build-wise Failure Pattern applied: prioritized Wind of Nature 4th item to prevent mid-game dive deaths.'
      : null,
  };
}
