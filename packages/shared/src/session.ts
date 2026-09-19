export const MAX_SESSION_MINUTES = 360;
// Anything shorter was a mistaken start: it is dropped, never logged.
export const MIN_SESSION_MINUTES = 10;

export function sessionMinutes(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

export function isRunaway(minutes: number): boolean {
  return minutes > MAX_SESSION_MINUTES;
}
