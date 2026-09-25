// Sample data for the published demo, answering the same calls as the API.
// Seeded, so the demo looks the same on every visit.
import type { Book, Course, Device, Folder, Habit, Quote, Session, Stats, Todo, Vigil } from './store';
import { sampleSits } from './vigil';
import { sampleCourses } from './academy';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const r = rng(1789);
const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const folders: Folder[] = [
  ['AXIOM', ['coursework', 'problem sets']], ['WORKSHOP', ['aura-1', 'side project']], ['HERESY', ['short form', 'long form']],
  ['DREAM', ['reading', 'notes']], ['HUNT', ['lifting', 'running']],
].map(([name, acts], i) => ({
  id: i + 1, name: name as string, archived: false,
  activities: (acts as string[]).map((a, j) => ({ id: i * 10 + j + 1, name: a, archived: false })),
}));
const activityName = (id: number) => {
  for (const f of folders) for (const a of f.activities) if (a.id === id) return { activity: a.name, folder: f.name };
  return { activity: '?', folder: '?' };
};

let nextId = 1000;
const sessions: Session[] = [];
const weights = [[1, 6], [2, 3], [11, 7], [12, 2], [21, 2], [22, 1], [31, 4], [32, 2], [41, 3], [42, 2]];
for (let back = 83; back >= 0; back--) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - back);
  const count = back === 0 ? 2 : Math.floor(r() * 3.2) + (back % 7 === 6 ? 0 : 1);
  let hour = 8 + Math.floor(r() * 2);
  for (let k = 0; k < count; k++) {
    let pick = r() * 32, id = 1;
    for (const [a, w] of weights) { pick -= w!; if (pick <= 0) { id = a!; break; } }
    const minutes = back === 0 ? [72, 89][k]! : Math.round(25 + r() * r() * 170 + (back < 14 ? 20 : 0));
    const start = new Date(d); start.setHours(hour, Math.floor(r() * 50));
    const end = new Date(start.getTime() + minutes * 60_000);
    hour += Math.ceil(minutes / 60) + 1 + Math.floor(r() * 3);
    sessions.push({ id: nextId++, activityId: id, ...activityName(id), startedAt: start.toISOString(), endedAt: end.toISOString(),
      minutes, source: r() < 0.08 ? 'manual' : 'device', needsReview: false });
  }
}
if (sessions.length > 6) { const s = sessions[sessions.length - 7]!; s.minutes = 402; s.endedAt = new Date(new Date(s.startedAt).getTime() + 402 * 60_000).toISOString(); s.needsReview = true; }
sessions.reverse();

const todayStr = day(new Date());
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
let todos: Todo[] = [
  { id: 1, body: 'Read Kant, Prolegomena, sections 1 to 3', dueDate: todayStr, done: true },
  { id: 2, body: 'Gym, pull day', dueDate: todayStr, done: false },
  { id: 3, body: 'Ship the sync fix', dueDate: todayStr, done: true },
  { id: 4, body: 'Call mom', dueDate: todayStr, done: false },
  { id: 5, body: 'Problem set 4, linear algebra', dueDate: day(tomorrow), done: false },
  { id: 6, body: 'Draft the essay on Schopenhauer', dueDate: null, done: false },
];

const habitNames: [string, number][] = [['meditate', 0.74], ['run', 0.43], ['journal', 0.58], ['read 20 pages', 0.66]];
let habits: Habit[] = habitNames.map(([name, p], i) => {
  const hr = rng(97 + i * 13), done: string[] = [];
  for (let back = 181; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    if (hr() < p + (back < 20 ? 0.18 : 0) && !(back === 0 && i % 2)) done.push(day(d));
  }
  return { id: i + 1, name, done };
});

