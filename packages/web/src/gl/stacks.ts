// The stacks: the library as Borges left it. Hexagonal galleries, four walls
// of shelves and two doorways to the next gallery, a well through the floor
// with a ladder down it, and a lamp hung in each one, repeating without end:
// ahead, behind, above and below. It is not endless. One gallery is built,
// merged into a handful of meshes, and drawn many times over in a block that
// follows you by whole galleries, so walking never reaches the edge of it and
// the fog hides where it stops. The dither pass in engine.ts turns it into
// the charcoal it is drawn from.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './engine';

export type ShelfEntry = { id: number; title: string; through: number; chapters: number; marks: number };

const stone = (v: number) => new THREE.MeshLambertMaterial({ color: new THREE.Color(v, v, v) });
const flat = (v: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v) });

export const CELL = 5.2;      // one gallery to the next
export const FLOOR = 3.4;     // one storey
const R = 3.1;                // the hexagon, corner to centre
// How far the block reaches from the gallery you are in: past the fog.
const AHEAD = 3, BELOW = 4, ABOVE = 3;

// The six walls of a gallery. Two of them, front and back, are the doorways.
const WALLS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return { a, x: Math.cos(a) * R * 0.866, z: Math.sin(a) * R * 0.866, door: i === 1 || i === 4 };
});

// One gallery's parts, gathered by what they are made of before they are merged.
type Kind = 'wood' | 'slab' | 'iron' | 'lamp' | 'bone' | 'dark' | 'paper' | 'brass';
class Parts {
  byKind = new Map<Kind, THREE.BufferGeometry[]>();
  add(kind: Kind, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    g.applyMatrix4(matrix);
    (this.byKind.get(kind) ?? this.byKind.set(kind, []).get(kind)!).push(g);
  }
}
const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

