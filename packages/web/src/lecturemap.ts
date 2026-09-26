// A lecture map, as the page lays it out: its cards, where they sit, the
// maths in them, the plots drawn from them, and the map taken away as an
// Obsidian canvas.
import katex from 'katex';
import { strToU8, zipSync } from 'fflate';
import type { GrownNode, LectureMap } from '@aura/shared';

// ---- maths ----------------------------------------------------------------
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const tex = (s: string, display = false) => katex.renderToString(s, { throwOnError: false, displayMode: display, output: 'html' });
// Plain text with $...$ inline maths, as HTML: everything else escaped.
export const rich = (s: string) => s.split(/(\$[^$]+\$)/g)
  .map((part) => (/^\$[^$]+\$$/.test(part) ? tex(part.slice(1, -1)) : escape(part))).join('');

// ---- plots -----------------------------------------------------------------
// An expression in x and t, read into a function by hand: numbers, x, t, pi,
// e, + - * / ^, brackets and a handful of functions. Nothing else is ever
// run, so a map can carry a picture and never code.
const FNS: Record<string, (v: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs };
export type Fn = (x: number, t: number) => number;
export function parse(src: string): Fn | null {
  const tokens = src.replace(/\s+/g, '').match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()]/gi);
  if (!tokens || tokens.join('') !== src.replace(/\s+/g, '')) return null;
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  // expr := term (+|- term)*; term := unary (*|/ unary | implicit unary)*;
  // unary := -unary | power; power := atom (^ unary)?
  const expr = (): Fn => {
    let f = term();
    while (peek() === '+' || peek() === '-') { const op = next(), a = f, b = term(); f = op === '+' ? (x, t) => a(x, t) + b(x, t) : (x, t) => a(x, t) - b(x, t); }
    return f;
  };
  const term = (): Fn => {
    let f = unary();
    for (;;) {
      const p = peek();
      if (p === '*' || p === '/') { next(); const a = f, b = unary(); f = p === '*' ? (x, t) => a(x, t) * b(x, t) : (x, t) => a(x, t) / b(x, t); }
      else if (p !== undefined && p !== ')' && p !== '+' && p !== '-' && p !== '^') { const a = f, b = unary(); f = (x, t) => a(x, t) * b(x, t); }
      else return f;
    }
  };
  const unary = (): Fn => { if (peek() === '-') { next(); const a = unary(); return (x, t) => -a(x, t); } return power(); };
  const power = (): Fn => { const a = atom(); if (peek() === '^') { next(); const b = unary(); return (x, t) => a(x, t) ** b(x, t); } return a; };
  const atom = (): Fn => {
    const tk = next();
    if (tk === undefined) throw new Error('end');
    if (tk === '(') { const f = expr(); if (next() !== ')') throw new Error(')'); return f; }
    if (/^\d|^\./.test(tk)) { const v = Number(tk); return () => v; }
    const name = tk.toLowerCase();
    if (name === 'x') return (x) => x;
    if (name === 't') return (_, t) => t;
    if (name === 'pi') return () => Math.PI;
    if (name === 'e') return () => Math.E;
    const fn = FNS[name];
    if (fn) { const a = atom(); return (x, t) => fn(a(x, t)); }
    throw new Error(name);
  };
  try {
    const f = expr();
    return i === tokens.length ? f : null;
  } catch { return null; }
}
export const moves = (expr: string) => /(^|[^a-z])t([^a-z]|$)/i.test(expr);

// ---- the cards ---------------------------------------------------------------
export type Kind = 'hook' | 'questions' | 'outline' | 'terms' | 'equations' | 'pictures' | 'worked' | 'traps' | 'refresh' | 'further';
export const TITLES: Record<Kind, string> = {
  hook: 'the puzzle', questions: 'before you go', outline: 'the likely order', terms: 'the words',
  equations: 'the equations', pictures: 'pictures', worked: 'one worked through', traps: 'traps',
  refresh: 'refresh first', further: 'further',
};
// The columns either side of the core, nearest first: what to do before the
// lecture on the left, what it will contain on the right.
const COLUMNS: Kind[][] = [['hook', 'questions'], ['refresh', 'further'], ['outline', 'terms', 'equations'], ['worked', 'pictures', 'traps']];
export const present = (m: LectureMap, k: Kind) => !['equations', 'pictures', 'further'].includes(k) || (m[k as 'equations'] as unknown[]).length > 0;

export const CORE = { w: 360, h: 380 };
export const CARD = 320;
const GAP = 34, COL = 90;
export type Box = { x: number; y: number; w: number; h: number };

