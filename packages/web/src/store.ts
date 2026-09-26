// Everything the console shows, from the API. When the API cannot be reached
// (the published demo), the same calls run against sample data in memory.
import { computed, reactive } from 'vue';
import type { GrownNode, LectureDto, LectureMapDto, MapMark } from '@aura/shared';
import { demoApi } from './sample';

export type Progress = { xp: number; level: number; nextLevelXp: number };
export type Form = 'stable' | 'thinning' | 'fragmenting' | 'dormant';
export type Stats = {
  bond: Progress;
  form: Form;
  lastSessionAt: string | null;
  needsReview: number;
  activities: (Progress & { id: number; name: string; folder: string; minutes: number })[];
};
export type Folder = { id: number; name: string; archived: boolean; activities: { id: number; name: string; archived: boolean }[] };
export type Session = {
  id: number; activityId: number; activity: string; folder: string;
  startedAt: string; endedAt: string; minutes: number; source: 'device' | 'manual'; needsReview: boolean;
};
export type Todo = { id: number; body: string; dueDate: string | null; done: boolean };
export type Habit = { id: number; name: string; done: string[] };
export type Quote = { id: number; body: string; source: string | null };
export type Book = {
  id: number; title: string; author: string | null; format: 'epub' | 'pdf' | 'text';
  words: number; chapterIdx: number; through: number; readAt: string | null;
  chapters: { idx: number; title: string; words: number }[]; marks: number;
};
export type Mark = {
  id: number; bookId: number; chapterIdx: number; start: number; end: number;
  body: string; note: string | null; source: 'web' | 'device'; createdAt: string;
};
// The Vigil: every sit kept (a session on one of its practices), and the
// signs ticked off on the way up the gates.
export type Sit = { practice: string; startedAt: string; minutes: number; source: 'device' | 'manual' };
// hours: whether the device tolls the four sun hours, and today's, in local
// minutes after midnight.
export type Vigil = { sits: Sit[]; signs: string[]; hours: { on: boolean; today: number[] } };
// A course of the degree, as u:find had it when it was added.
export type CourseGroup = { id: string; events: { begin: string; end: string; room: string }[] };
export type CourseExam = { id: string; begin: string; end: string; title: string; room: string };
export type Course = {
  id: number; nr: string; semester: string; module: string; name: string; type: string; ects: number;
  groups: CourseGroup[]; groupId: string | null; grade: number | null;
  exams: CourseExam[]; refreshedAt: string;
};
export type Device = {
  lastSyncAt: string | null; battery: number | null; millivolts: number | null;
  charging: boolean | null; look: string | null; pendingLook: string | null;
};

// The rewiring: a block of planned time on one local day, in minutes after
// its midnight; and each planned day's revision count and capacity to draw.
export type Block = { id: number; date: string; start: number; end: number; title: string; shade: number; activityId: number | null };
export type PlanDay = { date: string; rev: number; capacity: number };

export const HABIT_DAYS = 182;

export const state = reactive({
  ready: false,
  demo: false,
  error: '' as string,
  stats: null as Stats | null,
  folders: [] as Folder[],
  sessions: [] as Session[],
  todos: [] as Todo[],
  habits: [] as Habit[],
  quotes: [] as Quote[],
  books: [] as Book[],
  marks: [] as Mark[],
  device: null as Device | null,
  vigil: { sits: [], signs: [], hours: { on: false, today: [] } } as Vigil,
  courses: [] as Course[],
  blocks: [] as Block[],
  planDays: [] as PlanDay[],
});

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
}

export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;
}

