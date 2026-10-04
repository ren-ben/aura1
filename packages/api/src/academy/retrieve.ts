// Finding the pages a question needs, without a vector store: the course's
// folios as a catalogue (each Skript by its chapters), the pages whose words
// match best, and a fast model choosing from both. The chosen pages are cut
// out of the PDFs and sent as PDFs, so the writer sees the equations and
// figures as printed. docs/superpowers/specs/2026-10-04-rag-design.md
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import type { Db } from '../db/client.ts';
import { courses, folioFiles, folios } from '../db/schema.ts';
import { complete, type Fetch, type Pdf, type Settings } from './openrouter.ts';

export type Cut = { folioId: number; title: string; from: number; to: number };
export const MAX_PAGES = 14;

// The u:find numbers that share a module with this one: a lecture's Skript
// serves its exercise class, and the other way round.
export async function moduleNrs(db: Db, nr: string, semester: string): Promise<string[]> {
  const [c] = await db.select({ module: courses.module }).from(courses).where(and(eq(courses.nr, nr), eq(courses.semester, semester)));
  if (!c) return [nr];
  const all = await db.select({ nr: courses.nr }).from(courses).where(and(eq(courses.module, c.module), eq(courses.semester, semester)));
  return [...new Set([nr, ...all.map((x) => x.nr)])];
}

const fold = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const terms = (s: string) => [...new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4))];

// The pages sharing the most words with the question, a word's first five
// letters enough to count ("Integrals" finds "Integral").
export function lexical(pages: { folioId: number; page: number; text: string }[], need: string, n = 12) {
  const want = terms(need).map((w) => w.slice(0, 5));
  if (!want.length) return [];
  return pages.map((p) => {
    const t = fold(p.text);
    return { ...p, score: want.reduce((a, w) => a + Math.min(4, t.split(w).length - 1), 0) };
  }).filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
}

const routeSchema = z.object({ picks: z.array(z.object({ folio: z.number().int(), from: z.number().int(), to: z.number().int() })) });

// The pages for a need, at most MAX_PAGES of them, chosen by the research
// model from the catalogue and the best word matches; those matches alone
// when it does not answer.
export async function route(db: Db, fetch: Fetch, settings: Settings, nrs: string[], semester: string, need: string, max = MAX_PAGES): Promise<{ cuts: Cut[]; costUsd: number }> {
  const rows = await db.select({ id: folios.id, title: folios.title, kind: folios.kind, pages: folios.pages, outline: folios.outline, texts: folioFiles.texts })
    .from(folios).innerJoin(folioFiles, eq(folioFiles.folioId, folios.id)).where(and(inArray(folios.nr, nrs), eq(folios.semester, semester)));
  if (!rows.length) return { cuts: [], costUsd: 0 };
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hits = lexical(rows.flatMap((r) => r.texts.map((text, i) => ({ folioId: r.id, page: i + 1, text }))), need);
  const catalogue = rows.map((r) => `[${r.id}] ${r.title} (${r.kind}, ${r.pages} pages)${r.outline.length > 1 ? `\n${r.outline.map((c) => `   ${c.title}: p ${c.from}-${c.to}`).join('\n')}` : ''}`).join('\n');
  const matches = hits.map((h) => `[${h.folioId}] p ${h.page}: ${h.text.replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
  let picks: { folio: number; from: number; to: number }[] = [];
  let costUsd = 0;
  try {
    const reply = await complete(fetch, settings, {
      model: settings.research, maxTokens: 800,
      schema: { name: 'pages', schema: z.toJSONSchema(routeSchema) },
      messages: [
        { role: 'system', content: `You choose the pages of a student's course files that a tutor needs to answer them. At most ${max} pages in all, as a few ranges. Prefer the Skript's chapter on the topic, its definitions and worked examples; take an exercise sheet or past exam only when the need is about one. Answer only JSON: {"picks":[{"folio":id,"from":page,"to":page}]}.` },
        { role: 'user', content: `Need: ${need}\n\nThe files:\n${catalogue}\n\nPages whose words match best:\n${matches || '(none)'}` },
      ],
    });
    costUsd = reply.costUsd;
    picks = routeSchema.parse(JSON.parse(reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))).picks;
  } catch {
    picks = hits.slice(0, 5).map((h) => ({ folio: h.folioId, from: Math.max(1, h.page - 1), to: h.page + 1 }));
  }
  return { cuts: clip(picks, byId, max), costUsd };
}

// Picks made whole: known files, pages in range, overlapping ranges of a
// file merged, and the total held to max.
export function clip(picks: { folio: number; from: number; to: number }[], files: Map<number, { title: string; pages: number }>, max: number): Cut[] {
  const ranges = picks.flatMap((p) => {
    const f = files.get(p.folio);
    const from = Math.max(1, Math.min(p.from, p.to)), to = Math.min(f?.pages ?? 0, Math.max(p.from, p.to));
    return f && from <= to ? [{ folioId: p.folio, title: f.title, from, to }] : [];
  }).sort((a, b) => a.folioId - b.folioId || a.from - b.from);
  const merged: Cut[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && last.folioId === r.folioId && r.from <= last.to + 1) last.to = Math.max(last.to, r.to); else merged.push({ ...r });
  }
  let left = max;
  return merged.flatMap((c) => {
    if (left <= 0) return [];
    const to = Math.min(c.to, c.from + left - 1);
    left -= to - c.from + 1;
    return [{ ...c, to }];
  });
}

// The cut pages as small PDFs, one a range, named so the model can cite them.
export async function excerpt(db: Db, cuts: Cut[]): Promise<Pdf[]> {
  const out: Pdf[] = [];
  for (const c of cuts) {
    const [row] = await db.select({ pdf: folioFiles.pdf }).from(folioFiles).where(eq(folioFiles.folioId, c.folioId));
    if (!row) continue;
    const src = await PDFDocument.load(row.pdf, { ignoreEncryption: true });
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from - 1 + i));
    pages.forEach((p) => doc.addPage(p));
    out.push({ name: `folio-${c.folioId}_p${c.from}-${c.to}.pdf`, base64: Buffer.from(await doc.save()).toString('base64') });
  }
  return out;
}

// What the writer is told about the PDFs it was given.
export const legend = (cuts: Cut[]) => cuts.map((c) => `folio-${c.folioId}_p${c.from}-${c.to}.pdf: ${c.title}, its pages ${c.from} to ${c.to} (folio ${c.folioId}; page 1 of the excerpt is page ${c.from})`).join('\n');
