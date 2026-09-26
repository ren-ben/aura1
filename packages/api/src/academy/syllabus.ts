// What a course covers, from u:find, and the topic a given lecture of it most
// likely has.

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m);

// The course's description as plain text, lines kept: u:find escapes its own
// HTML inside the XML, so it is decoded twice over, then the tags dropped.
export function parseSyllabus(xml: string): string {
  const raw = xml.match(/<comment xml:lang="de">([\s\S]*?)<\/comment>/)?.[1]
    ?? xml.match(/<comment xml:lang="en">([\s\S]*?)<\/comment>/)?.[1] ?? '';
  return decode(decode(raw))
    .replace(/<(br|p|li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .slice(0, 4000);
}

// The syllabus as an ordered list of topics: its numbered or bulleted lines
// if it has them, else the list after "Inhalte:" or "contents:", up to the
// next heading ("Methode:"), split on commas outside brackets.
export function topicsOf(syllabus: string): string[] {
  const lines = syllabus.split('\n');
  const listed = lines.map((l) => l.match(/^\s*(?:\d+[.)]|[-•*·])\s*(.+)$/)?.[1]?.trim()).filter((l): l is string => !!l && l.length > 2);
  if (listed.length >= 3) return listed;
  const after = syllabus.match(/(?:inhalte|contents|topics)[^:\n]*:\s*([\s\S]+)/i)?.[1] ?? '';
  const section = after.split(/\n\s*[A-ZÄÖÜ][\wäöüß -]{2,40}:\s*(?:\n|$)/)[0]!;
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of section.replace(/\n/g, ' ')) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (!depth && (ch === ',' || ch === ';')) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  // "A sowie B" is two topics.
  const topics = parts.flatMap((p) => p.split(/\s+sowie\s+/)).map((p) => p.replace(/\.$/, '').trim()).filter((p) => p.length > 2 && p.length < 320);
  return topics.length >= 3 ? topics : [];
}

// The lecture's likely topic: the syllabus spread evenly over the term's
// lectures, so lecture i of n falls on the topic at the same fraction of the
// list. The first lecture is usually an introduction.
export function guessTopic(course: string, topics: string[], index: number, total: number): string {
  if (!topics.length) return `${course}, lecture ${index + 1}`;
  if (index === 0) return `${course}: introduction and overview; ${topics[0]}`;
  const k = Math.min(topics.length - 1, Math.floor((index / Math.max(1, total)) * topics.length));
  return `${course}: ${topics[k]}`;
}