// A case of shelves: two pilasters with capitals, five boards with a brass
// plate on each, a stepped cornice with its dentils, and a back. Most of each
// board is books, which go to one instanced mesh as matrices relative to the
// gallery; now and then a board keeps something else: a candle, a skull, a
// bundle of scrolls, or books laid flat.
function bookcase(parts: Parts, x: number, z: number, a: number, slots: { m: THREE.Matrix4; tone: number }[],
                  flames: THREE.Vector3[], r: () => number): void {
  const w = R * 0.92, h = FLOOR * 0.88, d = 0.42;
  const c = at(x, 0, z, -a - Math.PI / 2);
  const put = (kind: Kind, g: THREE.BufferGeometry, bx: number, by: number, bz: number, ry = 0, rx = 0, rz = 0) =>
    parts.add(kind, g, c.clone().multiply(at(bx, by, bz, ry, rx, rz)));
  const box = (bw: number, bh: number, bd: number, bx: number, by: number, bz: number, kind: Kind = 'wood') =>
    put(kind, new THREE.BoxGeometry(bw, bh, bd), bx, by + bh / 2, bz);
  // The cornice, stepped out in three, and the dentils under it.
  box(w + 0.12, 0.05, d + 0.08, 0, h + 0.07, 0.03);
  box(w + 0.06, 0.04, d + 0.04, 0, h + 0.03, 0.02);
  box(w, 0.03, d, 0, h, 0);
  for (let i = 0; i < 18; i++) box(0.05, 0.035, 0.03, -w / 2 + 0.08 + (i * (w - 0.16)) / 17, h - 0.035, d / 2 + 0.01);
  // The pilasters, each with a capital and a base.
  for (const s of [-1, 1]) {
    box(0.1, h, d + 0.02, (s * w) / 2, 0, 0.01);
    box(0.14, 0.05, d + 0.06, (s * w) / 2, h - 0.12, 0.02);
    box(0.14, 0.07, d + 0.06, (s * w) / 2, 0, 0.02);
  }
  box(w, h, 0.05, 0, 0, -d / 2);                  // the back
  const boards = 5;
  for (let k = 0; k <= boards; k++) {
    box(w, 0.05, d, 0, (h * k) / boards, 0);
    // A brass plate on the board's edge, where a catalogue number would go.
    if (k < boards) box(0.12, 0.035, 0.01, (r() - 0.5) * w * 0.6, (h * k) / boards + 0.008, d / 2 + 0.005, 'brass');
  }

  const dummy = new THREE.Object3D();
  const spine = (bx: number, by: number, bz: number, sx: number, sy: number, sz: number, lean: number, flat = false) => {
    dummy.position.set(bx, by, bz);
    dummy.rotation.set(0, 0, flat ? Math.PI / 2 : lean);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    slots.push({ m: c.clone().multiply(dummy.matrix), tone: 0.25 + Math.pow(r(), 1.4) * 0.75 });
  };
  for (let k = 0; k < boards; k++) {
    const shelfY = (h * k) / boards + 0.05;
    const room = h / boards - 0.16;
    // Somewhere along this board, perhaps, something that is not a book.
    const odd = r() < 0.55 ? -w / 2 + 0.3 + r() * (w - 0.8) : Infinity;
    const kind = Math.floor(r() * 4);
    let x0 = -w / 2 + 0.14;
    while (x0 < w / 2 - 0.16) {
      if (x0 > odd && x0 < odd + 0.1) {
        const mid = x0 + 0.14;
        if (kind === 0) {
          // A candle, burnt down, its wax run over the board.
          const tall = 0.08 + r() * 0.14;
          put('paper', new THREE.CylinderGeometry(0.025, 0.03, tall, 8), mid, shelfY + tall / 2, 0.04);
          put('paper', new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10), mid, shelfY + 0.005, 0.04);
          flames.push(new THREE.Vector3(mid, shelfY + tall + 0.035, 0.04).applyMatrix4(c));
        } else if (kind === 1) {
          // A skull, looking out of the shelf.
          put('bone', new THREE.SphereGeometry(0.075, 12, 9), mid, shelfY + 0.08, 0.04);
          put('bone', new THREE.BoxGeometry(0.08, 0.04, 0.07), mid, shelfY + 0.02, 0.07);
          for (const e of [-1, 1]) put('dark', new THREE.SphereGeometry(0.02, 6, 5), mid + e * 0.027, shelfY + 0.075, 0.105);
        } else if (kind === 2) {
          // Scrolls, stacked like logs.
          for (let n = 0; n < 5; n++) {
            const row = n < 3 ? 0 : 1, col = n < 3 ? n : n - 3 + 0.5;
            put('paper', new THREE.CylinderGeometry(0.028, 0.028, d * 0.8, 8), mid - 0.06 + col * 0.058, shelfY + 0.03 + row * 0.05, 0.02, 0, Math.PI / 2);
          }
        } else {
          // Books laid flat, one on another.
          for (let n = 0; n < 3; n++) spine(mid, shelfY + 0.025 + n * 0.05, 0.02, 0.045, 0.22 + r() * 0.06, d * 0.7, 0, true);
        }
        x0 += 0.3;
        continue;
      }
      const t = 0.045 + r() * 0.075;              // thickness of the spine
      if (x0 + t > w / 2 - 0.14) break;
      if (r() < 0.06) { x0 += t * (1 + r() * 2); continue; }   // a gap, a missing volume
      const tall = room * (0.62 + r() * 0.36);
      const lean = r() < 0.12 ? (r() - 0.5) * 0.5 : 0;
      spine(x0 + t / 2 + Math.abs(lean) * tall * 0.2, shelfY + tall / 2, 0.02, t, tall, d * 0.78, lean);
      x0 += t * (1 + r() * 0.15);
    }
  }
}

