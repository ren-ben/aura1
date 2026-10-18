// Sample data for the published demo, answering the same calls as the API.
// Seeded, so the demo looks the same on every visit.
import { mnemoDemo } from './samplemnemo';
import type { Block, Book, Reading, Course, PlanDay, Device, Folder, Habit, Quote, Session, Stats, Todo, Vigil, LectureMapDto } from './store';
import { sampleSits } from './vigil';
import { sampleCourses } from './academy';
import { sampleFolios } from './folios';
import { samplePost, sampleOpened } from './post';
import type { CardDto } from '@aura/shared';
import { SAMPLE_DEEPER, SAMPLE_MAP } from './samplemap';
import { sampleHunt, type Hunt } from './hunt';
import { verdict, bouts, partOf } from '@aura/shared';

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
  { id: 1, body: 'Read Kant, Prolegomena, sections 1 to 3', dueDate: todayStr, done: true, doneOn: todayStr },
  { id: 2, body: 'Gym, pull day', dueDate: todayStr, done: false, doneOn: null },
  { id: 3, body: 'Ship the sync fix', dueDate: todayStr, done: true, doneOn: todayStr },
  { id: 4, body: 'Call mom', dueDate: todayStr, done: false, doneOn: null },
  { id: 5, body: 'Problem set 4, linear algebra', dueDate: day(tomorrow), done: false, doneOn: null },
  { id: 6, body: 'Draft the essay on Schopenhauer', dueDate: null, done: false, doneOn: null },
];

// Today, wired: the morning's two sessions fall inside the first two taps.
let blocks: Block[] = ([
  [480, 600, 'Problem set 4', 1, 1], [630, 750, 'Sync fix', 2, 11], [840, 930, 'Pull day', 4, 41],
  [960, 1050, 'Prolegomena', 3, 31], [1200, 1260, 'Essay draft', 0, 22],
] as const).map(([start, end, title, shade, activityId], i) => ({ id: 900 + i, date: todayStr, start, end, title, shade, activityId }));
let planDays: PlanDay[] = [{ date: todayStr, rev: 4, capacity: 480 }];
const rewired = (date: string) => {
  const d = planDays.find((x) => x.date === date);
  if (d) d.rev++; else planDays.push({ date, rev: 1, capacity: 480 });
};

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
  lastSyncAt: new Date(Date.now() - 38 * 60_000).toISOString(), battery: 70, millivolts: 3912, charging: false, look: 'CATHEDRAL', skin: 'jiji', pendingLook: null,
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
const folios = sampleFolios();
// Lecture maps: every one the same Newton, "written" over two polls.
const maps: LectureMapDto[] = [];

// Goodreads, as the shelves might stand: one book open, the rest behind it.
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
const tome = (title: string, author: string, isbn: string, pages: number, readAt: string | null, rating: number, review: string | null = null) =>
  ({ title, author, cover: cover(isbn), pages, startedAt: null, readAt, rating, average: 3.8 + (pages % 7) / 10, review, url: 'https://www.goodreads.com' });
