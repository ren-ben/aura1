// A question put to a course's folios, and the hint ladder on an exercise
// sheet: the pages are routed and cut as for a map, and Kael'thos answers
// from them, citing the pages he used.
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { RUNGS, type TaskDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { asks, folioFiles, folios } from '../db/schema.ts';
import type { Fetch, Settings } from './openrouter.ts';
import { asJson } from './maps.ts';
import { VOICE } from './prompts.ts';
import { clip, excerpt, legend, moduleNrs, route, MAX_PAGES } from './retrieve.ts';

type Row = typeof asks.$inferSelect;
export const askDto = ({ createdAt, ...a }: Row) => ({ ...a, createdAt: createdAt.toISOString() });

// The tasks of a sheet, from its text: "Aufgabe 3", "Beispiel 3", "Problem 3"
// or "Exercise 3" at the start of a line; the whole sheet as one task when
// it names none.
export function tasksOf(texts: string[]): TaskDto[] {
  const found = new Map<number, TaskDto>();
  texts.forEach((t, i) => {
    for (const m of t.matchAll(/(?:^|\n)\s*(?:Aufgabe|Beispiel|Problem|Exercise|Task)\s*(\d{1,2})[.:)]?\s*([^\n]{0,90})/gi)) {
      const n = Number(m[1]);
      if (!found.has(n)) found.set(n, { n, title: m[2]!.trim().replace(/\s+/g, ' '), page: i + 1 });
    }
  });
  return found.size ? [...found.values()].sort((a, b) => a.n - b.n) : [{ n: 0, title: 'the whole sheet', page: 1 }];
}

const answerSchema = z.object({
  answer: z.string().min(1).max(6000),
  cites: z.array(z.object({ folio: z.number().int(), page: z.number().int() })).max(12),
});

const FORMAT = `Return JSON: {"answer": "...", "cites": [{"folio": id, "page": n}]}.
The answer is plain text in short paragraphs separated by a blank line; inline maths as $...$, a displayed equation alone on its line as $$...$$. No headings, no markdown lists, no bold.
cites are the pages you actually used, as the folio id and the page number in the original file (the excerpt's legend tells you how its pages map).`;

const askSystem = `${VOICE}

The student asks you something about their course. Pages of their own course files are attached: answer from them first, in their notation, and say which page shows what. If the pages do not cover it, say so and answer from what you know. Answer in the language of the question. Be brief: what they need, no more.
${FORMAT}`;

const RUNG_TELL = [
  'Rung 1, where it stands: name the idea, theorem or method the task needs, and point to the exact pages of the Skript (or slides) where it is explained. Do not start the task. No steps, no computation.',
  'Rung 2, a nudge: say how to approach the task: what to look at, what to set up, which form to bring it into. Still no computation and no result.',
  'Rung 3, the next step: write out only the first concrete step of the solution (or the next one after the approach), with its maths, and stop there.',
  'Rung 4, show me: the full worked solution, every step with its reason, then the result and a one-line check that it is right.',
];
const hintSystem = (rung: number) => `${VOICE}

The student is working an exercise sheet of their course and asks for help with one task, one rung at a time, so they still solve it themselves and can present it at the board. The sheet's page and pages of their Skript are attached. Write in German, as "du".
${RUNG_TELL[rung - 1]}
Never give away more than this rung allows.
${FORMAT}`;

// Answers a row after the request: pages routed (for a hint, the task's own
// page first), cut, and sent along with the question.
export async function answer(db: Db, fetch: Fetch, settings: Settings, id: number): Promise<void> {
  const set = (v: Partial<Row>) => db.update(asks).set(v).where(eq(asks.id, id));
  try {
    const [row] = await db.select().from(asks).where(eq(asks.id, id));
    if (!row) return;
    const nrs = await moduleNrs(db, row.nr, row.semester);
    let { pages, costUsd } = row;
    let need = row.question, task = '';
    if (row.kind === 'hint') {
      const [sheet] = await db.select({ title: folios.title, pages: folios.pages, texts: folioFiles.texts }).from(folios).innerJoin(folioFiles, eq(folioFiles.folioId, folios.id)).where(eq(folios.id, row.folioId!));
      if (!sheet) throw new Error('the sheet is gone');
      const t = tasksOf(sheet.texts).find((x) => x.n === row.task) ?? { n: 0, title: '', page: 1 };
      task = sheet.texts.slice(t.page - 1, t.page + 1).join('\n').slice(0, 3000);
      need = `${sheet.title}, task ${t.n || 'all'}: ${t.title}\n${task.slice(0, 600)}`;
      // A later rung reads the pages the first one was given.
      if (!pages.length) {
        const [first] = await db.select({ pages: asks.pages }).from(asks)
          .where(and(eq(asks.folioId, row.folioId!), eq(asks.task, row.task!), eq(asks.status, 'ready'), sql`${asks.rung} < ${row.rung}`)).limit(1);
        pages = first?.pages ?? [];
      }
      if (!pages.length) {
        const routed = await route(db, fetch, settings, nrs, row.semester, need, MAX_PAGES - 2);
        costUsd += routed.costUsd;
        const own = { folio: row.folioId!, from: t.page, to: Math.min(sheet.pages, t.page + 1) };
        pages = clip([own, ...routed.cuts.map((c) => ({ folio: c.folioId, from: c.from, to: c.to }))], new Map([[row.folioId!, sheet], ...routed.cuts.map((c) => [c.folioId, { title: c.title, pages: c.to }] as const)]), MAX_PAGES);
      }
    } else if (!pages.length) {
      const routed = await route(db, fetch, settings, nrs, row.semester, need);
      pages = routed.cuts; costUsd += routed.costUsd;
    }
    await set({ pages, costUsd });
    // Earlier rungs of the same task, so a rung builds on what was said.
    const before = row.kind === 'hint' ? await db.select({ rung: asks.rung, answer: asks.answer }).from(asks)
      .where(and(eq(asks.folioId, row.folioId!), eq(asks.task, row.task!), eq(asks.status, 'ready'), sql`${asks.rung} < ${row.rung}`)) : [];
    const user = row.kind === 'hint'
      ? `The task (from the sheet's text):\n${task}\n\n${before.map((b) => `What rung ${b.rung} already said:\n${b.answer}`).join('\n\n')}\n\nAttached:\n${legend(pages)}\n\nNow rung ${row.rung}: ${RUNGS[row.rung! - 1]}.`
      : `Question: ${row.question}\n\nAttached:\n${legend(pages)}`;
    const written = await asJson(fetch, settings, answerSchema, 'answer',
      [{ role: 'system', content: row.kind === 'hint' ? hintSystem(row.rung!) : askSystem }, { role: 'user', content: user }], 4000, await excerpt(db, pages));
    const titles = new Map(pages.map((p) => [p.folioId, p.title]));
    const cites = written.value.cites.filter((c) => titles.has(c.folio)).map((c) => ({ folioId: c.folio, title: titles.get(c.folio)!, page: c.page }));
    await set({ status: 'ready', answer: written.value.answer, cites, costUsd: costUsd + written.cost });
  } catch (e) {
    await set({ status: 'failed', error: e instanceof Error ? e.message : 'failed' });
  }
}

// A question cut off by a restart is let go after ten minutes.
export async function settleAsks(db: Db, now = new Date()) {
  await db.update(asks).set({ status: 'failed', error: 'interrupted; ask again' })
    .where(and(eq(asks.status, 'thinking'), sql`${asks.createdAt} < ${new Date(now.getTime() - 10 * 60_000)}`));
}
