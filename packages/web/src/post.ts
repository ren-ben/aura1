// The post as a night sky: every sender a constellation, every letter a star.
// A constellation grows a week at a time: each week a sender wrote is one star
// of the figure, stepping off one already there - mostly the last week's, now
// and then an older one - so over a term a sender draws a branching figure,
// and a new week only ever adds to it. The week's letters gather round its
// star in a small spiral, so a busy sender makes a bright knot, not a tangle.
import type { LetterDto, MailDto, OpenedDto } from '@aura/shared';

export type Star = { i: number; az: number; el: number; parent: number };
export type Figure = { key: string; label: string; az: number; el: number; stars: Star[]; unread: number };

const D = Math.PI / 180;
// Senders with their own constellation; the rest share the last.
const OWN = 11;

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 2147483646 + 1; };

export const keyOf = (l: LetterDto) => (/moodle/i.test(l.addr) ? 'moodle' : (l.addr || l.from).toLowerCase());
const short = (s: string) => s.replace(/\s*\((via|über) .*\)$/i, '').replace(/^"|"$/g, '').trim();

// Where each figure sits: the biggest ahead, the others evenly round the sky,
// one side then the other, a little below the horizon and a little above.
function home(rank: number, of: number) {
  const side = rank % 2 ? 1 : -1, step = Math.min(40, 360 / of);
  return { az: side * Math.ceil(rank / 2) * step * D, el: (rank ? (rank % 4 < 2 ? 4 : -14) : -4) * D };
}
// A week's knot: its letters round its star on the golden angle.
const knot = (k: number) => ({ x: Math.cos(k * 2.39996) * 0.42 * Math.sqrt(k), y: Math.sin(k * 2.39996) * 0.42 * Math.sqrt(k) });
const span = (n: number) => 0.42 * Math.sqrt(Math.max(0, n - 1));

// One figure's weeks, in degrees about its own centre; `sizes` the letters in each.
function grow(sizes: number[], seed: number) {
  const r = rng(seed);
  const pts: { x: number; y: number; h: number; parent: number }[] = [{ x: 0, y: 0, h: r() * Math.PI * 2, parent: -1 }];
  for (let k = 1; k < sizes.length; k++) {
    const parent = r() < 0.72 ? k - 1 : Math.floor(r() * k);
    const p = pts[parent]!, reach = 4 + Math.sqrt(k) * 1.8;
    let best = { x: 0, y: 0, h: 0, score: -Infinity };
    for (let t = 0; t < 7; t++) {
      // Too far out, and the next step bends back toward the middle.
      const out = Math.hypot(p.x, p.y) > reach;
      const h = out ? Math.atan2(-p.y, -p.x) + (r() - 0.5) * 1.2 : p.h + (r() - 0.5) * 1.7;
      const step = 2.2 + r() * 1.4 + span(sizes[parent]!) + span(sizes[k]!);
      const x = p.x + Math.cos(h) * step, y = p.y + Math.sin(h) * step;
      let near = Infinity;
      for (let q = 0; q < pts.length; q++) near = Math.min(near, Math.hypot(pts[q]!.x - x, pts[q]!.y - y) - span(sizes[q]!) - span(sizes[k]!));
      const score = Math.min(near, 1.6) - Math.hypot(x, y) * 0.02;
      if (score > best.score) best = { x, y, h, score };
    }
    pts.push({ x: best.x, y: best.y, h: best.h, parent });
  }
  return pts;
}
const WEEK = 7 * 86400e3;

// The whole sky for the letters given, newest first as the server lists them.
export function chart(letters: LetterDto[]): Figure[] {
  const groups = new Map<string, number[]>();
  letters.forEach((l, i) => { const k = keyOf(l); groups.set(k, [...(groups.get(k) ?? []), i]); });
  let sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  if (sorted.length > OWN) sorted = [...sorted.slice(0, OWN - 1), ['others', sorted.slice(OWN - 1).flatMap(([, is]) => is).sort((a, b) => a - b)]];
  return sorted.map(([key, idx], rank) => {
    const at = home(rank, sorted.length);
    // Oldest first, by week: the figure begins where the sender began.
    const weeks = new Map<number, number[]>();
    for (const i of idx.slice().reverse()) { const w = Math.floor(Date.parse(letters[i]!.date) / WEEK); weeks.set(w, [...(weeks.get(w) ?? []), i]); }
    const byWeek = [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, is]) => is);
    const pts = grow(byWeek.map((is) => is.length), hash(key));
    const stars: Star[] = [], first: number[] = [];
    byWeek.forEach((is, w) => {
      first.push(stars.length);
      is.forEach((i, k) => {
        const o = knot(k), x = pts[w]!.x + o.x, y = pts[w]!.y + o.y;
        // The week's first letter is its star in the figure; the rest gather round.
        const parent = k ? -1 : pts[w]!.parent >= 0 ? first[pts[w]!.parent]! : -1;
        stars.push({ i, parent, az: at.az + (x * D) / Math.cos(at.el + y * D), el: at.el + y * D });
      });
    });
    const label = key === 'moodle' ? 'Moodle' : key === 'others' ? 'the scattered' : short(letters[idx[0]!]!.from) || key;
    return { key, label, az: at.az, el: at.el, stars, unread: idx.filter((i) => letters[i]!.unread).length };
  });
}