const reading: Reading = {
  current: [{ ...tome('The Secret History', 'Donna Tartt', '9781400031702', 559, null, 0), cover: 'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1751820530i/29044.jpg', startedAt: '2026-09-14' }],
  read: [
    tome('Piranesi', 'Susanna Clarke', '9781635575637', 272, '2026-09-06', 5,
      'The Beauty of the House is immeasurable; its Kindness infinite.\n\nRead it in two nights. Would live in the flooded halls.'),
    tome('The Count of Monte Cristo', 'Alexandre Dumas', '9780140449266', 1276, '2026-08-30', 5,
      'Wait and hope. Twelve hundred pages of revenge and not one of them wasted.'),
    tome('Blindsight', 'Peter Watts', '9780765319647', 384, '2026-08-21', 4),
    tome('Babel', 'R. F. Kuang', '9780063021426', 545, '2026-08-02', 4),
    tome('The Haunting of Hill House', 'Shirley Jackson', '9780143039983', 182, '2026-07-11', 5),
    tome('Frankenstein', 'Mary Shelley', '9780141439471', 273, '2026-06-24', 5),
    tome('House of Leaves', 'Mark Z. Danielewski', '9780375703768', 709, '2026-06-01', 4),
    tome('Solaris', 'Stanisław Lem', '9780156027601', 204, '2026-04-19', 5),
    tome('If We Were Villains', 'M. L. Rio', '9781250095282', 354, '2026-03-30', 3),
    tome('The Name of the Rose', 'Umberto Eco', '9780156001311', 536, '2026-02-22', 4),
    tome('Dracula', 'Bram Stoker', '9780141439846', 488, '2026-01-15', 4),
    tome('Mexican Gothic', 'Silvia Moreno-Garcia', '9780525620785', 301, '2025-12-03', 3),
    tome('The King in Yellow', 'Robert W. Chambers', '9780486442242', 208, '2025-10-31', 4),
    tome('The Picture of Dorian Gray', 'Oscar Wilde', '9780141439570', 254, '2025-10-02', 5),
    tome('Rebecca', 'Daphne du Maurier', '9780380730407', 410, '2025-08-17', 4),
    tome('Jane Eyre', 'Charlotte Brontë', '9780141441146', 532, '2025-07-09', 4),
    // And the years before: enough to fill a room.
    ...'Carmilla|Sheridan Le Fanu;The Castle of Otranto|Horace Walpole;The Monk|Matthew Lewis;Melmoth the Wanderer|Charles Maturin;Wuthering Heights|Emily Brontë;The Turn of the Screw|Henry James;Strange Case of Dr Jekyll and Mr Hyde|R. L. Stevenson;The Great God Pan|Arthur Machen;The Willows|Algernon Blackwood;At the Mountains of Madness|H. P. Lovecraft;The Shadow over Innsmouth|H. P. Lovecraft;The Call of Cthulhu|H. P. Lovecraft;The Fall of the House of Usher|Edgar Allan Poe;The Narrative of Arthur Gordon Pym|Edgar Allan Poe;Northanger Abbey|Jane Austen;The Mysteries of Udolpho|Ann Radcliffe;Vathek|William Beckford;Uncle Silas|Sheridan Le Fanu;The Woman in White|Wilkie Collins;The Moonstone|Wilkie Collins;Great Expectations|Charles Dickens;Bleak House|Charles Dickens;Crime and Punishment|Fyodor Dostoevsky;The Brothers Karamazov|Fyodor Dostoevsky;Notes from Underground|Fyodor Dostoevsky;Demons|Fyodor Dostoevsky;The Master and Margarita|Mikhail Bulgakov;The Trial|Franz Kafka;The Castle|Franz Kafka;The Metamorphosis|Franz Kafka;The Magic Mountain|Thomas Mann;Death in Venice|Thomas Mann;Doctor Faustus|Thomas Mann;Steppenwolf|Hermann Hesse;The Glass Bead Game|Hermann Hesse;Siddhartha|Hermann Hesse;Demian|Hermann Hesse;Thus Spoke Zarathustra|Friedrich Nietzsche;Beyond Good and Evil|Friedrich Nietzsche;The World as Will and Representation|Arthur Schopenhauer;Essays and Aphorisms|Arthur Schopenhauer;Meditations|Marcus Aurelius;Letters from a Stoic|Seneca;The Consolation of Philosophy|Boethius;Confessions|Augustine;Inferno|Dante Alighieri;Paradise Lost|John Milton;Faust|J. W. von Goethe;The Sorrows of Young Werther|J. W. von Goethe;Gormenghast|Mervyn Peake;Titus Groan|Mervyn Peake;Jonathan Strange and Mr Norrell|Susanna Clarke;The Night Circus|Erin Morgenstern;The Starless Sea|Erin Morgenstern;Ninth House|Leigh Bardugo;Hell Bent|Leigh Bardugo;A Deadly Education|Naomi Novik;Vita Nostra|Marina and Sergey Dyachenko;The Atlas Six|Olivie Blake;Bunny|Mona Awad;Annihilation|Jeff VanderMeer;Authority|Jeff VanderMeer;Acceptance|Jeff VanderMeer;Roadside Picnic|Arkady and Boris Strugatsky;Hard to Be a God|Arkady and Boris Strugatsky;The Cyberiad|Stanisław Lem;His Master\'s Voice|Stanisław Lem;Echopraxia|Peter Watts;Children of Time|Adrian Tchaikovsky;Anathem|Neal Stephenson;Gideon the Ninth|Tamsyn Muir;Harrow the Ninth|Tamsyn Muir;Nona the Ninth|Tamsyn Muir;The Library at Mount Char|Scott Hawkins;Hell House|Richard Matheson;I Am Legend|Richard Matheson;The Shining|Stephen King;Pet Sematary|Stephen King;Interview with the Vampire|Anne Rice;The Historian|Elizabeth Kostova;The Thirteenth Tale|Diane Setterfield;My Cousin Rachel|Daphne du Maurier;We Have Always Lived in the Castle|Shirley Jackson;The Lottery|Shirley Jackson;Something Wicked This Way Comes|Ray Bradbury;The Ocean at the End of the Lane|Neil Gaiman;Norwegian Wood|Haruki Murakami;Kafka on the Shore|Haruki Murakami;The Remains of the Day|Kazuo Ishiguro;Never Let Me Go|Kazuo Ishiguro;Stoner|John Williams;The Secret Garden|Frances Hodgson Burnett'.split(';').map((line, i) => {
      const [title, author] = line.split('|') as [string, string];
      return { title, author, cover: null, pages: 180 + ((i * 97) % 520), startedAt: null, readAt: day(new Date(2025, 5, 20 - i * 9)), rating: 3 + (i % 3), average: 3.6 + (i % 9) / 10, review: null, url: 'https://www.goodreads.com' };
    }),
  ],
};