let quotes: Quote[] = [
  { id: 1, body: 'One must imagine Sisyphus happy.', source: 'Albert Camus' },
  { id: 2, body: 'Talent hits a target no one else can hit. Genius hits a target no one else can see.', source: 'Arthur Schopenhauer' },
  { id: 3, body: 'That is not dead which can eternal lie, and with strange aeons even death may die.', source: 'H. P. Lovecraft' },
  { id: 4, body: 'Fear the old blood.', source: 'Master Willem' },
  { id: 5, body: 'I am a god, even though I am a man of God.', source: 'Kanye West' },
  { id: 6, body: 'He who has a why to live can bear almost any how.', source: 'Friedrich Nietzsche' },
];

const device: Device = {
  lastSyncAt: new Date(Date.now() - 38 * 60_000).toISOString(), battery: 70, millivolts: 3912, charging: false, look: 'CATHEDRAL', pendingLook: null,
};

const level = (xp: number) => Math.floor(Math.sqrt(xp / 30));
const progress = (xp: number) => ({ xp: Math.round(xp), level: level(xp), nextLevelXp: 30 * (level(xp) + 1) ** 2 });
function stats(): Stats {
  const per = new Map<number, { xp: number; minutes: number }>();
  let bond = 0, last = '';
  for (const s of sessions) {
    const mult = (s.source === 'manual' ? 0.5 : 1) * (s.minutes > 90 ? 1.5 : s.minutes >= 45 ? 1.25 : 1);
    const xp = s.needsReview ? 0 : s.minutes * mult;
    const e = per.get(s.activityId) ?? { xp: 0, minutes: 0 };
    e.xp += xp; e.minutes += s.minutes; per.set(s.activityId, e);
    bond += xp;
    if (s.endedAt > last) last = s.endedAt;
  }
  return {
    bond: progress(bond), form: 'stable', lastSessionAt: last || null, needsReview: sessions.filter((s) => s.needsReview).length,
    activities: folders.flatMap((f) => f.activities.filter((a) => !a.archived).map((a) => {
      const e = per.get(a.id) ?? { xp: 0, minutes: 0 };
      return { id: a.id, name: a.name, folder: f.name, minutes: e.minutes, ...progress(e.xp) };
    })),
  };
}