// A spine seen close: a head and tail band, two raised bands, and a label
// with a line of something written on it. Every book in the stacks wears it,
// toned by its own colour.
function spineTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6e6e6e'; g.fillRect(0, 0, 32, 128);
  g.fillStyle = '#ffffff';
  for (const y of [6, 30, 96, 118]) g.fillRect(0, y, 32, 4);
  g.fillStyle = '#5a5a5a'; g.fillRect(6, 44, 20, 34);
  g.fillStyle = '#ffffff';
  for (let y = 50; y < 74; y += 6) g.fillRect(9, y, 8 + ((y * 7) % 7), 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

// One gallery: its floor with the well cut through it, the rail round the
// well, four walls of shelves, the lamp, and the ladder down.
function gallery(parts: Parts, slots: { m: THREE.Matrix4; tone: number }[], flames: THREE.Vector3[], r: () => number): void {
  const well = R * 0.52;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, R * 1.02, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, well, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  parts.add('slab', new THREE.ShapeGeometry(ring, 18), at(0, 0, 0, 0, -Math.PI / 2));

  // The rail: two iron rings and their posts.
  for (const [y, thick] of [[0.78, 0.022], [0.4, 0.014]] as const) {
    parts.add('iron', new THREE.TorusGeometry(well + 0.06, thick, 4, 6), at(0, y, 0, 0, Math.PI / 2, Math.PI / 6));
  }
  const posts = 14;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    parts.add('iron', new THREE.BoxGeometry(0.03, 0.8, 0.03), at(Math.cos(a) * (well + 0.06), 0.4, Math.sin(a) * (well + 0.06)));
  }

  for (const wall of WALLS) {
    if (!wall.door) bookcase(parts, wall.x, wall.z, wall.a, slots, flames, r);
  }

  // The lamp: a shade on a stem, and the bulb under it.
  parts.add('iron', new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), at(0, FLOOR - 0.25, 0));
  parts.add('iron', new THREE.ConeGeometry(0.22, 0.2, 8, 1, true), at(0, FLOOR - 0.5, 0));
  parts.add('lamp', new THREE.SphereGeometry(0.06, 8, 6), at(0, FLOOR - 0.58, 0));

  // The ladder down the well, to the gallery beneath.
  for (const s of [-1, 1]) parts.add('iron', new THREE.BoxGeometry(0.04, FLOOR, 0.04), at(R * 0.4 + s * 0.18, -FLOOR / 2, 0));
  for (let k = 0; k < 9; k++) parts.add('iron', new THREE.BoxGeometry(0.4, 0.03, 0.03), at(R * 0.4, -0.2 - k * (FLOOR / 9), 0));
}

export type Stacks = {
  group: THREE.Group;
  // The user's own volumes, one mesh each, in the order they were given.
  mine: THREE.Mesh[];
  update: (t: number, eye: THREE.Vector3) => void;
};