// The API's routes, in memory.
let hunt: Hunt = sampleHunt();
function huntApi(method: string, seg: string[], body: any): unknown {
  const key = `${method} ${seg.slice(1).map((x) => (/^[0-9a-f-]{6,}$/.test(x) ? ':id' : x)).join('/')}`;
  switch (key) {
    case 'GET ': return structuredClone(hunt);
    case 'POST sets': hunt.sets.push(...body.sets.map((s: any) => ({ ...s, source: 'phone' }))); hunt.sets.sort((a, b) => a.at.localeCompare(b.at)); break;
    case 'PATCH sets/:id': Object.assign(hunt.sets.find((s) => s.uuid === seg[2])!, body); break;
    case 'DELETE sets/:id': hunt.sets = hunt.sets.filter((s) => s.uuid !== seg[2]); break;
    case 'PUT feels': hunt.feels = [...hunt.feels.filter((f) => !(f.exerciseId === body.exerciseId && f.date === body.date)), body]; break;
    case 'POST exercises': hunt.exercises.push({ ...body, id: nextId++, archived: false }); break;
    case 'PATCH exercises/:id': {
      const e = hunt.exercises.find((x) => x.id === Number(seg[2]))!;
      const { archived, ...rest } = body;
      Object.assign(e, rest, archived === undefined ? {} : { archived });
      break;
    }
    case 'PUT bodyweight': hunt.bodyweight = body.kg; break;
    case 'POST garmin/refresh': hunt.garminSyncedAt = new Date().toISOString(); break;
    default: throw new Error(`demo: ${method} /hunt/${seg.slice(1).join('/')}`);
  }
  const groups = new Map(hunt.exercises.map((e) => [e.id, e.group]));
  hunt.verdict = verdict({ now: new Date(), today: day(new Date()), days: hunt.days, activities: hunt.activities,
    lifts: bouts(hunt.sets).map((b) => ({ at: b[0]!.at, group: groups.get(b[0]!.exerciseId)! })) });
  return undefined;
}

const post = samplePost();

