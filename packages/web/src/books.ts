// Reading a book out of whatever file it arrived as. All of this happens in
// the browser: the server is never given an epub or a pdf, only chapters of
// plain text, which is the only thing either the console or the device can
// read anyway.
import { unzipSync, strFromU8 } from 'fflate';

export type Parsed = {
  title: string;
  author: string | null;
  format: 'epub' | 'pdf' | 'text';
  chapters: { title: string; body: string }[];
  // Something worth saying about how it was read, if there is anything.
  note?: string;
};

// Marked-up text, as text: tags out, entities back, paragraphs kept.
function plain(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  doc.querySelectorAll('script, style, nav, header, footer').forEach((el) => el.remove());
  const out: string[] = [];
  doc.body?.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, div').forEach((el) => {
    // Only the ones that hold text themselves, or every level would repeat.
    if (el.querySelector('p, h1, h2, h3, h4, li, blockquote')) return;
    const line = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (line) out.push(line);
  });
  if (!out.length) {
    const all = (doc.body?.textContent ?? '').replace(/[ \t]+/g, ' ').trim();
    if (all) out.push(all);
  }
  return out.join('\n\n');
}

const headingOf = (markup: string): string => {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const h = doc.querySelector('h1, h2, h3, title');
  return (h?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
};

// An epub is a zip: a container pointing at a package, a package listing the
// spine, and the spine listing the documents in the order they are read.
async function parseEpub(file: File): Promise<Parsed> {
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const text = (path: string) => (zip[path] ? strFromU8(zip[path]!) : '');
  const xml = (body: string) => new DOMParser().parseFromString(body, 'application/xml');

  const container = xml(text('META-INF/container.xml'));
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path') ?? 'content.opf';
  const root = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = xml(text(opfPath));

  const title = opf.querySelector('metadata > title, title')?.textContent?.trim() || file.name.replace(/\.epub$/i, '');
  const author = opf.querySelector('metadata > creator, creator')?.textContent?.trim() || null;

  const href = new Map<string, string>();
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id'), h = item.getAttribute('href');
    if (id && h) href.set(id, root + h.replace(/^\.\//, ''));
  });

  // The names the book gives its own chapters, where it bothers to.
  const named = new Map<string, string>();
  for (const path of Object.keys(zip)) {
    if (!/\.(ncx|xhtml|html)$/i.test(path) || !/toc|nav|contents/i.test(path)) continue;
    const doc = xml(text(path));
    doc.querySelectorAll('navPoint, li > a, a').forEach((node) => {
      const src = node.getAttribute?.('src') ?? node.querySelector?.('content')?.getAttribute('src')
        ?? node.getAttribute?.('href');
      const label = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (src && label) named.set(root + src.split('#')[0]!.replace(/^\.\//, ''), label.slice(0, 120));
    });
  }

  const chapters: Parsed['chapters'] = [];
  opf.querySelectorAll('spine > itemref').forEach((ref) => {
    const path = href.get(ref.getAttribute('idref') ?? '');
    if (!path || !zip[path]) return;
    const markup = text(path);
    const body = plain(markup);
    // Covers, title pages and empty front matter are not chapters.
    if (body.length < 400) return;
    chapters.push({ title: named.get(path) || headingOf(markup) || `Part ${chapters.length + 1}`, body });
  });

  return { title, author, format: 'epub', chapters };
}

// A pdf has no chapters, only pages. Its own bookmarks are the best guide
// there is; without them, the pages are gathered into readable stretches.
async function parsePdf(file: File): Promise<Parsed> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as { Title?: string; Author?: string };

  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let line = '', out = '';
    let lastY: number | null = null;
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = Math.round(item.transform[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        // A new line: joined to the last if the last one was hyphenated.
        out += out && /-$/.test(line.trim()) ? line.trim().slice(0, -1) : `${line.trim()} `;
        if (Math.abs(y - lastY) > 18) out += '\n\n';
        line = '';
      }
      line += item.str;
      lastY = y;
    }
    out += line.trim();
    pages.push(out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
  }

  // A scan is a stack of photographs with no text in it at all. Say so,
  // rather than keeping a book of empty chapters.
  const letters = pages.join('').replace(/\s/g, '').length;
  if (letters < Math.max(400, pages.length * 40)) {
    throw new Error(
      `This pdf has no text in it - ${doc.numPages} page${doc.numPages === 1 ? '' : 's'} of pictures, most likely a scan. `
      + 'He reads words, not photographs. Run it through OCR first, or give him the epub.',
    );
  }

  const outline = await doc.getOutline().catch(() => null);
  const chapters: Parsed['chapters'] = [];
  if (outline?.length) {
    const starts: { title: string; page: number }[] = [];
    for (const entry of outline) {
      try {
        const dest = typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
        const ref = dest?.[0];
        const page = ref && typeof ref === 'object' ? await doc.getPageIndex(ref) : null;
        if (page !== null) starts.push({ title: (entry.title ?? '').trim().slice(0, 120), page });
      } catch { /* a bookmark that points nowhere */ }
    }
    starts.sort((a, b) => a.page - b.page);
    starts.forEach((s, i) => {
      const body = pages.slice(s.page, starts[i + 1]?.page ?? pages.length).join('\n\n').trim();
      if (body.length > 200) chapters.push({ title: s.title || `Part ${chapters.length + 1}`, body });
    });
  }
  if (!chapters.length) {
    const PER = 10;
    for (let i = 0; i < pages.length; i += PER) {
      const body = pages.slice(i, i + PER).join('\n\n').trim();
      if (body) chapters.push({ title: `Pages ${i + 1}-${Math.min(pages.length, i + PER)}`, body });
    }
  }

  return {
    title: info.Title?.trim() || file.name.replace(/\.pdf$/i, ''),
    author: info.Author?.trim() || null,
    format: 'pdf',
    chapters,
    note: outline?.length ? undefined : 'That pdf carries no contents page, so it is cut into stretches of ten pages.',
  };
}

// Plain text, cut where it announces a chapter, or into even stretches.
function parseText(name: string, body: string): Parsed {
  const clean = body.replace(/\r\n/g, '\n').trim();
  const heading = /^\s*(chapter|part|book)\s+[\divxlc]+.*$/gim;
  const cuts: number[] = [];
  for (const m of clean.matchAll(heading)) if (m.index !== undefined) cuts.push(m.index);

  const chapters: Parsed['chapters'] = [];
  if (cuts.length > 1) {
    cuts.forEach((at, i) => {
      const part = clean.slice(at, cuts[i + 1] ?? clean.length).trim();
      const [first, ...rest] = part.split('\n');
      chapters.push({ title: (first ?? '').trim().slice(0, 120), body: rest.join('\n').trim() || part });
    });
  } else {
    const SIZE = 14_000;
    for (let i = 0; i < clean.length; i += SIZE) {
      chapters.push({ title: `Part ${chapters.length + 1}`, body: clean.slice(i, i + SIZE) });
    }
  }
  return { title: name.replace(/\.(txt|md)$/i, ''), author: null, format: 'text', chapters };
}

export async function readBook(file: File): Promise<Parsed> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.epub')) return parseEpub(file);
  if (name.endsWith('.pdf')) return parsePdf(file);
  if (name.endsWith('.txt') || name.endsWith('.md')) return parseText(file.name, await file.text());
  throw new Error('He reads epub, pdf and plain text. Nothing else, yet.');
}