// `books` are the volumes that are actually yours: they stand together on
// the near wall of the gallery you start in, taller and paler than the rest,
// each its own mesh so it can be picked and pulled. That gallery is a place:
// it stays where it is while the rest of the library repeats around it.
export function stacks(books: ShelfEntry[]): Stacks {
  const group = new THREE.Group();
  const r = rng(17);
  const mats: Record<Kind, THREE.Material> = {
    wood: stone(0.32), slab: stone(0.6), iron: stone(0.34), lamp: flat(1),
    bone: stone(0.85), dark: flat(0), paper: stone(0.9), brass: stone(1),
  };

  const parts = new Parts();
  const slots: { m: THREE.Matrix4; tone: number }[] = [];
  const flames: THREE.Vector3[] = [];
  gallery(parts, slots, flames, r);

  // Every gallery in the block, as offsets from the one you are in.
  const cells: THREE.Matrix4[] = [];
  for (let s = -BELOW; s <= ABOVE; s++) {
    for (let k = -AHEAD; k <= AHEAD; k++) cells.push(new THREE.Matrix4().makeTranslation(0, s * FLOOR, -k * CELL));
  }

  // The block: every part of a gallery as one instanced mesh per material,
  // one instance a gallery. A handful of draws for the whole library.
  const block = new THREE.Group();
  for (const [kind, geometries] of parts.byKind) {
    const merged = mergeGeometries(geometries, false)!;
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.InstancedMesh(merged, mats[kind], cells.length);
    cells.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.frustumCulled = false;
    block.add(mesh);
  }
  // Every spine in it, in one more: the same shelves, toned differently from
  // one gallery to the next so no two look alike.
  const count = slots.length * cells.length;
  const plain = stone(0.85);
  const spine = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    [plain, plain, plain, plain, new THREE.MeshLambertMaterial({ color: 0xffffff, map: spineTexture() }), plain], count);
  spine.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const m = new THREE.Matrix4();
  cells.forEach((cell, c) => {
    const jitter = rng(101 + c);
    slots.forEach((slot, i) => {
      const n = c * slots.length + i;
      spine.setMatrixAt(n, m.multiplyMatrices(cell, slot.m));
      const tone = Math.min(1, Math.max(0.15, slot.tone + (jitter() - 0.5) * 0.5));
      spine.instanceColor!.setXYZ(n, tone, tone, tone);
    });
  });
  spine.instanceMatrix.needsUpdate = true;
  spine.frustumCulled = false;
  block.add(spine);

  // The candles left burning on the shelves: a point of light each, in every
  // gallery of the block.
  const flamePos = new Float32Array(flames.length * cells.length * 3);
  const v = new THREE.Vector3();
  cells.forEach((cell, ci) => flames.forEach((f, fi) => v.copy(f).applyMatrix4(cell).toArray(flamePos, (ci * flames.length + fi) * 3)));
  const flameGeo = new THREE.BufferGeometry();
  flameGeo.setAttribute('position', new THREE.BufferAttribute(flamePos, 3));
  const flameMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, sizeAttenuation: true });
  const flamePoints = new THREE.Points(flameGeo, flameMat);
  flamePoints.frustumCulled = false;
  block.add(flamePoints);

  // Dust, hanging in the air of the gallery you stand in.
  const DUST = 160;
  const dustPos = new Float32Array(DUST * 3);
  const dr = rng(9);
  for (let i = 0; i < DUST; i++) dustPos.set([(dr() - 0.5) * R * 1.6, dr() * FLOOR, (dr() - 0.5) * CELL], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
  dust.frustumCulled = false;
  block.add(dust);

  // The lamps light the gallery you are in and the next one on.
  for (const z of [0, -CELL]) {
    const lamp = new THREE.PointLight(0xffffff, z ? 22 : 30, 12, 2);
    lamp.position.set(0, FLOOR * 0.8, z);
    block.add(lamp);
  }
  group.add(block);

  // Yours: the shelf you can reach, at eye level in the first gallery.
  const mine: THREE.Mesh[] = [];
  const wall = WALLS[3]!;
  const shelfY = FLOOR * 0.44;
  const c = new THREE.Object3D();
  c.position.set(wall.x, 0, wall.z);
  c.rotation.y = -wall.a - Math.PI / 2;
  c.updateMatrix();
  let x0 = -R * 0.34;
  books.forEach((b, i) => {
    const thick = 0.1 + Math.min(0.14, b.chapters * 0.006);
    const tall = 0.62 + Math.min(0.3, b.chapters * 0.012);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, tall, 0.34), stone(0.95 - (i % 3) * 0.12));
    const where = new THREE.Vector3(x0 + thick / 2, shelfY + tall / 2, 0.04).applyMatrix4(c.matrix);
    mesh.position.copy(where);
    mesh.rotation.y = c.rotation.y;
    mesh.userData = { book: b.id, home: where.clone(), homeRot: mesh.rotation.y, index: i, tall, thick };
    group.add(mesh);
    mine.push(mesh);
    x0 += thick * 1.16;
  });

  return {
    group,
    mine,
    update(t: number, eye: THREE.Vector3) {
      // The block keeps to the gallery the eye is in, a whole gallery at a
      // time, so the library it draws is always the one around you.
      block.position.set(0, Math.round((eye.y - 1.7) / FLOOR) * FLOOR, Math.round(eye.z / CELL) * CELL);
      // The lamps swing, barely, the way a hung thing does in a draught.
      group.rotation.z = Math.sin(t * 0.21) * 0.002;
      // The candles gutter; the dust drifts down.
      flameMat.size = 0.045 + Math.sin(t * 9) * 0.006 + Math.sin(t * 23) * 0.004;
      dust.position.y = -((t * 0.03) % FLOOR);
      dust.rotation.y = t * 0.01;
    },
  };
}
