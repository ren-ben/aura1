// Bachelor Physik at the University of Vienna, curriculum version 2026:
// every module with its ECTS, its group and the semester the curriculum's
// appendix recommends it in.
export type CurriculumModule = { code: string; name: string; ects: number; sem: number; group: string };

export const CURRICULUM: CurriculumModule[] = [
  { code: 'STEOP1', name: 'Experimentalphysik 1', ects: 8, sem: 1, group: 'StEOP' },
  { code: 'STEOP2', name: 'Physikalische Rechenmethoden', ects: 8, sem: 1, group: 'StEOP' },
  { code: 'STEOP3', name: 'Forschung und Studium', ects: 2, sem: 1, group: 'StEOP' },
  { code: 'LA1', name: 'Lineare Algebra 1', ects: 4, sem: 1, group: 'Mathematik' },
  { code: 'ANA1', name: 'Analysis 1', ects: 8, sem: 1, group: 'Mathematik' },
  { code: 'EP2', name: 'Experimentalphysik 2', ects: 8, sem: 2, group: 'Experimentalphysik' },
  { code: 'TP1', name: 'Klassische Mechanik', ects: 8, sem: 2, group: 'Theoretische Physik' },
  { code: 'LA2', name: 'Lineare Algebra 2', ects: 4, sem: 2, group: 'Mathematik' },
  { code: 'ANA2', name: 'Analysis 2', ects: 8, sem: 2, group: 'Mathematik' },
  { code: 'GEA', name: 'Experimentelles Arbeiten', ects: 2, sem: 2, group: 'Labor' },
  { code: 'LP1', name: 'Laborpraktikum 1', ects: 5, sem: 3, group: 'Labor' },
  { code: 'TP2', name: 'Elektrodynamik', ects: 8, sem: 3, group: 'Theoretische Physik' },
  { code: 'ANA3', name: 'Analysis 3', ects: 8, sem: 3, group: 'Mathematik' },
  { code: 'PROG', name: 'Programmierung', ects: 6, sem: 3, group: 'Programmierung' },
  { code: 'WST', name: 'Wahrscheinlichkeit & Statistik', ects: 4, sem: 3, group: 'Mathematik' },
  { code: 'EP3', name: 'Quantenoptik, Atom, Kern', ects: 8, sem: 4, group: 'Experimentalphysik' },
  { code: 'TP3', name: 'Quantenmechanik 1', ects: 8, sem: 4, group: 'Theoretische Physik' },
  { code: 'LP2', name: 'Laborpraktikum 2', ects: 8, sem: 4, group: 'Labor' },
  { code: 'SCDS', name: 'Scientific Computing', ects: 6, sem: 4, group: 'Programmierung' },
  { code: 'EP4', name: 'Kondensierte Materie', ects: 8, sem: 5, group: 'Experimentalphysik' },
  { code: 'TP4', name: 'Statistische Mechanik', ects: 8, sem: 5, group: 'Theoretische Physik' },
  { code: 'WFach', name: 'Wahl-Fachbereiche', ects: 7, sem: 5, group: 'Wahl' },
  { code: 'EXT', name: 'Erweiterung', ects: 15, sem: 5, group: 'Erweiterung' },
  { code: 'TP5', name: 'Quantenmechanik 2', ects: 7, sem: 6, group: 'Theoretische Physik' },
  { code: 'WLab', name: 'Wahl-Laborpraktikum', ects: 6, sem: 6, group: 'Labor' },
  { code: 'BAPR', name: 'Bachelorprojekt', ects: 8, sem: 6, group: 'Bachelorprojekt' },
];

// The first term's courses in 2026W, from u:find: offered as one click.
// The groups are the ones registered in u:space, picked for a course when
// it is added or asked again with none chosen.
export const FIRST_TERM = {
  semester: '2026W',
  courses: ['261600', '260162', '261603', '261604', '260041', '260022', '261608', '261609'],
  groups: { 260162: '260162-5', 261604: '261604-10', 260022: '260022-3', 261609: '261609-7' } as Record<string, string>,
};

