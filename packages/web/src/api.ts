export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// YYYY-MM-DD in the browser's time zone, not UTC.
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export type Folder = {
  id: number; name: string; archived: boolean;
  activities: { id: number; name: string; archived: boolean }[];
};

export type Progress = { xp: number; level: number; nextLevelXp: number };

export type Stats = {
  bond: Progress;
  form: 'stable' | 'thinning' | 'fragmenting' | 'dormant';
  lastSessionAt: string | null;
  needsReview: number;
  activities: (Progress & { id: number; name: string; folder: string; minutes: number })[];
};
