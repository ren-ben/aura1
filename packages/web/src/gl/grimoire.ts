// What one of your books turns into when it is pulled off the shelf. It does
// not show its text - the reading happens on the page, not here. It shows
// what a grimoire shows: a sigil of the thing on the left leaf, and on the
// right the book laid out as a tree, ten vessels for its chapters, lit as far
// as you have read, with every passage you kept burning on the path it sits on.
import * as THREE from 'three';
import { rng } from './engine';
import type { ShelfEntry } from './stacks';

const S = 512;

function paper(g: CanvasRenderingContext2D, seed: number): void {
  const r = rng(seed);
  g.fillStyle = '#d8d2c4';
  g.fillRect(0, 0, S, S);
  // Foxing, damp, and the grain of a page that has been handled.
  for (let i = 0; i < 26; i++) {
    const x = r() * S, y = r() * S, rad = 12 + r() * 70;
    const stain = g.createRadialGradient(x, y, 0, x, y, rad);
    stain.addColorStop(0, `rgba(90,78,58,${0.05 + r() * 0.1})`);
    stain.addColorStop(1, 'rgba(90,78,58,0)');
    g.fillStyle = stain;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(40,34,26,${r() * 0.16})`;
    g.fillRect(r() * S, r() * S, 1, 1);
  }
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
  edge.addColorStop(0, 'rgba(20,16,10,0)');
  edge.addColorStop(1, 'rgba(20,16,10,.5)');
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
}

// A line of script that says nothing in a language nobody kept: strokes on a
// baseline, with ascenders, descenders and the odd diacritic over them.
function script(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, size: number, r: () => number): void {
  g.strokeStyle = 'rgba(26,20,14,.85)';
  g.lineWidth = Math.max(0.7, size * 0.11);
  g.lineCap = 'round';
  let x = x0;
  while (x < x1) {
    const w = size * (0.3 + r() * 0.5);
    if (r() < 0.12) { x += w; continue; }          // the space between words
    g.beginPath();
    const up = r() < 0.3 ? size * 0.5 : 0, down = r() < 0.22 ? size * 0.45 : 0;
    g.moveTo(x, y + down);
    g.lineTo(x, y - size * 0.55 - up);
    if (r() < 0.6) g.lineTo(x + w, y - size * (0.1 + r() * 0.5));
    if (r() < 0.45) g.lineTo(x + w * 0.4, y);
    g.stroke();
    if (r() < 0.18) {                              // a mark set over it
      g.beginPath();
      g.arc(x + w * 0.3, y - size * 0.85, size * 0.07, 0, 7);
      g.fill();
    }
    x += w * 1.25;
  }
}

// The small things drawn in the margins of every page he keeps.
const INK = 'rgba(26,20,14,.9)';
function star(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y); g.lineTo(x + s * 0.25, y + s * 0.25);
  g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25); g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25);
  g.closePath(); g.fill();
}
// A constellation nobody has named: five stars in a corner and the lines between them.
function constellation(g: CanvasRenderingContext2D, x: number, y: number, spread: number, r: () => number): void {
  const pts = Array.from({ length: 5 }, () => [x + (r() - 0.5) * spread, y + (r() - 0.5) * spread] as const);
  g.strokeStyle = 'rgba(26,20,14,.4)'; g.lineWidth = 0.9; g.setLineDash([2, 3]);
  g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  g.setLineDash([]); g.fillStyle = INK;
  pts.forEach(([px, py], i) => star(g, px, py, i === 0 ? 5 : 2.6 + r() * 1.6));
}
// The moon at a phase: 0 new, .5 half, 1 full.
function moonAt(g: CanvasRenderingContext2D, x: number, y: number, rad: number, p: number): void {
  g.strokeStyle = INK; g.lineWidth = 1.2;
  g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK; g.beginPath();
  g.arc(x, y, rad, -Math.PI / 2, Math.PI / 2, false);
  g.ellipse(x, y, rad * Math.abs(1 - 2 * p), rad, 0, Math.PI / 2, -Math.PI / 2, p < 0.5);
  g.fill();
}
// The twelve houses, as a ring of small marks round whatever sits inside it.
function zodiac(g: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number): void {
  g.strokeStyle = INK; g.lineWidth = 1.4;
  for (const rad of [inner, outer]) { g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke(); }
  const mid = (inner + outer) / 2, s = (outer - inner) * 0.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner); g.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer); g.stroke();
    const b = a + Math.PI / 12, x = cx + Math.cos(b) * mid, y = cy + Math.sin(b) * mid;
    g.save(); g.translate(x, y); g.rotate(b + Math.PI / 2); g.lineWidth = 1.3; g.beginPath();
    switch (i % 6) {
      case 0: g.arc(0, 0, s, 0, 7); g.moveTo(s * 0.25, 0); g.arc(0, 0, s * 0.25, 0, 7); break;       // the sun
      case 1: g.arc(0, 0, s, -1.2, 1.2); g.arc(s * 0.5, 0, s * 0.7, 1.5, -1.5, true); break;          // a crescent
      case 2: g.moveTo(0, -s); g.lineTo(s, s); g.lineTo(-s, s); g.closePath(); break;                  // fire
      case 3: g.moveTo(-s, -s * 0.3); g.lineTo(0, s * 0.3); g.lineTo(s, -s * 0.3); g.moveTo(-s, s * 0.4); g.lineTo(0, s); g.lineTo(s, s * 0.4); break; // the waters
      case 4: g.moveTo(0, -s); g.lineTo(0, s); g.moveTo(-s * 0.7, -s * 0.2); g.lineTo(s * 0.7, -s * 0.2); break; // the cross
      default: g.arc(0, -s * 0.3, s * 0.55, 0, 7); g.moveTo(0, s * 0.25); g.lineTo(0, s); break;      // the mirror
    }
    g.stroke(); g.restore();
  }
}

// The left leaf: the seal of this book. Rings of script wound round an eye,
// the way a page of the Necronomicon winds round whatever it is looking at.
function sealPage(book: ShelfEntry, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  paper(g, seed);

  // Its name at the head of the page, with a rule and a star under it.
  g.fillStyle = '#1a140e';
  g.font = `600 ${Math.round(S * 0.05)}px "IM Fell English", Georgia, serif`;
  g.textAlign = 'center';
  const title = book.title.length > 26 ? `${book.title.slice(0, 25)}…` : book.title;
  g.fillText(title, S / 2, S * 0.09);
  g.strokeStyle = INK; g.lineWidth = 1;
  g.beginPath(); g.moveTo(S * 0.3, S * 0.115); g.lineTo(S * 0.46, S * 0.115); g.moveTo(S * 0.54, S * 0.115); g.lineTo(S * 0.7, S * 0.115); g.stroke();
  g.fillStyle = INK; star(g, S / 2, S * 0.115, 6);

  // Stars in the corners, the houses round the seal.
  constellation(g, S * 0.1, S * 0.1, S * 0.13, r);
  constellation(g, S * 0.9, S * 0.1, S * 0.13, r);
  constellation(g, S * 0.1, S * 0.9, S * 0.13, r);
  constellation(g, S * 0.9, S * 0.9, S * 0.13, r);
  const cx = S / 2, cy = S * 0.53;
  zodiac(g, cx, cy, S * 0.315, S * 0.36);
  // The rings, each one a turn of script, thinning outward.
  for (let k = 0; k < 6; k++) {
    const rad = S * (0.09 + k * 0.04);
    g.save();
    g.translate(cx, cy);
    const turns = 40 + k * 14;
    for (let i = 0; i < turns; i++) {
      g.save();
      g.rotate((i / turns) * Math.PI * 2 + k * 0.4);
      g.strokeStyle = `rgba(26,20,14,${0.55 + (1 - k / 6) * 0.35})`;
      g.lineWidth = Math.max(0.6, 2.4 - k * 0.3);
      g.beginPath();
      g.moveTo(rad, -1.6);
      g.lineTo(rad + (r() < 0.4 ? 5 : 3), r() < 0.5 ? 2.4 : -2.8);
      g.stroke();
      g.restore();
    }
    g.strokeStyle = `rgba(26,20,14,${k % 2 ? 0.5 : 0.8})`;
    g.lineWidth = k % 2 ? 1 : 2;
    g.beginPath();
    g.arc(0, 0, rad - 5, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  // The eye: an almond, a slit, and what runs out of it.
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#f0ece0';
  g.beginPath();
  g.moveTo(-S * 0.085, 0);
  g.quadraticCurveTo(0, -S * 0.058, S * 0.085, 0);
  g.quadraticCurveTo(0, S * 0.058, -S * 0.085, 0);
  g.fill();
  g.strokeStyle = '#1a140e';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#1a140e';
  g.beginPath();
  g.ellipse(0, 0, S * 0.022, S * 0.04, 0, 0, 7);
  g.fill();
  g.beginPath();
  g.arc(0, 0, S * 0.033, 0, 7);
  g.lineWidth = 2;
  g.stroke();
  for (let i = 0; i < 7; i++) {                   // what it weeps
    const x = -S * 0.06 + i * S * 0.02;
    g.beginPath();
    g.moveTo(x, S * 0.02);
    g.lineTo(x + (r() - 0.5) * 6, S * (0.05 + r() * 0.07));
    g.lineWidth = 1.6;
    g.stroke();
  }
  g.restore();

  // A line of the text that names it, under the seal.
  script(g, S * 0.24, S * 0.76, S * 0.935, 12, r);
  return c;
}

// The ten vessels, in the arrangement they are always drawn in, and the paths
// between them. x, y in the unit square.
const TREE: [number, number][] = [
  [0.5, 0.08], [0.72, 0.2], [0.28, 0.2], [0.72, 0.38], [0.28, 0.38],
  [0.5, 0.5], [0.72, 0.64], [0.28, 0.64], [0.5, 0.76], [0.5, 0.92],
];
const PATHS: [number, number][] = [
  [0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5],
  [3, 6], [4, 7], [5, 6], [5, 7], [6, 7], [5, 8], [6, 8], [7, 8], [8, 9], [6, 9], [7, 9], [0, 5],
];

// The right leaf: the book as a tree. Ten vessels for its chapters, filled as
// far as it has been read; the paths lit where you kept something.
function treePage(book: ShelfEntry, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(seed + 3);
  paper(g, seed + 3);

  const at = (i: number) => [S * 0.16 + TREE[i]![0] * S * 0.68, S * 0.08 + TREE[i]![1] * S * 0.8] as const;
  const read = Math.max(0, Math.min(1, book.through / 100));

  // The sky behind the tree: pricked stars, an orbit round it with its three
  // bodies, and the moon across the head of the page in all its phases.
  g.fillStyle = 'rgba(26,20,14,.28)';
  for (let i = 0; i < 110; i++) g.fillRect(r() * S, r() * S, 1.4, 1.4);
  g.fillStyle = INK;
  for (let i = 0; i < 9; i++) star(g, S * (0.05 + r() * 0.9), S * (0.12 + r() * 0.8), 2 + r() * 2.5);
  g.strokeStyle = 'rgba(26,20,14,.45)'; g.lineWidth = 1.1; g.setLineDash([3, 5]);
  g.beginPath(); g.ellipse(S / 2, S * 0.5, S * 0.46, S * 0.42, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  [0.4, 2.3, 4.1].forEach((a, i) => {
    const x = S / 2 + Math.cos(a) * S * 0.46, y = S * 0.5 + Math.sin(a) * S * 0.42;
    g.fillStyle = '#1a140e'; g.beginPath(); g.arc(x, y, 4 + i * 1.5, 0, 7); g.fill();
    if (i === 1) { g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 13, 4, -0.4, 0, 7); g.stroke(); }
  });
  for (let i = 0; i < 7; i++) moonAt(g, S * (0.2 + i * 0.1), S * 0.038, 6.5, i / 6);

  g.strokeStyle = 'rgba(26,20,14,.5)';
  g.lineWidth = 1.6;
  PATHS.forEach(([a, b], i) => {
    const [ax, ay] = at(a), [bx, by] = at(b);
    const lit = i < Math.min(PATHS.length, book.marks);
    g.strokeStyle = lit ? 'rgba(26,20,14,.95)' : 'rgba(26,20,14,.35)';
    g.lineWidth = lit ? 3.2 : 1.4;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
    if (!lit) return;
    // A passage kept burns on its path.
    g.fillStyle = 'rgba(26,20,14,.9)';
    for (let k = 0; k < 4; k++) {
      const u = 0.2 + r() * 0.6;
      g.beginPath();
      g.arc(ax + (bx - ax) * u, ay + (by - ay) * u, 1.4 + r() * 2.2, 0, 7);
      g.fill();
    }
  });

  TREE.forEach((_, i) => {
    const [x, y] = at(i);
    const rad = S * 0.045;
    const full = (i + 1) / 10 <= read;
    const part = !full && i / 10 < read;
    g.fillStyle = '#e7e1d2';
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    if (full || part) {
      g.save();
      g.beginPath();
      g.arc(x, y, rad, 0, 7);
      g.clip();
      g.fillStyle = '#1a140e';
      const h = full ? rad * 2 : rad * 2 * ((read * 10) % 1);
      g.fillRect(x - rad, y + rad - h, rad * 2, h);
      g.restore();
    }
    g.strokeStyle = '#1a140e';
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.stroke();
    // The number of the vessel, in the script.
    script(g, x - rad * 0.5, x + rad * 0.5, y + rad * 1.9, 9, r);
  });

  g.fillStyle = '#1a140e';
  g.font = `500 ${Math.round(S * 0.034)}px "IM Fell English", Georgia, serif`;
  g.textAlign = 'center';
  g.fillText(`${book.chapters} chapters · ${Math.round(read * 100)}% · ${book.marks} kept`, S / 2, S * 0.975);
  return c;
}

export type Grimoire = {
  group: THREE.Group;
  // 0 shut, 1 laid open. Everything between is the book coming open: the
  // clasps let go, the cover swings up and over, and the leaves under it
  // follow one after another before they settle. Played backwards, it shuts.
  open: (u: number) => void;
  dispose: () => void;
};

// A leaf of the book, neither the seal nor the tree: faded script, for the
// pages that turn over between them.
function blankLeaf(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  paper(g, seed);
  for (let y = S * 0.14; y < S * 0.88; y += S * 0.05) script(g, S * 0.12, S * (0.88 - r() * 0.15), y, 12, r);
  return c;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
// Where a stage of the opening is, given when it starts and how long it runs.
const stage = (u: number, from: number, len: number) => clamp((u - from) / len);
const smooth = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
// Past the mark and back, the way a heavy cover lands.
const land = (x: number) => { const c = 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export function grimoire(book: ShelfEntry, seed = 11): Grimoire {
  const group = new THREE.Group();
  const book3 = new THREE.Group();
  group.add(book3);
  const w = 0.8, h = 1.1, board = 0.03, block = 0.05;
  const leather = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.3, 0.3, 0.3) });
  const tooled = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.75, 0.75, 0.75) });
  const edges = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.85, 0.85, 0.85) });
  const brass = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.95, 0.95, 0.95) });

  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const left = tex(sealPage(book, seed));
  const right = tex(treePage(book, seed));
  const blank = tex(blankLeaf(seed + 9));
  const textures = [left, right, blank];

  // Each half of the book: its board, its half of the text block, and the
  // page on top, around a hinge at the spine. Lying open, both face you;
  // the front half turned over onto the back one is the book shut.
  const half = (side: 1 | -1, map: THREE.Texture) => {
    const hinge = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, board), leather);
    cover.position.set((side * w) / 2, 0, -block - board / 2);
    hinge.add(cover);
    // The tooling round the board's outer face, and a boss in its middle.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.9, 0.004), tooled);
    frame.position.set((side * w) / 2, 0, -block - board - 0.002);
    hinge.add(frame);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, h * 0.84, 0.006), leather);
    inset.position.set((side * w) / 2, 0, -block - board - 0.004);
    hinge.add(inset);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20), brass);
    boss.rotation.x = Math.PI / 2;
    boss.position.set((side * w) / 2, 0, -block - board - 0.012);
    hinge.add(boss);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.96, block), edges);
    pages.position.set((side * w * 0.96) / 2, 0, -block / 2);
    hinge.add(pages);
    const page = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.94),
      new THREE.MeshBasicMaterial({ map, fog: false }));
    page.position.set((side * w * 0.94) / 2, 0, 0.001);
    hinge.add(page);
    book3.add(hinge);
    return hinge;
  };
  const front = half(-1, left);
  half(1, right);

  // The spine: rounded, between the two boards.
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(block + board, block + board, h, 16, 1, false, Math.PI, Math.PI), leather);
  spine.position.set(0, 0, -block - board);
  spine.scale.set(0.35, 1, 1);
  book3.add(spine);

  // Two straps: riveted to the back board at its fore-edge, up over the
  // edge of the pages and buckled across the front one. Unbuckled, each
  // swings out and away before the cover can move.
  const T = 2 * (block + board);
  const straps = [-0.28, 0.28].map((y) => {
    const hinge = new THREE.Group();
    hinge.position.set(w, y * h, -block - board);
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, T + 0.012), leather);
    wrap.position.set(0.006, 0, T / 2);
    hinge.add(wrap);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.008), leather);
    band.position.set(-0.1, 0, T + 0.006);
    hinge.add(band);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.016), brass);
    clasp.position.set(-0.2, 0, T + 0.012);
    hinge.add(clasp);
    book3.add(hinge);
    return hinge;
  });

  // The leaves that turn between the seal and the tree, a flutter of them.
  const LEAVES = 6;
  const leafGeo = new THREE.PlaneGeometry(w * 0.93, h * 0.93);
  leafGeo.translate((w * 0.93) / 2, 0, 0);
  const leafMat = new THREE.MeshBasicMaterial({ map: blank, side: THREE.DoubleSide, fog: false });
  const leaves = Array.from({ length: LEAVES }, (_, i) => {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.z = 0.0016 + i * 0.0005;
    book3.add(leaf);
    return leaf;
  });

  group.rotation.x = -0.28;

  return {
    group,
    open(u: number) {
      // The clasps let go.
      const unclasp = smooth(stage(u, 0, 0.2));
      straps.forEach((s, i) => { s.rotation.y = unclasp * (2.25 + i * 0.2); s.rotation.x = unclasp * (i ? 0.06 : -0.06); });
      // The cover comes up and over, and lands with a little give.
      const lift = stage(u, 0.14, 0.52);
      const swing = lift < 1 ? smooth(lift) * 0.97 + (lift > 0.8 ? (land((lift - 0.8) / 0.2) - 1) * 0.03 : 0) : 1;
      front.rotation.y = (1 - Math.min(1, swing)) * Math.PI;
      // The leaves under it follow, one after another, each a little slower.
      leaves.forEach((leaf, i) => {
        const p = stage(u, 0.3 + i * 0.06, 0.28);
        const e = smooth(p);
        leaf.visible = p > 0 && p < 1;
        leaf.rotation.y = -Math.PI * e;
        // In the air a leaf lifts at its middle, and lies flat again once down.
        leaf.rotation.x = Math.sin(Math.PI * e) * 0.12 * (i % 2 ? 1 : -1);
      });
      // The book comes up to meet you as it opens, and settles back.
      const open = smooth(stage(u, 0.1, 0.8));
      group.rotation.x = -0.28 - open * 0.24;
      book3.position.z = Math.sin(Math.PI * clamp(u * 1.1)) * 0.05;
      book3.rotation.z = Math.sin(Math.PI * lift) * -0.025;
    },
    dispose() {
      textures.forEach((t) => t.dispose());
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    },
  };
}