// What a date of a course is: a VU's lecture part is marked lecture, its
// group's own dates are the exercise part; any other course is all its type.
export const partOf = (type: string, e: { lecture?: boolean }) => (e.lecture === undefined ? type : e.lecture ? 'VO' : 'UE');

// Which module a u:find course counts toward, from the codes it lists
// (u:find writes "LA" for Lineare Algebra 1, and so on). EXT when unknown:
// anything can count as Erweiterung.
export function guessModule(codes: string[], name: string): string {
  const known = new Set(CURRICULUM.map((m) => m.code.toUpperCase()));
  for (const c of codes) if (known.has(c.toUpperCase())) return CURRICULUM.find((m) => m.code.toUpperCase() === c.toUpperCase())!.code;
  const byName = CURRICULUM.find((m) => name.toLowerCase().includes(m.name.toLowerCase()));
  return byName?.code ?? 'EXT';
}

// The folios: a course's PDFs, from Moodle or dropped in by hand
// (docs/superpowers/specs/2026-10-04-folios-design.md).
export const FOLIO_KINDS = ['skript', 'sheet', 'slides', 'exam', 'other'] as const;
export type FolioKind = (typeof FOLIO_KINDS)[number];
export type Chapter = { title: string; from: number; to: number };
export type FolioDto = {
  id: number; nr: string; semester: string; title: string; kind: FolioKind; source: 'moodle' | 'upload';
  section: string | null; size: number; pages: number; outline: Chapter[]; modifiedAt: string; addedAt: string;
};
// A Moodle flashcard activity and where its cards stand: boxes[0] is the
// pool not yet taken into the deck, boxes[1..5] the deck's five boxes.
export type DeckDto = { id: number; nr: string; semester: string; name: string; cmid: number; boxes: number[]; syncedAt: string };
export type MoodleDto = {
  bound: boolean; username: string | null; boundAt: string | null; syncedAt: string | null;
  refusedAt: string | null; courses: { nr: string; semester: string; name: string }[];
};
export type FoliosDto = { moodle: MoodleDto; folios: FolioDto[]; decks: DeckDto[] };

// What a file is, from its name and the Moodle section it sits in.
export function guessKind(title: string, section = ''): FolioKind {
  const t = `${title} ${section}`.toLowerCase();
  if (/skript/.test(t)) return 'skript';
  if (/prüfung|pruefung|klausur|termin\d|exam|erwartung/.test(t)) return 'exam';
  if (/serie|blatt|übung|uebung|aufgabe|exercise|sheet|zettel/.test(t)) return 'sheet';
  if (/folie|slide|foliensatz|kapitel|vorlesung/.test(t)) return 'slides';
  return 'other';
}

// Phase 2: pages of the folios behind a map, an answer or a hint
// (docs/superpowers/specs/2026-10-04-rag-design.md).
export type PageCut = { folioId: number; title: string; from: number; to: number };
export type Cite = { folioId: number; title: string; page: number };
// The hint ladder: where it is in the Skript, a nudge, the next step, and
// the worked solution, each only after the one before.
export const RUNGS = ['where it stands', 'a nudge', 'the next step', 'show me'] as const;
export type AskDto = {
  id: number; nr: string; semester: string; kind: 'ask' | 'hint'; question: string;
  folioId: number | null; task: number | null; rung: number | null;
  status: 'thinking' | 'ready' | 'failed'; answer: string | null; error: string | null;
  cites: Cite[]; pages: PageCut[]; costUsd: number; createdAt: string;
};
export type TaskDto = { n: number; title: string; page: number };

// Phase 3: a card of a Moodle deck. front and back are Moodle's HTML, maths
// as \( \). box 0 is the pool; 1 to 5 the Leitner boxes.
export type CardDto = { id: number; deckId: number; qid: number; name: string; front: string; back: string; box: number; pending: number; answeredAt: string | null };
export const BOXES = ['Pool', 'Anfangen', 'Wiederholen', 'Einprägen', 'Beinahe', 'Geschafft'] as const;