export function demoApi(method: string, path: string, body?: any): unknown {
  const [route, query] = path.split('?');
  const seg = route!.split('/').filter(Boolean);
  if (seg[0] === 'hunt') return huntApi(method, seg, body);
  if (seg[0] === 'academy' && seg[1]?.startsWith('topic')) return mnemoDemo(method, seg, body);
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
    case 'GET /reading': return structuredClone(reading);
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
    case 'POST /todos': todos.push({ id: nextId++, body: body.body, dueDate: body.dueDate, done: false, doneOn: null }); return;
    case 'PATCH /todos/:id': todos = todos.map((t) => (t.id === id ? { ...t, ...body, ...('done' in body ? { doneOn: body.done ? todayStr : null } : {}) } : t)); return;
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
    case 'GET /mail': case 'POST /mail/check': return structuredClone(post.mail);
    case 'GET /mail/:id': return sampleOpened(post.mail, post.bodies, id);
    case 'GET /mail/:id/attachments': throw new Error('the demo has no attachments');
    case 'PUT /mail/seen': {
      for (const l of post.mail.letters) if (body.uids.includes(l.uid) && l.unread === body.seen) { l.unread = !body.seen; post.mail.unread += body.seen ? -1 : 1; }
      return;
    }
    case 'POST /academy/courses': throw new Error('the demo cannot reach u:find');
    case 'GET /academy/folios': return seg[3] === 'tasks' ? [{ n: 1, title: 'Grenzwerte', page: 1 }, { n: 2, title: 'Ableitungen', page: 1 }] : structuredClone(folios);
    case 'POST /academy/moodle': throw new Error('the demo cannot reach Moodle');
    case 'GET /academy/asks': return [];
    case 'GET /academy/decks': return sampleCards(Number(seg[2]));
    case 'POST /academy/cards': return;
    case 'GET /academy/own': return seg[2] === 'decks' ? [] : [];
    case 'POST /academy/own': throw new Error('the demo keeps no files');
    case 'PATCH /academy/own': case 'DELETE /academy/own': return;
    case 'POST /academy/asks': case 'POST /academy/hints': throw new Error("the demo has no OpenRouter key; Kael'thos stays silent");
    case 'POST /academy/moodle/sync': case 'DELETE /academy/moodle': return;
    case 'PATCH /academy/folios': folios.folios = folios.folios.map((f) => (f.id === Number(seg[2]) ? { ...f, ...body } : f)); return;
    case 'DELETE /academy/folios': folios.folios = folios.folios.filter((f) => f.id !== Number(seg[2])); return;
    case 'PATCH /academy/courses': case 'DELETE /academy/courses': {
      const cid = Number(seg[2]);
      if (method === 'DELETE') courses = courses.filter((c) => c.id !== cid);
      else courses = courses.map((c) => (c.id === cid ? { ...c, ...body } : c));
      return;
    }
    case 'GET /academy/lectures': {
      const c = courses.find((x) => x.id === Number(seg[2]))!;
      const begin = new URLSearchParams(query).get('begin')!;
      const all = (c.groups.find((g) => g.id === c.groupId)?.events ?? []).filter((e) => partOf(c.type, e) !== 'UE').map((e) => e.begin).sort();
      const index = all.indexOf(begin);
      return { courseId: c.id, begin, index, total: all.length, topics: ['Grundlagen der Physik', 'Punktmechanik', 'Starre Körper', 'Deformierbare Körper und Fluide', 'Schwingungen und Wellen', 'Thermodynamik'], guess: `${c.name}: ${index < 6 ? "Newton's laws" : `lecture ${index + 1}`}`, map: structuredClone(maps.find((m) => m.courseId === c.id && m.begin === begin) ?? null) };
    }
    case 'POST /academy/maps': {
      if (seg[3] === 'expand') {
        const m = maps.find((x) => x.id === Number(seg[2]))!;
        const n = m.grown.filter((g) => g.parent === body.node.key).length;
        m.grown.push(...SAMPLE_DEEPER.nodes.map((x, i) => ({ ...x, id: `${body.node.key}.g${n + i}`, parent: body.node.key })));
        return structuredClone(m);
      }
      const m: LectureMapDto = { id: nextId++, courseId: body.courseId, begin: body.begin, topic: body.topic, status: 'researching', error: null, map: null, grown: [], sources: [], pages: [], costUsd: 0 };
      maps.push(m);
      return structuredClone(m);
    }
    case 'GET /academy/maps': {
      if (seg[2] === undefined) return maps.map((x) => ({ id: x.id, courseId: x.courseId, begin: x.begin, status: x.status, title: x.map?.title ?? null }));
      const m = maps.find((x) => x.id === Number(seg[2]))!;
      if (m.status === 'writing') Object.assign(m, { status: 'ready', map: { ...SAMPLE_MAP, title: m.topic.replace(/^[^:]*:\s*/, '') || SAMPLE_MAP.title }, costUsd: 0.1 });
      else if (m.status === 'researching') m.status = 'writing';
      return structuredClone(m);
    }
    case 'GET /blocks': return { blocks: structuredClone(blocks), days: structuredClone(planDays) };
    case 'POST /blocks': blocks.push({ id: nextId++, ...body }); rewired(body.date); return;
    case 'PATCH /blocks/:id': blocks = blocks.map((b) => (b.id === id ? { ...b, ...body } : b)); rewired(blocks.find((b) => b.id === id)!.date); return;
    case 'DELETE /blocks/:id': rewired(blocks.find((b) => b.id === id)!.date); blocks = blocks.filter((b) => b.id !== id); return;
    default:
      if (key.startsWith('PUT /plan-days/')) {
        const d = planDays.find((x) => x.date === seg[1]);
        if (d) d.capacity = body.capacity; else planDays.push({ date: seg[1]!, rev: 0, capacity: body.capacity });
        return;
      }
      throw new Error(`demo: no route ${key}`);
  }
}

// The demo's Moodle cards: two of the real ones, the rest in their manner.
function sampleCards(deckId: number): CardDto[] {
  const all: [number, string, string, string, number][] = [
    [3, 'Integration 1', '<p>\\( \\int \\frac{1}{x}\\,dx = ? \\)</p>', '<p>\\( \\ln(|x|) + C \\), für \\( x \\neq 0 \\)</p>', 1],
    [3, 'Integration 7', '<p>\\( \\int e^{2x}\\,dx \\)</p>', '<p>\\( \\tfrac{1}{2} e^{2x} + C \\)</p>', 2],
    [2, 'Differentiation 1', '<p>Which rule must be applied to differentiate \\( \\frac{x}{\\sqrt{1-x^2}} \\)?</p>', '<p>Product rule: \\( \\frac{1}{\\sqrt{1-x^2}} + \\frac{x^2}{\\sqrt{(1-x^2)^3}} \\)</p>', 1],
    [1, 'Funktionen 9', '<p>\\( \\sin^2 x + \\cos^2 x = ? \\)</p>', '<p>\\( 1 \\)</p>', 0],
  ];
  return all.filter(([d]) => d === deckId).map(([, name, front, back, box], i) => ({ id: deckId * 100 + i, deckId, qid: i, name, front, back, box, pending: 0, answeredAt: null }));
}
