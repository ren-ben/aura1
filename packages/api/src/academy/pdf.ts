// A PDF read once, when it arrives: how many pages, its chapters from the
// top level of its bookmarks, and the text of every page (for phase 2 to
// route a question to the right pages).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Chapter } from '@aura/shared';

// pdf.js wants Promise.withResolvers: Node 22 (the image) has it, Node 20 does not.
const P = Promise as unknown as { withResolvers?: () => unknown };
P.withResolvers ??= () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

export async function readPdf(bytes: Uint8Array, title: string): Promise<{ pages: number; outline: Chapter[]; texts: string[] }> {
  // pdf.js takes the buffer over; it gets a copy.
  const task = getDocument({ data: bytes.slice(), useSystemFonts: false });
  const doc = await task.promise;
  try {
    const pages = doc.numPages;
    const texts: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      texts.push(content.items.map((t) => ('str' in t ? t.str + (t.hasEOL ? '\n' : '') : '')).join('').replace(/[ \t]+/g, ' ').trim());
    }
    const starts: { title: string; from: number }[] = [];
    for (const item of (await doc.getOutline()) ?? []) {
      try {
        const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
        if (!dest?.[0]) continue;
        const from = (typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])) + 1;
        if (item.title.trim()) starts.push({ title: item.title.trim(), from });
      } catch { /* a bookmark pointing nowhere is left out */ }
    }
    return { pages, outline: chaptersOf(starts, pages, title), texts };
  } finally {
    await task.destroy();
  }
}

// Bookmarks into chapters: in page order, each running to the page before
// the next. Pages before the first bookmark (a title page, the contents)
// join the first chapter. No bookmarks: one chapter, the whole file.
export function chaptersOf(starts: { title: string; from: number }[], pages: number, title: string): Chapter[] {
  const sorted = starts.filter((s) => s.from >= 1 && s.from <= pages).sort((a, b) => a.from - b.from)
    .filter((s, i, all) => i === 0 || s.from > all[i - 1]!.from);
  if (!sorted.length) return [{ title: title.replace(/\.pdf$/i, ''), from: 1, to: pages }];
  return sorted.map((s, i) => ({ title: s.title, from: i === 0 ? 1 : s.from, to: i + 1 < sorted.length ? sorted[i + 1]!.from - 1 : pages }));
}