// Something on the shelf, out of copyright and in his taste.
const PARA = [
  'There are not many persons who know what wonders are opened to them in the stories and visions of their youth; for when as children we listen and dream, we think but half-formed thoughts, and when as men we try to remember, we are dulled and prosaic with the poison of life.',
  'But some of us awake in the night with strange phantasms of enchanted hills and gardens, of fountains that sing in the sun, of golden cliffs overhanging murmuring seas, of plains that stretch down to sleeping cities of bronze and stone, and of shadowy companies of heroes that ride caparisoned white horses along the edges of thick forests.',
  'Then we know that we have looked back through the ivory gates into that world of wonder which was ours before we were wise and unhappy.',
  'Out of the fungoid moon there came no light, and the stars above the marsh were the stars of no sky that any man has charted; yet the road went on, and the walls of the city stood as they had stood before the first of us drew breath.',
  'He who passes the gate does not come back the same, for the gate is not a thing of stone but a thing of hours, and it takes them from him as he goes.',
];
const chapterBody = (n: number) => Array.from({ length: 9 }, (_, i) => PARA[(n * 3 + i) % PARA.length]).join('\n\n');
const BOOK_CHAPTERS = [
  'The Silver Key', 'The White Ship', 'The Doom That Came to Sarnath', 'Celephais',
  'The Cats of Ulthar', 'The Other Gods', 'The Quest of Iranon',
];
let books: Book[] = [{
  id: 900,
  title: 'The Dream-Quest of Unknown Kadath',
  author: 'H. P. Lovecraft',
  format: 'epub' as const,
  words: 41_200,
  chapterIdx: 2,
  through: 340,
  readAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  chapters: BOOK_CHAPTERS.map((title, idx) => ({ idx, title, words: 5900 })),
  marks: 2,
},
...([
  [901, 'The King in Yellow', 'R. W. Chambers', 10, 3, 400, 3],
  [902, 'The Hill of Dreams', 'Arthur Machen', 7, 6, 900, 0],
  [903, 'Parerga and Paralipomena', 'Arthur Schopenhauer', 31, 20, 100, 9],
  [904, 'De Occulta Philosophia', 'H. C. Agrippa', 27, 0, 60, 0],
] as const).map(([id, title, author, n, chapterIdx, through, kept]) => ({
  id, title, author, format: (id % 2 ? 'epub' : 'pdf') as 'epub', words: n * 5200, chapterIdx, through,
  readAt: new Date(Date.now() - id * 3600_000).toISOString(),
  chapters: Array.from({ length: n }, (_, idx) => ({ idx, title: `Part ${idx + 1}`, words: 5200 })),
  marks: kept,
}))];
let marks = [
  {
    id: 901, bookId: 900, chapterIdx: 2, start: 0, end: 118,
    body: 'Then we know that we have looked back through the ivory gates into that world of wonder which was ours before we were wise and unhappy.',
    note: 'The gate is hours. He would say that.', source: 'web' as const,
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
  {
    id: 902, bookId: 900, chapterIdx: 1, start: 220, end: 332,
    body: 'He who passes the gate does not come back the same, for the gate is not a thing of stone but a thing of hours.',
    note: null, source: 'device' as const,
    createdAt: new Date(Date.now() - 50 * 3600_000).toISOString(),
  },
];

// Half a year of sits, and the signs of the first gates kept.
const vigil: Vigil = {
  sits: sampleSits().map((s) => {
    const at = new Date(); at.setHours(0, 0, 0, 0); at.setDate(at.getDate() - s.day);
    at.setMinutes(Math.round(s.hour * 60));
    return { practice: s.practice, startedAt: at.toISOString(), minutes: s.minutes, source: 'device' as const };
  }).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
  signs: ['I.1', 'I.2', 'I.3', 'II.1', 'II.2', 'II.3', 'III.1', 'III.2', 'III.3', 'IV.1', 'IV.2', 'IV.3', 'V.1'],
  hours: { on: false, today: [406, 766, 1131, 0] },
};
let courses: Course[] = sampleCourses();

// The API's routes, in memory.
export function demoApi(method: string, path: string, body?: any): unknown {
  const [route, query] = path.split('?');
  const seg = route!.split('/').filter(Boolean);
  const id = Number(seg[1]);
  const second = seg[1] === undefined ? '' : /^\d+$/.test(seg[1]) ? '/:id' : `/${seg[1]}`;
  const key = `${method} /${seg[0]}${second}${seg[2] && !/^\d+$/.test(seg[2]) ? `/${seg[2]}` : ''}`;
  switch (key) {
    case 'GET /stats': return stats();
    case 'GET /folders': return structuredClone(folders);
    case 'GET /sessions': return structuredClone(sessions);
    case 'GET /todos': return structuredClone(todos);
    case 'GET /habits': { void query; return structuredClone(habits); }
    case 'GET /quotes': return structuredClone(quotes);
    case 'GET /device': return { ...device };
    case 'GET /books': return structuredClone(books);
    case 'GET /marks': return structuredClone(marks);
    case 'GET /books/:id/chapters': {
      const idx = Number(seg[3]);
      return { idx, title: BOOK_CHAPTERS[idx] ?? `Part ${idx + 1}`, body: chapterBody(idx) };
    }
    case 'POST /books': {
      books.unshift({
        id: nextId++, title: body.title, author: body.author, format: body.format,
        words: body.chapters.reduce((a: number, c: { body: string }) => a + c.body.split(/\s+/).length, 0),
        chapterIdx: 0, through: 0, readAt: null, marks: 0,
        chapters: body.chapters.map((c: { title: string; body: string }, idx: number) => ({ idx, title: c.title, words: Math.round(c.body.length / 6) })),
      });
      return;
    }
    case 'DELETE /books/:id': books = books.filter((b) => b.id !== id); return;
    case 'PUT /books/:id/reading': {
      const b = books.find((x) => x.id === id);
      if (b) Object.assign(b, { chapterIdx: body.chapterIdx, through: body.through, readAt: new Date().toISOString() });
      return;
    }
    case 'POST /marks': {
      marks.unshift({ id: nextId++, ...body, note: null, source: 'web', createdAt: new Date().toISOString() });
      const b = books.find((x) => x.id === body.bookId);
      if (b) b.marks += 1;
      return;
    }
    case 'PUT /marks/:id': { const m = marks.find((x) => x.id === id); if (m) m.note = body.note; return; }
    case 'DELETE /marks/:id': {
      const gone = marks.find((x) => x.id === id);
      marks = marks.filter((x) => x.id !== id);
      const b = books.find((x) => x.id === gone?.bookId);
      if (b) b.marks = Math.max(0, b.marks - 1);
      return;
    }
    case 'POST /todos': todos.push({ id: nextId++, body: body.body, dueDate: body.dueDate, done: false }); return;
    case 'PATCH /todos/:id': todos = todos.map((t) => (t.id === id ? { ...t, ...body } : t)); return;
    case 'DELETE /todos/:id': todos = todos.filter((t) => t.id !== id); return;
    case 'POST /habits': habits.push({ id: nextId++, name: body.name, done: [] }); return;
    case 'PATCH /habits/:id': if (body.archived) habits = habits.filter((h) => h.id !== id); return;
    case 'PUT /habits/:id/entries': {
      const date = seg[3]!, h = habits.find((x) => x.id === id)!;
      h.done = body.done ? [...new Set([...h.done, date])].sort() : h.done.filter((d) => d !== date);
      return;
    }
    case 'POST /quotes': quotes.unshift({ id: nextId++, body: body.body, source: body.source }); return;
    case 'DELETE /quotes/:id': quotes = quotes.filter((q) => q.id !== id); return;
    case 'POST /sessions': {
      const minutes = Math.round((new Date(body.endedAt).getTime() - new Date(body.startedAt).getTime()) / 60_000);
      sessions.unshift({ id: nextId++, activityId: body.activityId, ...activityName(body.activityId), startedAt: body.startedAt, endedAt: body.endedAt, minutes, source: 'manual', needsReview: false });
      sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return;
    }
    case 'POST /sessions/:id/confirm': { const s = sessions.find((x) => x.id === id); if (s) s.needsReview = false; return; }
    case 'DELETE /sessions/:id': { const i = sessions.findIndex((x) => x.id === id); if (i >= 0) sessions.splice(i, 1); return; }
    case 'POST /folders': folders.push({ id: nextId++, name: body.name, archived: false, activities: [] }); return;
    case 'PATCH /folders/:id': { const f = folders.find((x) => x.id === id)!; Object.assign(f, body); return; }
    case 'POST /activities': folders.find((f) => f.id === body.folderId)!.activities.push({ id: nextId++, name: body.name, archived: false }); return;
    case 'PATCH /activities/:id': { for (const f of folders) for (const a of f.activities) if (a.id === id) Object.assign(a, body); return; }
    case 'PUT /device/look': device.pendingLook = body.look; return;
    case 'GET /vigil': return structuredClone(vigil);
    case 'POST /vigil/sits':
      vigil.sits.push({ practice: body.practice, startedAt: body.startedAt, minutes: body.minutes, source: 'manual' });
      vigil.sits.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      return;
    case 'PUT /vigil/hours': vigil.hours.on = body.on; return;
    case 'POST /academy/refresh': return { refreshed: courses.length, of: courses.length };
    case 'PUT /vigil/signs':
      vigil.signs = body.kept ? [...new Set([...vigil.signs, body.sign])] : vigil.signs.filter((s) => s !== body.sign);
      return;
    case 'GET /academy': return structuredClone(courses);
    case 'POST /academy/courses': throw new Error('the demo cannot reach u:find');
    case 'PATCH /academy/courses': case 'DELETE /academy/courses': {
      const cid = Number(seg[2]);
      if (method === 'DELETE') courses = courses.filter((c) => c.id !== cid);
      else courses = courses.map((c) => (c.id === cid ? { ...c, ...body } : c));
      return;
    }
    default: throw new Error(`demo: no route ${key}`);
  }
}