// ---- the demo's inbox: a term's worth, so the sky is full ----------------
const SENDERS: [string, string, number, string[]][] = [
  ['Moodle: Analysis 1', 'noreply@moodle.univie.ac.at', 30, ['Neue Ankündigung: Serie {n} ist online', 'Forum: Antwort auf „Aufgabe {n}b“', 'Abgabe erinnert: Serie {n}']],
  ['Moodle: Physikalische Rechenmethoden', 'noreply@moodle.univie.ac.at', 22, ['Forum: Frage zu Blatt {n}', 'Neue Datei: Skript Kapitel {n}']],
  ['Studienservicecenter Physik', 'ssc.physik@univie.ac.at', 10, ['Gruppeneinteilung UE: bitte prüfen', 'Hinweis zur Anmeldephase', 'Raumänderung am {n}. Oktober']],
  ['u:space', 'noreply@univie.ac.at', 8, ['Prüfungsanmeldung geöffnet', 'Ihre Anmeldung wurde bestätigt']],
  ['Studienprogrammleitung Physik', 'spl.physik@univie.ac.at', 6, ['Orientierung: Folien und ein Nachtrag', 'Sprechstunde verlegt']],
  ['Universitätsbibliothek Wien', 'ub@univie.ac.at', 7, ['Ihre Vormerkung ist abholbereit', 'Leihfrist endet in 3 Tagen']],
  ['ÖH Uni Wien', 'info@oeh.univie.ac.at', 6, ['Erstsemestrigen-Fest am Donnerstag', 'Newsletter Oktober']],
  ['Fakultät für Physik', 'dekanat.physik@univie.ac.at', 4, ['Kolloquium: Quantenoptik am Mittwoch']],
  ['ZID Universität Wien', 'zid@univie.ac.at', 4, ['Wartungsarbeiten am Wochenende', 'Ihr Passwort läuft bald ab']],
  ['Sportinstitut USI', 'usi@univie.ac.at', 3, ['Kursanmeldung ab Montag']],
  ['Mentoring Physik', 'mentoring.physik@univie.ac.at', 3, ['Treffen der Mentoringgruppe']],
  ['Lena Hofer', 'lena.hofer@univie.ac.at', 2, ['Lerngruppe Analysis?']],
  ['Jonas Weber', 'jonas.weber@univie.ac.at', 2, ['Mitschrift von Dienstag']],
  ['Career Center', 'career@univie.ac.at', 1, ['Jobmesse im Hauptgebäude']],
];

export function samplePost(): { mail: MailDto; bodies: Map<number, string> } {
  const r = rng(2026);
  const now = Date.now(), letters: LetterDto[] = [], bodies = new Map<number, string>();
  let uid = 1000;
  for (const [from, addr, n, subjects] of SENDERS) {
    for (let k = 0; k < n; k++) {
      const age = r() * 80 * 86400e3;
      const subject = subjects[k % subjects.length]!.replace('{n}', String(1 + Math.floor(r() * 9)));
      letters.push({ uid: ++uid, from, addr, subject, date: new Date(now - age).toISOString(), unread: age < 6 * 86400e3 || r() < 0.08 });
      bodies.set(uid, `Liebe Studierende,\n\n${subject}. Dies ist ein Beispiel im Stil der Universität Wien; im Demo gibt es keine echte Post.\n\nMit freundlichen Grüßen,\n${from}`);
    }
  }
  letters.sort((a, b) => b.date.localeCompare(a.date));
  return { mail: { configured: true, unread: letters.filter((l) => l.unread).length, total: letters.length, checkedAt: new Date().toISOString(), error: null, letters }, bodies };
}

export function sampleOpened(mail: MailDto, bodies: Map<number, string>, uid: number): OpenedDto | null {
  const l = mail.letters.find((x) => x.uid === uid);
  if (!l) return null;
  if (l.unread) { l.unread = false; mail.unread--; }
  return { ...l, to: 'a12630524@unet.univie.ac.at', text: bodies.get(uid) ?? '', attachments: [] };
}
