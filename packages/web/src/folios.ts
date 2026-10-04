// The folios (docs/superpowers/specs/2026-10-04-folios-design.md): a
// course's PDFs and decks, and how the Exploded Codex lays one out: a tome
// is a Skript (its chapters the slabs) or, for everything else in the
// course, a binder (each file a slab); what hangs off a slab is whatever in
// the module shares a word with its title.
import type { Chapter, DeckDto, FolioDto, FolioKind, FoliosDto } from '@aura/shared';
import type { Course } from './store';

export type Folios = FoliosDto & { syncing: boolean; error: string | null };
export type Plate = { name: string; note: string; ch: number; kind: 'pdf' | 'deck'; isNew: boolean; folio?: FolioDto; deck?: DeckDto };
export type Tome = { key: string; title: string; meta: string; chapters: Chapter[]; files: (FolioDto | null)[]; plates: Plate[]; loose: Plate[]; folio: FolioDto | null };

export const KIND_LABEL: Record<FolioKind, string> = { skript: 'skript', sheet: 'exercise sheet', slides: 'slides', exam: 'past exam', other: 'other' };
const day = 864e5;
export const isNew = (iso: string, now = Date.now()) => now - Date.parse(iso) < day;
export const pdfUrl = (f: FolioDto) => `/api/v1/academy/folios/${f.id}/pdf`;
const mb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} mb` : `${Math.max(1, Math.round(n / 1e3))} kb`);
const dmy = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });

// Words worth matching: four letters or more, umlauts folded, file noise out.
const STOP = new Set(['pdf', 'final', 'skript', 'skriptum', 'kapitel', 'teil', 'zusammenfassung', 'lernmaterial', 'deck', 'deck:']);
export function words(s: string): string[] {
  return s.toLowerCase().replace(/\.pdf$/, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
}
// The chapter a name belongs to: the one sharing the longest start of a
// word, or a whole word ("Winkelfunktionen" finds "Funktionen",
// "Integration" finds "Integralrechnung"); -1 when nothing shares five.
const shared = (a: string, b: string) => {
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) + 2;
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};
export function chapterFor(name: string, chapters: Chapter[]): number {
  let best = -1, score = 4;
  chapters.forEach((c, i) => {
    for (const a of words(name)) for (const b of words(c.title)) if (shared(a, b) > score) { score = shared(a, b); best = i; }
  });
  return best;
}

const deckNote = (d: DeckDto) => {
  const total = d.boxes.reduce((a, n) => a + n, 0), taken = total - d.boxes[0]!;
  const held = d.boxes.slice(1).map((n, i) => (n ? `${n} in box ${i + 1}` : '')).filter(Boolean).join(', ');
  return `${total} cards // ${taken ? held : 'none learned'}`;
};
const folioNote = (f: FolioDto) => `${KIND_LABEL[f.kind]} // ${f.pages} p${f.source === 'upload' ? ' // by hand' : ''}`;
const plateOf = (f: FolioDto, ch: number): Plate => ({ name: f.title, note: folioNote(f), ch, kind: 'pdf', isNew: f.source === 'moodle' && isNew(f.addedAt), folio: f });
const deckPlate = (d: DeckDto, ch: number): Plate => ({ name: `deck: ${d.name}`, note: deckNote(d), ch, kind: 'deck', isNew: false, deck: d });

// The tomes of a course: each Skript its own, then a binder of the rest.
// Plates come from the whole module (the lecture's Skript and its exercise
// class's sheets belong together).
export function tomesOf(all: Folios, nrs: string[], semester: string): Tome[] {
  const here = all.folios.filter((f) => nrs.includes(f.nr) && f.semester === semester);
  const decks = all.decks.filter((d) => nrs.includes(d.nr) && d.semester === semester);
  const skripts = here.filter((f) => f.kind === 'skript').sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const rest = here.filter((f) => f.kind !== 'skript').sort((a, b) => a.kind.localeCompare(b.kind) || a.modifiedAt.localeCompare(b.modifiedAt));
  const hang = (chapters: Chapter[], items: FolioDto[]) => {
    const plates: Plate[] = [], loose: Plate[] = [];
    for (const f of items) { const ch = chapterFor(f.title, chapters); (ch >= 0 ? plates : loose).push(plateOf(f, ch)); }
    for (const d of decks) { const ch = chapterFor(d.name, chapters); (ch >= 0 ? plates : loose).push(deckPlate(d, ch)); }
    return { plates, loose };
  };
  const tomes: Tome[] = skripts.map((s, i) => ({
    key: `f${s.id}`, title: s.title, folio: s, chapters: s.outline, files: s.outline.map(() => null),
    meta: `${s.pages} pages // ${mb(s.size)} // ${s.source === 'moodle' ? 'moodle' : 'by hand'} // ${dmy(s.modifiedAt)}${i ? ' // older edition' : ''}`,
    ...hang(s.outline, i ? [] : rest),
  }));
  if (rest.length) {
    let at = 1;
    const chapters = rest.map((f) => { const c = { title: f.title.replace(/\.pdf$/i, ''), from: at, to: at + f.pages - 1 }; at += f.pages; return c; });
    tomes.push({ key: 'binder', title: skripts.length ? 'Everything else' : 'The binder', folio: null, chapters, files: rest,
      meta: `${rest.length} files // ${at - 1} pages`, ...hang(chapters, []) });
  }
  return tomes;
}