async function call<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  if (state.demo) return demoApi(method, path, body) as T;
  const response = await fetch(`/api/v1${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  // The server's own words when it has them: "the budget is spent" says more
  // than a status code.
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `${method} ${path}: HTTP ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const habitsPath = () => `/habits?from=${localDate(daysAgo(HABIT_DAYS - 1))}&to=${localDate()}`;
const sessionsPath = () => `/sessions?from=${daysAgo(7 * 12).toISOString()}`;
// The planned days held in the console; widened as the sheet is paged.
const planRange = [localDate(daysAgo(14)), localDate(daysAgo(-28))];
const blocksPath = () => `/blocks?from=${planRange[0]}&to=${planRange[1]}`;
type Plan = { blocks: Block[]; days: PlanDay[] };

export async function load(): Promise<void> {
  const all = () => Promise.all([
    call<Stats>('GET', '/stats'), call<Folder[]>('GET', '/folders'), call<Session[]>('GET', sessionsPath()),
    call<Todo[]>('GET', '/todos'), call<Habit[]>('GET', habitsPath()), call<Quote[]>('GET', '/quotes'),
    call<Device>('GET', '/device'), call<Book[]>('GET', '/books'), call<Mark[]>('GET', '/marks'),
    call<Vigil>('GET', '/vigil'), call<Course[]>('GET', '/academy'), call<Plan>('GET', blocksPath()),
  ]);
  let got;
  try {
    if (import.meta.env.VITE_DEMO) throw new Error('demo');
    got = await all();
  } catch {
    state.demo = true;
    got = await all();
  }
  let plan: Plan;
  [state.stats, state.folders, state.sessions, state.todos, state.habits, state.quotes, state.device,
    state.books, state.marks, state.vigil, state.courses, plan] = got;
  [state.blocks, state.planDays] = [plan.blocks, plan.days];
  state.ready = true;
}

// Every change goes to the API, then the affected lists come back fresh.
async function act(method: string, path: string, body: unknown, reload: (() => Promise<void>)[]): Promise<boolean> {
  state.error = '';
  try {
    await call(method, path, body);
    await Promise.all(reload.map((r) => r()));
    return true;
  } catch (e) {
    state.error = e instanceof Error ? e.message : 'failed';
    return false;
  }
}
const reStats = async () => { state.stats = await call<Stats>('GET', '/stats'); };
const reFolders = async () => { state.folders = await call<Folder[]>('GET', '/folders'); };
const reSessions = async () => { state.sessions = await call<Session[]>('GET', sessionsPath()); };
const reTodos = async () => { state.todos = await call<Todo[]>('GET', '/todos'); };
const reHabits = async () => { state.habits = await call<Habit[]>('GET', habitsPath()); };
const reQuotes = async () => { state.quotes = await call<Quote[]>('GET', '/quotes'); };
const reBooks = async () => { state.books = await call<Book[]>('GET', '/books'); };
const reMarks = async () => { state.marks = await call<Mark[]>('GET', '/marks'); };

// One chapter of one book, fetched when it is opened rather than held in the
// console: a book is far too big to keep in memory for the sake of a list.
export const chapterOf = (bookId: number, idx: number) =>
  call<{ idx: number; title: string; body: string }>('GET', `/books/${bookId}/chapters/${idx}`);
const reVigil = async () => { state.vigil = await call<Vigil>('GET', '/vigil'); };
const reCourses = async () => { state.courses = await call<Course[]>('GET', '/academy'); };
const rePlan = async () => { const p = await call<Plan>('GET', blocksPath()); [state.blocks, state.planDays] = [p.blocks, p.days]; };
const reDevice = async () => { state.device = await call<Device>('GET', '/device'); };

// Lecture maps: fetched when a lecture is opened, never held in the console.
export const lectureMaps = {
  lecture: (courseId: number, begin: string) => call<LectureDto>('GET', `/academy/lectures/${courseId}?begin=${encodeURIComponent(begin)}`),
  start: (courseId: number, begin: string, topic: string, rewrite = false) => call<LectureMapDto>('POST', '/academy/maps', { courseId, begin, topic, ...(rewrite ? { rewrite } : {}) }),
  get: (id: number) => call<LectureMapDto>('GET', `/academy/maps/${id}`),
  list: () => call<MapMark[]>('GET', '/academy/maps'),
  deeper: (id: number, node: { key: string; kind: string; title: string; text: string }) =>
    call<LectureMapDto>('POST', `/academy/maps/${id}/expand`, { node }),
};
// Back to the server's plan after a change it refused.
const settle = async (ok: boolean) => { if (!ok) await rePlan().catch(() => {}); return ok; };
// The plan changes in place first, so a drag never waits on the network;
// the server's copy comes back after.
export const plan = {
  show: async (from: string, to: string) => {
    if (from >= planRange[0]! && to <= planRange[1]!) return;
    if (from < planRange[0]!) planRange[0] = from;
    if (to > planRange[1]!) planRange[1] = to;
    await rePlan();
  },
  add: async (b: Omit<Block, 'id'>) => {
    const id = -Date.now();
    state.blocks.push({ ...b, id });
    const ok = await act('POST', '/blocks', b, [rePlan]);
    if (!ok) state.blocks = state.blocks.filter((x) => x.id !== id);
    return ok;
  },
  change: async (b: Block, patch: Partial<Omit<Block, 'id'>>) => {
    Object.assign(b, patch);
    return settle(await act('PATCH', `/blocks/${b.id}`, patch, [rePlan]));
  },
  remove: async (b: Block) => {
    state.blocks = state.blocks.filter((x) => x.id !== b.id);
    return settle(await act('DELETE', `/blocks/${b.id}`, undefined, [rePlan]));
  },
  capacity: (date: string, capacity: number) => act('PUT', `/plan-days/${date}`, { capacity }, [rePlan]),
};
export type { GrownNode, LectureDto, LectureMapDto, MapMark };

export const actions = {
  addTodo: (body: string, dueDate: string | null) => act('POST', '/todos', { body, dueDate }, [reTodos]),
  toggleTodo: (t: Todo) => act('PATCH', `/todos/${t.id}`, { done: !t.done }, [reTodos]),
  removeTodo: (t: Todo) => act('DELETE', `/todos/${t.id}`, undefined, [reTodos]),
  addHabit: (name: string) => act('POST', '/habits', { name }, [reHabits]),
  archiveHabit: (h: Habit) => act('PATCH', `/habits/${h.id}`, { archived: true }, [reHabits]),
  setHabit: (h: Habit, date: string, done: boolean) => act('PUT', `/habits/${h.id}/entries/${date}`, { done }, [reHabits]),
  addQuote: (body: string, source: string | null) => act('POST', '/quotes', { body, source }, [reQuotes]),
  // The book arrives already parsed: the server is never given an epub.
  addBook: (b: { title: string; author: string | null; format: string; chapters: { title: string; body: string }[] }) =>
    act('POST', '/books', b, [reBooks]),
  removeBook: (b: Book) => act('DELETE', `/books/${b.id}`, undefined, [reBooks]),
  readTo: (b: Book, chapterIdx: number, through: number) =>
    act('PUT', `/books/${b.id}/reading`, { chapterIdx, through }, [reBooks]),
  keep: (m: { bookId: number; chapterIdx: number; start: number; end: number; body: string }) =>
    act('POST', '/marks', m, [reMarks, reBooks]),
  annotate: (m: Mark, note: string | null) => act('PUT', `/marks/${m.id}`, { note }, [reMarks]),
  unkeep: (m: Mark) => act('DELETE', `/marks/${m.id}`, undefined, [reMarks, reBooks]),
  removeQuote: (q: Quote) => act('DELETE', `/quotes/${q.id}`, undefined, [reQuotes]),
  addSession: (activityId: number, startedAt: Date, endedAt: Date) =>
    act('POST', '/sessions', { activityId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() }, [reSessions, reStats]),
  confirmSession: (s: Session) => act('POST', `/sessions/${s.id}/confirm`, undefined, [reSessions, reStats]),
  removeSession: (s: Session) => act('DELETE', `/sessions/${s.id}`, undefined, [reSessions, reStats]),
  addFolder: (name: string) => act('POST', '/folders', { name }, [reFolders, reStats]),
  renameFolder: (id: number, name: string) => act('PATCH', `/folders/${id}`, { name }, [reFolders, reStats]),
  archiveFolder: (id: number, archived: boolean) => act('PATCH', `/folders/${id}`, { archived }, [reFolders, reStats]),
  addActivity: (folderId: number, name: string) => act('POST', '/activities', { folderId, name }, [reFolders, reStats]),
  renameActivity: (id: number, name: string) => act('PATCH', `/activities/${id}`, { name }, [reFolders, reStats]),
  archiveActivity: (id: number, archived: boolean) => act('PATCH', `/activities/${id}`, { archived }, [reFolders, reStats]),
  setLook: (look: string) => act('PUT', '/device/look', { look }, [reDevice]),
  keepSign: (sign: string, kept: boolean) => act('PUT', '/vigil/signs', { sign, kept }, [reVigil]),
  addSit: (practice: string, startedAt: Date, minutes: number) =>
    act('POST', '/vigil/sits', { practice, startedAt: startedAt.toISOString(), minutes }, [reVigil]),
  setSunHours: (on: boolean) => act('PUT', '/vigil/hours', { on }, [reVigil]),
  refreshCourses: (semester: string) => act('POST', '/academy/refresh', { semester }, [reCourses]),
  moduleCourse: (c: Course, module: string) => act('PATCH', `/academy/courses/${c.id}`, { module }, [reCourses]),
  addCourse: (nr: string, semester: string) => act('POST', '/academy/courses', { nr, semester }, [reCourses]),
  // Several at once, one after the other: u:find is asked once per course.
  addCourses: async (nrs: string[], semester: string) => {
    for (const nr of nrs) if (!(await act('POST', '/academy/courses', { nr, semester }, []))) break;
    await reCourses();
  },
  gradeCourse: (c: Course, grade: number | null) => act('PATCH', `/academy/courses/${c.id}`, { grade }, [reCourses]),
  groupCourse: (c: Course, groupId: string | null) => act('PATCH', `/academy/courses/${c.id}`, { groupId }, [reCourses]),
  removeCourse: (c: Course) => act('DELETE', `/academy/courses/${c.id}`, undefined, [reCourses]),
};

// Hours per local day, the last n days, oldest first.
export function dailyMinutes(days: number): number[] {
  const out = Array<number>(days).fill(0);
  const start = daysAgo(days - 1).getTime();
  for (const s of state.sessions) {
    const i = Math.floor((new Date(s.startedAt).getTime() - start) / 86_400_000);
    if (i >= 0 && i < days) out[i]! += s.minutes;
  }
  return out;
}

export const today = computed(() => {
  const start = daysAgo(0).getTime();
  const sessions = state.sessions.filter((s) => new Date(s.startedAt).getTime() >= start);
  return { sessions, minutes: sessions.reduce((a, s) => a + s.minutes, 0) };
});

export const todayTodos = computed(() => {
  const d = localDate();
  return state.todos.filter((t) => t.dueDate !== null && t.dueDate <= d);
});

// Share of hours in blocks over 45 minutes: unbroken time feeds him most.
export const density = computed(() => {
  const all = state.sessions.reduce((a, s) => a + s.minutes, 0);
  const deep = state.sessions.filter((s) => s.minutes >= 45).reduce((a, s) => a + s.minutes, 0);
  return all ? deep / all : 0;
});
