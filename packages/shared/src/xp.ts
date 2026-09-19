import { isRunaway } from './session.ts';

export type SessionSource = 'device' | 'manual';

// Manual backfill counts half: the device is the honest witness.
const SOURCE_MULT: Record<SessionSource, number> = { device: 1, manual: 0.5 };

// Unbroken blocks earn more than the same minutes in fragments.
function densityMult(minutes: number): number {
  if (minutes < 45) return 1;
  if (minutes <= 90) return 1.25;
  return 1.5;
}

// A session over 6 hours earns nothing until it is confirmed on the web: it is
// usually a forgotten stop.
export function sessionXp(minutes: number, source: SessionSource, confirmed: boolean): number {
  if (isRunaway(minutes) && !confirmed) return 0;
  return Math.floor(minutes * SOURCE_MULT[source] * densityMult(minutes));
}

// Level L is reached at 30 * L^2 cumulative XP.
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 30));
}

export function xpForLevel(level: number): number {
  return 30 * level * level;
}

export const FORM_STATES = ['stable', 'thinning', 'fragmenting', 'dormant'] as const;
export type FormState = (typeof FORM_STATES)[number];

// Decay is cosmetic: XP is never lost. Any new session, backfill included, wakes him.
export function formState(lastSessionEndedAt: string | null, now: Date): FormState {
  if (!lastSessionEndedAt) return 'dormant';
  const hours = (now.getTime() - Date.parse(lastSessionEndedAt)) / 3_600_000;
  if (hours < 24) return 'stable';
  if (hours < 48) return 'thinning';
  if (hours < 72) return 'fragmenting';
  return 'dormant';
}