// The courses the codex offers: this term's books, a lecture and its
// exercise class as one (they share a module), and any Moodle course the
// shelf does not have.
export type Shelf = { key: string; label: string; nrs: string[]; semester: string; count: number };
export function shelvesOf(courses: Course[], all: Folios, semester: string): Shelf[] {
  const term = courses.filter((c) => c.semester === semester);
  const byModule = new Map<string, Course[]>();
  for (const c of term) byModule.set(c.module, [...(byModule.get(c.module) ?? []), c]);
  const count = (nrs: string[]) => all.folios.filter((f) => nrs.includes(f.nr) && f.semester === semester).length + all.decks.filter((d) => nrs.includes(d.nr) && d.semester === semester).length;
  const out: Shelf[] = [...byModule.values()].map((cs) => ({ key: cs[0]!.module, label: cs[0]!.name, nrs: cs.map((c) => c.nr), semester, count: count(cs.map((c) => c.nr)) }));
  const known = new Set(term.map((c) => c.nr));
  for (const m of all.moodle.courses) if (m.semester === semester && !known.has(m.nr)) { known.add(m.nr); out.push({ key: m.nr, label: m.name, nrs: [m.nr], semester, count: count([m.nr]) }); }
  for (const f of all.folios) if (f.semester === semester && !known.has(f.nr)) { known.add(f.nr); out.push({ key: f.nr, label: f.title, nrs: [f.nr], semester, count: count([f.nr]) }); }
  return out;
}

// The demo's folios: what Moodle held on 04.10.2026, the Skript's chapters
// invented.
export function sampleFolios(): Folios {
  let id = 1;
  const f = (nr: string, title: string, kind: FolioKind, pages: number, size: number, mod: string, outline?: Chapter[]): FolioDto => ({
    id: id++, nr, semester: '2026W', title, kind, source: 'moodle', section: null, size, pages, outline: outline ?? [{ title: title.replace(/\.pdf$/, ''), from: 1, to: pages }],
    modifiedAt: `${mod}T09:00:00Z`, addedAt: title.startsWith('Zusammenfassung') ? new Date().toISOString() : `${mod}T10:00:00Z`,
  });
  const ch = [['1 Funktionen', 1], ['2 Differentialrechnung', 25], ['3 Integralrechnung', 53], ['4 Reihen und Taylor', 87], ['5 Komplexe Zahlen', 109], ['6 Vektoren', 129], ['7 Matrizen', 151], ['8 Differentialgleichungen', 173], ['9 Vektoranalysis', 199]] as const;
  const outline = ch.map(([title, from], i) => ({ title, from, to: i + 1 < ch.length ? ch[i + 1]![1] - 1 : 217 }));
  return {
    moodle: { bound: true, username: 'demo', boundAt: '2026-10-04T16:00:00Z', syncedAt: new Date().toISOString(), refusedAt: null,
      courses: [{ nr: '261603', semester: '2026W', name: 'Physikalische Rechenmethoden' }, { nr: '261608', semester: '2026W', name: 'Analysis 1' }, { nr: '260162', semester: '2026W', name: 'Experimentalphysik 1' }, { nr: '260040', semester: '2026W', name: 'Orientierung zum Studienstart' }] },
    folios: [
      f('261603', 'Skriptum_2026.pdf', 'skript', 217, 15_849_000, '2026-09-30', outline),
      f('261603', 'Zusammenfassung_Funktionen.pdf', 'slides', 4, 124_900, '2026-09-24'),
      f('261603', 'Lernmaterial_Winkelfunktionen.pdf', 'slides', 3, 78_800, '2026-09-24'),
      f('261608', 'Serie 1.pdf', 'sheet', 2, 145_400, '2026-10-01'),
      f('261608', 'Hinweise zur Prüfungsvorbereitung Analysis 1.pdf', 'exam', 2, 35_800, '2026-09-17'),
      f('261608', 'Erwartunghorizont.pdf', 'exam', 2, 47_100, '2026-09-17'),
      f('261608', 'AnaPhysITermin1.pdf', 'exam', 3, 235_500, '2026-09-17'),
      f('261608', 'AnaPhysITermin2.pdf', 'exam', 3, 242_700, '2026-09-17'),
      f('261608', 'AnaPhysITermin3.pdf', 'exam', 3, 246_800, '2026-09-17'),
      f('260162', 'termine_uebungen_2026W.pdf', 'other', 1, 40_900, '2026-09-17'),
      f('260162', 'gruppen_LVL_Seniors_UE_EI_2026W.pdf', 'other', 2, 51_200, '2026-09-22'),
    ],
    decks: [
      { id: 1, nr: '261603', semester: '2026W', name: 'Funktionen', cmid: 20015918, boxes: [20, 0, 0, 0, 0, 0], syncedAt: '2026-10-04T16:00:00Z' },
      { id: 2, nr: '261603', semester: '2026W', name: 'Differentialrechnung', cmid: 20015916, boxes: [11, 5, 4, 0, 0, 0], syncedAt: '2026-10-04T16:00:00Z' },
      { id: 3, nr: '261603', semester: '2026W', name: 'Integration', cmid: 20015910, boxes: [9, 5, 6, 0, 0, 0], syncedAt: '2026-10-04T16:00:00Z' },
    ],
    syncing: false, error: null,
  };
}
