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

export type ShelfEntry = { id: string; title: string; through: number; chapters: number; marks: number };

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
type Kind = 'wood' | 'slab' | 'iron' | 'lamp';
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

// A case of shelves: two uprights, five boards, and a back. The spines go to
// one instanced mesh, as matrices relative to the gallery.
function bookcase(parts: Parts, x: number, z: number, a: number, slots: { m: THREE.Matrix4; tone: number }[], r: () => number): void {
  const w = R * 0.92, h = FLOOR * 0.88, d = 0.42;
  const c = at(x, 0, z, -a - Math.PI / 2);
  const box = (bw: number, bh: number, bd: number, bx: number, by: number, bz: number) =>
    parts.add('wood', new THREE.BoxGeometry(bw, bh, bd), c.clone().multiply(at(bx, by + bh / 2, bz)));
  box(w, 0.06, d, 0, h, 0);                       // the cornice
  box(0.09, h, d, -w / 2, 0, 0);
  box(0.09, h, d, w / 2, 0, 0);
  box(w, h, 0.05, 0, 0, -d / 2);                  // the back
  const boards = 5;
  for (let k = 0; k <= boards; k++) box(w, 0.05, d, 0, (h * k) / boards, 0);

  // The books on each board, leaning, gapped, every one a different tone.
  const dummy = new THREE.Object3D();
  for (let k = 0; k < boards; k++) {
    const shelfY = (h * k) / boards + 0.05;
    const room = h / boards - 0.16;
    let x0 = -w / 2 + 0.14;
    while (x0 < w / 2 - 0.16) {
      const t = 0.045 + r() * 0.075;              // thickness of the spine
      if (x0 + t > w / 2 - 0.14) break;
      if (r() < 0.06) { x0 += t * (1 + r() * 2); continue; }   // a gap, a missing volume
      const tall = room * (0.62 + r() * 0.36);
      const lean = r() < 0.12 ? (r() - 0.5) * 0.5 : 0;
      dummy.position.set(x0 + t / 2 + Math.abs(lean) * tall * 0.2, shelfY + tall / 2, 0.02);
      dummy.rotation.set(0, 0, lean);
      dummy.scale.set(t, tall, d * 0.78);
      dummy.updateMatrix();
      slots.push({ m: c.clone().multiply(dummy.matrix), tone: 0.2 + Math.pow(r(), 0.7) * 0.8 });
      x0 += t * (1 + r() * 0.15);
    }
  }
}

// One gallery: its floor with the well cut through it, the rail round the
// well, four walls of shelves, the lamp, and the ladder down.
function gallery(parts: Parts, slots: { m: THREE.Matrix4; tone: number }[], r: () => number): void {
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
    if (!wall.door) bookcase(parts, wall.x, wall.z, wall.a, slots, r);
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
  const mats: Record<Kind, THREE.Material> = { wood: stone(0.36), slab: stone(0.72), iron: stone(0.34), lamp: flat(1) };

  const parts = new Parts();
  const slots: { m: THREE.Matrix4; tone: number }[] = [];
  gallery(parts, slots, r);

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
  const spine = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone(0.85), count);
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
    },
  };
}
