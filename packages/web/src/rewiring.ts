// The rewiring: the trap's drain schedule, redrawn by hand to feed you. What
// a day's taps, lectures and drawn current are, in minutes after its midnight.
import { localDate, state, type Block } from './store';

// Six greys, lightest first: the only inks a tap is drawn in.
export const SHADES = [
  { name: 'tallow', ink: '#e6e0d4' }, { name: 'bone', ink: '#c5bcab' }, { name: 'ash', ink: '#a39c8f' },
  { name: 'pewter', ink: '#857f74' }, { name: 'slate', ink: '#68635b' }, { name: 'soot', ink: '#4d4944' },
];
export const SNAP = 15;

export const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minuteOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const dateShift = (date: string, n: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };

export type Span = { start: number; end: number };
export type Lecture = Span & { label: string; room: string; exam: boolean };

// The current that actually flowed that day: every session, clipped to it.
export function drawnOn(date: string): Span[] {
  return state.sessions.flatMap((s) => {
    const a = new Date(s.startedAt), b = new Date(s.endedAt);
    if (localDate(a) !== date) return [];
    return [{ start: minuteOf(a), end: localDate(b) === date ? Math.max(minuteOf(b), minuteOf(a) + 1) : 1440 }];
  });
}

// The lectures and exams of the chosen groups: fixed, never moved from here.
export function lecturesOn(date: string): Lecture[] {
  return state.courses.flatMap((c) => {
    const g = c.groups.find((x) => x.id === c.groupId);
    const at = (e: { begin: string; end: string; room: string }, label: string, exam: boolean) => {
      const a = new Date(e.begin), b = new Date(e.end);
      return localDate(a) === date ? [{ start: minuteOf(a), end: minuteOf(b), label, room: e.room.replace(/-?Hörsaal/, ''), exam }] : [];
    };
    return [...(g?.events ?? []).flatMap((e) => at(e, `${c.name} ${c.type}`, false)), ...c.exams.flatMap((x) => at(x, x.title, true))];
  });
}

export const blocksOn = (date: string) => state.blocks.filter((b) => b.date === date).sort((a, b) => a.start - b.start);
export const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

export function dayOf(date: string) {
  const blocks = blocksOn(date), drawn = drawnOn(date), p = state.planDays.find((d) => d.date === date);
  const wired = blocks.reduce((a, b) => a + b.end - b.start, 0);
  const kept = blocks.reduce((a, b) => a + drawn.reduce((k, s) => k + overlap(b, s), 0), 0);
  return { wired, kept, capacity: p?.capacity ?? 480, rev: p?.rev ?? 0 };
}

export const hours = (m: number) => (m / 60).toFixed(m % 60 ? 1 : 0);

// What he makes of the day as it is wired.
export function hisLine(date: string): string {
  const { wired, kept, capacity } = dayOf(date);
  const last = Math.max(0, ...blocksOn(date).map((b: Block) => b.end));
  const over = date < localDate() || (date === localDate() && minuteOf(new Date()) > last);
  if (!wired) return 'An unwired day. The current pools with nowhere to go. Draw me one line and I will follow it.';
  if (wired > capacity) return `${hours(wired)} hours wired on a bus rated for ${hours(capacity)}. I have watched gods burn out on less. Cut something.`;
  if (over && kept >= wired * 0.8) return 'Every tap drew. The circuit they built to starve me carries you instead.';
  if (over && kept < wired * 0.3) return 'The lines were drawn and nothing ran through them. A plan is only copper until you close the switch.';
  return `${hours(wired)} hours wired. Keep to the lines and I will keep the rest.`;
}

// Sunrise and sunset in Vienna, in minutes after local midnight (NOAA's
// approximation, as the API has it): where the night sky thins into day.
export function sunOf(date: string): { rise: number; set: number } {
  const d = new Date(`${date}T12:00:00`);
  const n = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1), rad = Math.PI / 180, lat = 48.2082 * rad, lon = 16.3738;
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)) / rad;
  const local = -d.getTimezoneOffset();
  return { rise: 720 - 4 * (lon + ha) - eq + local, set: 720 - 4 * (lon - ha) - eq + local };
}

// One sky for both views of the day: each star a minute of it and a depth
// across it (0 at the bus, 1 at the far edge), thick in the dark hours. The
// column lays them down its length, the dial round its face; the same stars,
// so the one can be rolled into the other.
export type Star = { m: number; u: number; b: number; dark: number };
export function starsOf(date: string): Star[] {
  const { rise, set } = sunOf(date);
  let seed = [...date].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 2147483647 || 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Star[] = [];
  for (let i = 0; i < 2400; i++) {
    const m = rnd() * 1440, u = rnd(), b = rnd();
    const dark = Math.min(1, Math.max(0, Math.max(rise + 30 - m, m - set + 30) / 70));
    if (rnd() < 0.1 + dark * 0.9) out.push({ m, u, b, dark });
  }
  return out;
}
// How bright a star is in the column, and on the dial (fainter, so the face
// stays quiet round the words).
export const starInk = (s: Star) => (0.18 + s.b * 0.62) * (0.4 + s.dark * 0.6);
export const starDial = (s: Star) => starInk(s) * (s.b > 0.35 ? 0.55 : 0);
// A star's radius on the dial, in its own units (the face is 480 across).
export const starR = (s: Star) => 24 + s.u * 204;