// Where each card sits, given how tall it came out: stacked in its column,
// the column centred on the core. Grown cards go in a column beyond the
// outer ones, as near their parent's height as the ones before allow.
export function layout(m: LectureMap, grown: GrownNode[], heights: Record<string, number>): Record<string, Box> {
  const at: Record<string, Box> = { core: { x: -CORE.w / 2, y: -CORE.h / 2, ...CORE } };
  const colX = [-(CORE.w / 2 + COL + CARD), -(CORE.w / 2 + 2 * COL + 2 * CARD), CORE.w / 2 + COL, CORE.w / 2 + 2 * COL + CARD];
  COLUMNS.forEach((kinds, c) => {
    const ks = kinds.filter((k) => present(m, k));
    const hs = ks.map((k) => heights[k] ?? 200);
    let y = -(hs.reduce((a, h) => a + h, 0) + GAP * (ks.length - 1)) / 2;
    ks.forEach((k, i) => { at[k] = { x: colX[c]!, y, w: CARD, h: hs[i]! }; y += hs[i]! + GAP; });
  });
  const sideOf = (key: string): 'left' | 'right' => {
    const root = at[key.split('.')[0]!];
    return root && root.x < 0 ? 'left' : 'right';
  };
  // Parents first, so a card grown out of a grown card finds its parent placed.
  const placed = [...grown].sort((a, b) => a.id.split('.').length - b.id.split('.').length);
  const depthX = (key: string, side: 'left' | 'right') => {
    const depth = key.split('.').filter((p) => /^g\d+$/.test(p)).length;
    return side === 'left' ? colX[1]! - depth * (CARD + COL) : colX[3]! + depth * (CARD + COL);
  };
  const floors: Record<string, number> = {};
  for (const g of placed) {
    const side = sideOf(g.parent);
    const x = depthX(g.id, side);
    const parent = at[g.parent] ?? at[g.parent.split('.')[0]!]!;
    const h = heights[g.id] ?? 160;
    const col = `${side}${x}`;
    const y = Math.max(parent.y, floors[col] ?? -Infinity);
    at[g.id] = { x, y, w: CARD, h };
    floors[col] = y + h + GAP / 2;
  }
  return at;
}

// A link from one box to another: out of the facing sides, a gentle S.
export function link(a: Box, b: Box): string {
  const right = b.x > a.x;
  const x1 = right ? a.x + a.w : a.x, y1 = a.y + Math.min(a.h / 2, 60);
  const x2 = right ? b.x : b.x + b.w, y2 = b.y + Math.min(b.h / 2, 40);
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

// ---- taken away ----------------------------------------------------------------
// The map as Markdown: the note to write into, and the text of each card.
export function cardText(m: LectureMap, k: Kind): string {
  switch (k) {
    case 'hook': return m.hook;
    case 'questions': return m.questions.map((q, i) => `${i + 1}. ${q.q}\n   - ${q.a}`).join('\n');
    case 'outline': return m.outline.map((o, i) => `${i + 1}. ${o}`).join('\n');
    case 'terms': return m.terms.map((t) => `- **${t.term}**: ${t.meaning}`).join('\n');
    case 'equations': return m.equations.map((e) => `$$${e.tex}$$\n${e.says}`).join('\n\n');
    case 'pictures': return m.pictures.map((p) => `- ${p.title}: $y = ${p.expr}$, $x$ from ${p.from} to ${p.to}. ${p.caption}`).join('\n');
    case 'worked': return `${m.worked.problem}\n\n${m.worked.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**Answer:** ${m.worked.answer}`;
    case 'traps': return m.traps.map((t) => `- Not: ${t.wrong}\n  But: ${t.right}`).join('\n');
    case 'refresh': return m.refresh.map((r, i) => `${i + 1}. **${r.topic}**: ${r.why}`).join('\n');
    case 'further': return m.further.map((f) => `- [${f.title}](${f.url}): ${f.note}`).join('\n');
  }
}
export const KINDS = Object.keys(TITLES) as Kind[];

export function markdown(m: LectureMap, grown: GrownNode[], meta: { course: string; date: string }): string {
  const parts = [`# ${m.title}`, `${meta.course}, ${meta.date}`, `> ${m.core}`];
  for (const k of KINDS) if (present(m, k)) parts.push(`## ${TITLES[k]}`, cardText(m, k));
  if (grown.length) parts.push('## deeper', ...grown.map((g) => `### ${g.title}\n${g.tex ? `$$${g.tex}$$\n` : ''}${g.text}`));
  parts.push('## my notes', '');
  return parts.join('\n\n');
}

// An Obsidian canvas (JSON Canvas 1.0), laid out as on the page, with the
// Markdown note beside it; both zipped.
export function exportZip(m: LectureMap, grown: GrownNode[], at: Record<string, Box>, meta: { course: string; date: string }): Blob {
  const name = `${meta.date} ${m.title}`.replace(/[\\/:*?"<>|]/g, '');
  const nodes: object[] = [{ id: 'core', type: 'text', text: `# ${m.title}\n\n${m.core}`, ...box(at.core!) }];
  const edges: object[] = [];
  for (const k of KINDS) {
    if (!present(m, k) || !at[k]) continue;
    nodes.push({ id: k, type: 'text', text: `## ${TITLES[k]}\n\n${cardText(m, k)}`, ...box(at[k]!) });
    edges.push(edge('core', k, at));
  }
  for (const g of grown) {
    if (!at[g.id]) continue;
    nodes.push({ id: g.id, type: 'text', text: `### ${g.title}\n\n${g.tex ? `$$${g.tex}$$\n\n` : ''}${g.text}`, ...box(at[g.id]!) });
    edges.push(edge(at[g.parent] ? g.parent : g.parent.split('.')[0]!, g.id, at));
  }
  const notes = { id: 'notes', type: 'file', file: `${name}.md`, x: Math.round(at.core!.x), y: Math.round(at.core!.y + at.core!.h + 80), width: CORE.w, height: 200 };
  const canvas = JSON.stringify({ nodes: [...nodes, notes], edges }, null, 2);
  return new Blob([zipSync({ [`${name}.canvas`]: strToU8(canvas), [`${name}.md`]: strToU8(markdown(m, grown, meta)) })], { type: 'application/zip' });
}
const box = (b: Box) => ({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.w), height: Math.round(b.h) });
function edge(from: string, to: string, at: Record<string, Box>) {
  const right = at[to]!.x > at[from]!.x;
  return { id: `${from}-${to}`, fromNode: from, fromSide: right ? 'right' : 'left', toNode: to, toSide: right ? 'left' : 'right' };
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
