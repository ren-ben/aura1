// The Academy: the curriculum (packages/shared), the term, and what the
// courses kept make of it: which modules are passed, which run this term,
// the week's dates, the ECTS and the weighted grade.
import { CURRICULUM, partOf, type CurriculumModule } from '@aura/shared';
import type { Course } from './store';

export { CURRICULUM, FIRST_TERM } from '@aura/shared';
export type Status = 'passed' | 'running' | 'open' | 'locked';
export type Module = CurriculumModule & { status: Status };

// The Austrian scale: 1 is the best, 5 is a fail.
export const GRADES = ['sehr gut', 'gut', 'befriedigend', 'genügend', 'nicht genügend'];

// The term a date falls in: winter from October to January, summer from
// March to June; between them, the one coming.
export function termOf(d = new Date()): { name: string; from: Date; to: Date } {
  const y = d.getFullYear(), m = d.getMonth();
  if (m >= 7) return { name: `${y}W`, from: new Date(y, 9, 1), to: new Date(y + 1, 0, 31) };
  if (m === 0) return { name: `${y - 1}W`, from: new Date(y - 1, 9, 1), to: new Date(y, 0, 31) };
  return { name: `${y}S`, from: new Date(y, 2, 1), to: new Date(y, 5, 30) };
}

const passing = (c: Course) => c.grade !== null && c.grade <= 4;

// A module is passed when its courses together carry its ECTS with passing
// grades; it runs while any of its courses has no grade yet; the next
// semester's modules are open, the rest not yet.
export function modules(courses: Course[]): Module[] {
  const running = CURRICULUM.filter((m) => courses.some((c) => c.module === m.code && c.grade === null));
  const current = Math.max(1, ...running.map((m) => m.sem), ...CURRICULUM.filter((m) => courses.some((c) => c.module === m.code)).map((m) => m.sem));
  return CURRICULUM.map((m) => {
    const mine = courses.filter((c) => c.module === m.code);
    const earned = mine.filter(passing).reduce((a, c) => a + c.ects, 0);
    const status: Status = mine.length && earned >= m.ects ? 'passed'
      : mine.some((c) => c.grade === null) ? 'running'
      : m.sem <= current + 1 ? 'open' : 'locked';
    return { ...m, status };
  });
}

export function tally(courses: Course[]) {
  const passed = courses.filter(passing).reduce((a, c) => a + c.ects, 0);
  const running = courses.filter((c) => c.grade === null).reduce((a, c) => a + c.ects, 0);
  const graded = courses.filter(passing);
  const weight = graded.reduce((a, c) => a + c.ects, 0);
  const avg = weight ? graded.reduce((a, c) => a + c.grade! * c.ects, 0) / weight : null;
  const steop = courses.filter((c) => c.module.startsWith('STEOP') && passing(c)).reduce((a, c) => a + c.ects, 0);
  return { passed, running, avg, steop };
}

export type Slot = { course: Course; begin: string; mappable: boolean; day: number; from: string; to: string; label: string; room: string; teachers: string[]; ue: boolean };
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const SHORT: Record<string, string> = { STEOP1: 'EP1', STEOP2: 'Rechenm.', STEOP3: 'Forschung' };
type Event = Course['groups'][number]['events'][number];
const slotOf = (c: Course, e: Event): Slot => {
  const teachers = c.groups.find((g) => g.id === c.groupId)?.teachers ?? [];
  const b = new Date(e.begin), part = partOf(c.type, e);
  return {
    course: c, begin: e.begin, mappable: part !== 'UE', day: (b.getDay() + 6) % 7, from: hm(b), to: hm(new Date(e.end)),
    label: `${SHORT[c.module] ?? c.module} ${part}`, room: e.room, teachers, ue: part !== 'VO',
  };
};

// Where and with whom, for a slot's hover: a line each.
export const whereWho = (s: Slot) => [s.room, s.teachers.join(', ')].filter(Boolean).join('\n');

