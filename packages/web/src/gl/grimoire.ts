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
  // 0 shut, 1 laid open. Everything between is the covers turning.
  open: (u: number) => void;
  dispose: () => void;
};

export function grimoire(book: ShelfEntry, seed = 11): Grimoire {
  const group = new THREE.Group();
  const w = 0.8, h = 1.1, thick = 0.042;
  const leather = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.22, 0.22) });
  const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.86, 0.86) });

  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const left = tex(sealPage(book, seed));
  const right = tex(treePage(book, seed));
  const textures = [left, right];

  // The block of pages, and the two leaves that turn off the spine.
  const block = new THREE.Mesh(new THREE.BoxGeometry(w * 2 * 0.96, h * 0.96, thick * 0.9), edge);
  block.position.set(0, 0, -thick * 0.5);
  group.add(block);

  const leaf = (side: 1 | -1, map: THREE.Texture) => {
    const pivot = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), leather);
    cover.position.set((side * w) / 2, 0, -thick * 0.6);
    pivot.add(cover);
    const page = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.94, h * 0.94),
      new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, fog: false }),
    );
    page.position.set((side * w) / 2, 0, 0.001);
    pivot.add(page);
    group.add(pivot);
    return pivot;
  };
  const leftLeaf = leaf(-1, left);
  const rightLeaf = leaf(1, right);

  // Clasps: two straps across the fore-edge, which let go as it opens.
  const clasps = [-0.26, 0.26].map((y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 2 * 1.02, 0.045, thick * 2.4), edge);
    m.position.set(0, y * h, 0);
    group.add(m);
    return m;
  });

  group.rotation.x = -0.28;

  return {
    group,
    open(u: number) {
      const e = u * u * (3 - 2 * u);
      // Shut, the left leaf lies folded over the right one.
      leftLeaf.rotation.y = (1 - e) * Math.PI;
      rightLeaf.rotation.y = -(1 - e) * 0.06;
      block.scale.z = 0.4 + e * 0.6;
      clasps.forEach((c, i) => {
        c.visible = u < 0.5;
        c.position.z = (1 - e) * 0.0 + e * 0.2 * (i ? 1 : -1);
      });
      group.rotation.x = -0.28 - e * 0.22;
    },
    dispose() {
      textures.forEach((t) => t.dispose());
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        }
      });
    },
  };
}
