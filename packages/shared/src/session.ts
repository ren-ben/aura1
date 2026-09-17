export const MAX_SESSION_MINUTES = 360;

export function sessionMinutes(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

export function isRunaway(minutes: number): boolean {
  return minutes > MAX_SESSION_MINUTES;
}