// The week to show: this one while the term runs, otherwise the first week
// anything is on. Only the chosen group of each course.
export function week(courses: Course[], now = new Date()): { monday: Date; slots: Slot[] } {
  const events = courses.flatMap((c) => {
    const g = c.groups.find((x) => x.id === c.groupId);
    return (g?.events ?? []).map((e) => ({ c, e, begin: new Date(e.begin) }));
  });
  const mondayOf = (d: Date) => { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
  // Saturday and Sunday look ahead: the week just gone is over.
  let monday = mondayOf((now.getDay() + 6) % 7 >= 5 ? new Date(now.getTime() + 2 * 864e5) : now);
  const inWeek = (m: Date) => events.filter((e) => e.begin >= m && e.begin.getTime() < m.getTime() + 5 * 864e5);
  // A week with nothing in it yet (before the term, or a break) shows the
  // next one that has: of that week and the one after, the fuller, so a term
  // that starts on a Thursday opens on its first whole week.
  if (!inWeek(monday).length) {
    const next = events.map((e) => e.begin).filter((b) => b > now).sort((a, b) => a.getTime() - b.getTime())[0];
    if (next) {
      const first = mondayOf(next), second = new Date(first.getTime() + 7 * 864e5);
      monday = inWeek(second).length > inWeek(first).length ? second : first;
    }
  }
  return {
    monday,
    slots: inWeek(monday).map((x) => slotOf(x.c, x.e)),
  };
}

// The demo's first term: the real courses and their real slots of 2026W,
// a lecture's dates weekly through the term, two groups for each exercise,
// the registered one second.
// The demo's exams, invented for it: u:find posts the real ones later in the term.
const DEMO_EXAMS: Record<string, Course['exams']> = {
  STEOP1: [{ id: 'd1', begin: '2027-01-22T13:00:00+01:00', end: '2027-01-22T16:00:00+01:00', title: 'STEOP 1: Modulprüfung Experimentalphysik I', room: 'Lise-Meitner-Hörsaal' }],
  STEOP2: [{ id: 'd2', begin: '2027-01-15T11:00:00+01:00', end: '2027-01-15T13:00:00+01:00', title: 'STEOP 2: Modulprüfung Physikalische Rechenmethoden', room: 'Lise-Meitner-Hörsaal' }],
  ANA1: [{ id: 'd3', begin: '2027-01-27T09:45:00+01:00', end: '2027-01-27T11:45:00+01:00', title: 'Analysis 1, Prüfung', room: 'Ludwig-Boltzmann-Hörsaal' }],
};

export function sampleCourses(): Course[] {
  const weekly = (weekday: number, from: string, to: string, room: string, lecture?: boolean) => {
    const out: Event[] = [];
    for (let d = new Date(2026, 9, 5 + weekday); d < new Date(2027, 0, 30); d.setDate(d.getDate() + 7)) {
      const at = (t: string) => { const x = new Date(d); const [h, m] = t.split(':').map(Number); x.setHours(h!, m!); return x.toISOString(); };
      out.push({ begin: at(from), end: at(to), room, lecture });
    }
    return out;
  };
  const LM = 'Lise-Meitner-Hörsaal', LB = 'Ludwig-Boltzmann-Hörsaal', CD = 'Christian-Doppler-Hörsaal';
  const c = (id: number, nr: string, module: string, name: string, type: string, ects: number, slots: [number, string, string, string, boolean?][][], groupId = `${nr}-${slots.length}`): Course => ({
    id, nr, semester: '2026W', module, name, type, ects, grade: null, groupId, refreshedAt: new Date().toISOString(),
    exams: type !== 'VO' ? [] : (DEMO_EXAMS[module] ?? []),
    groups: slots.map((g, i) => ({ id: `${nr}-${i + 1}`, events: g.flatMap(([d, f, t, r, l]) => weekly(d, f, t, r, l)) })),
  });
  return [
    c(1, '261600', 'STEOP1', 'Experimentalphysik 1', 'VO', 5, [[[0, '09:15', '10:45', LM], [1, '09:15', '10:45', LM], [2, '09:15', '10:45', LM]]]),
    c(2, '260162', 'STEOP1', 'Experimentalphysik 1', 'UE', 3, [[[3, '13:00', '14:30', LB]], [[3, '16:30', '18:00', LM]]]),
    c(3, '261603', 'STEOP2', 'Physikalische Rechenmethoden', 'VO', 5, [[[1, '11:00', '12:30', LM], [4, '11:00', '12:30', LM]]]),
    c(4, '261604', 'STEOP2', 'Physikalische Rechenmethoden', 'UE', 3, [[[3, '15:00', '16:30', LB]], [[2, '16:30', '18:00', CD]]]),
    c(5, '260041', 'STEOP3', 'Forschung und Studium in Physik', 'KU', 2, [[[2, '10:45', '12:15', LM]]]),
    c(6, '260022', 'LA1', 'Lineare Algebra 1', 'VU', 4, [[[1, '13:00', '13:45', LB, false], [3, '09:15', '10:45', LM, true]], [[1, '15:00', '15:45', LB, false], [3, '09:15', '10:45', LM, true]]]),
    c(7, '261608', 'ANA1', 'Analysis 1', 'VO', 5, [[[0, '11:00', '12:30', LM], [3, '11:00', '12:30', LM]]]),
    c(8, '261609', 'ANA1', 'Analysis 1', 'UE', 3, [[[0, '13:00', '14:30', LB]], [[0, '16:30', '18:00', CD]]]),
  ];
}

// A month as the calendar draws it: whole weeks from the Monday on or before
// the 1st to the Sunday on or after its last day, each day with its dates
// (the chosen groups, as in the week) and its exams, each exam once.
export type MonthDay = { date: Date; inMonth: boolean; today: boolean; moon: number; slots: Slot[]; exams: (Course['exams'][number] & { course: Course })[] };
export function monthOf(courses: Course[], year: number, month: number): MonthDay[] {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const end = new Date(last); end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const key = (d: Date) => d.toDateString();
  const days = new Map<string, MonthDay>();
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const x = new Date(d);
    days.set(key(x), { date: x, inMonth: x.getMonth() === month, today: key(x) === key(new Date()), moon: moonOf(x), slots: [], exams: [] });
  }
  const seen = new Set<string>();
  for (const c of courses) {
    const g = c.groups.find((x) => x.id === c.groupId);
    for (const e of g?.events ?? []) {
      days.get(key(new Date(e.begin)))?.slots.push(slotOf(c, e));
    }
    for (const x of c.exams) {
      const day = days.get(key(new Date(x.begin)));
      if (day && !seen.has(x.id)) { seen.add(x.id); day.exams.push({ ...x, course: c }); }
    }
  }
  for (const d of days.values()) d.slots.sort((a, b) => a.from.localeCompare(b.from));
  return [...days.values()];
}

// The moon's age as a fraction of its month: 0 new, 0.5 full. From a known
// new moon and the mean synodic month, good to within a day.
export function moonOf(d: Date): number {
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
  return (((days / 29.530588853) % 1) + 1) % 1;
}
// The lit part of the moon as an SVG path, for a disc of radius r at 0,0.
export function moonPath(p: number, r: number): string {
  const n = 16, pts: string[] = [];
  const waxing = p < 0.5, c = Math.cos(2 * Math.PI * p);
  for (let i = 0; i <= n; i++) { const y = -r + (2 * r * i) / n, w = Math.sqrt(Math.max(0, r * r - y * y)); pts.push(`${(waxing ? w : -w).toFixed(2)},${y.toFixed(2)}`); }
  for (let i = n; i >= 0; i--) { const y = -r + (2 * r * i) / n, w = Math.sqrt(Math.max(0, r * r - y * y)); pts.push(`${(waxing ? w * c : -w * c).toFixed(2)},${y.toFixed(2)}`); }
  return `M${pts.join('L')}Z`;
}
