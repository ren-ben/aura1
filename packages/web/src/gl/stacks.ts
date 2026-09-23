// The stacks: the library as Borges left it. Hexagonal galleries, four walls
// of shelves and two doorways to the next gallery, a well through the floor
// with a ladder in it, a balcony overhead, and a lamp hung at each crossing.
// Everything is built once and walked through; the dither pass in engine.ts
// turns it into the charcoal it is drawn from.
import * as THREE from 'three';
import { rng } from './engine';

export type ShelfEntry = { id: string; title: string; through: number; chapters: number; marks: number };

const stone = (v: number) => new THREE.MeshLambertMaterial({ color: new THREE.Color(v, v, v) });
const flat = (v: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v) });

export const CELL = 5.2;      // one gallery to the next
const R = 3.1;                // the hexagon, corner to centre
const FLOOR = 3.4;            // one storey

// The six walls of a gallery. Two of them, front and back, are the doorways.
const WALLS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return { a, x: Math.cos(a) * R * 0.866, z: Math.sin(a) * R * 0.866, door: i === 1 || i === 4 };
});

// A case of shelves: two uprights, five boards, and a back. The spines are
// added to a shared instanced mesh so a whole library costs one draw.
function bookcase(g: THREE.Group, x: number, z: number, y: number, a: number, wood: THREE.Material,
                  slots: { m: THREE.Matrix4; tone: number }[], r: () => number): void {
  const w = R * 0.92, h = FLOOR * 0.88, d = 0.42;
  const c = new THREE.Group();
  c.position.set(x, y, z);
  c.rotation.y = -a - Math.PI / 2;
  c.updateMatrix();
  const box = (bw: number, bh: number, bd: number, bx: number, by: number, bz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wood);
    m.position.set(bx, by + bh / 2, bz);
    c.add(m);
  };
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
    let at = -w / 2 + 0.14;
    while (at < w / 2 - 0.16) {
      const t = 0.045 + r() * 0.075;              // thickness of the spine
      if (at + t > w / 2 - 0.14) break;
      if (r() < 0.06) { at += t * (1 + r() * 2); continue; }   // a gap, a missing volume
      const tall = room * (0.62 + r() * 0.36);
      const lean = r() < 0.12 ? (r() - 0.5) * 0.5 : 0;
      dummy.position.set(at + t / 2 + Math.abs(lean) * tall * 0.2, shelfY + tall / 2, 0.02);
      dummy.rotation.set(0, 0, lean);
      dummy.scale.set(t, tall, d * 0.78);
      dummy.updateMatrix();
      const m = new THREE.Matrix4().copy(c.matrix).multiply(dummy.matrix);
      slots.push({ m, tone: 0.2 + Math.pow(r(), 0.7) * 0.8 });
      at += t * (1 + r() * 0.15);
    }
  }
  g.add(c);
}

// The rail around a well, and around a balcony: uprights and two runs.
function railing(g: THREE.Group, y: number, inner: number, iron: THREE.Material, posts = 30): void {
  const ring = (at: number, thick: number) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(inner, thick, 4, 6), iron);
    m.position.set(0, at, 0);
    m.rotation.x = Math.PI / 2;
    m.rotation.z = Math.PI / 6;
    g.add(m);
  };
  ring(y + 0.78, 0.022);
  ring(y + 0.4, 0.014);
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.03), iron);
    p.position.set(Math.cos(a) * inner, y + 0.4, Math.sin(a) * inner);
    g.add(p);
  }
}

// One gallery: floor with the well cut out of it, its six walls, the rail and
// the lamp. Galleries repeat down the shaft, and again on the storey above.
function gallery(g: THREE.Group, z: number, y: number, mats: {
  wood: THREE.Material; slab: THREE.Material; iron: THREE.Material; lamp: THREE.Material;
}, slots: { m: THREE.Matrix4; tone: number }[], r: () => number, near: boolean): void {
  const well = R * 0.52;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, R * 1.02, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, well, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(ring, 24), mats.slab);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, y, z);
  g.add(floor);

  const rail = new THREE.Group();
  rail.position.set(0, y, z);
  railing(rail, 0, well + 0.06, mats.iron, near ? 26 : 14);
  g.add(rail);

  for (const wall of WALLS) {
    if (wall.door) continue;
    bookcase(g, wall.x, z + wall.z, y, wall.a, mats.wood, slots, r);
  }

  // The lamp: a shade on a stem, and the bulb under it.
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), mats.iron);
  stem.position.set(0, y + FLOOR - 0.25, z);
  g.add(stem);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 8, 1, true), mats.iron);
  shade.position.set(0, y + FLOOR - 0.5, z);
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mats.lamp);
  bulb.position.set(0, y + FLOOR - 0.58, z);
  g.add(bulb);
}

// A ladder down the well, the way out of one gallery into the one beneath.
function ladder(g: THREE.Group, z: number, y: number, iron: THREE.Material): void {
  const l = new THREE.Group();
  l.position.set(R * 0.4, y, z);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, FLOOR, 0.04), iron);
    rail.position.set(s * 0.18, -FLOOR / 2, 0);
    l.add(rail);
  }
  for (let k = 0; k < 9; k++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), iron);
    rung.position.set(0, -0.2 - k * (FLOOR / 9), 0);
    l.add(rung);
  }
  g.add(l);
}

export type Stacks = {
  group: THREE.Group;
  // The user's own volumes, one mesh each, in the order they were given.
  mine: THREE.Mesh[];
  update: (t: number) => void;
};

// The whole shaft. `books` are the volumes that are actually yours: they
// stand together on the near wall of the first gallery, taller and paler than
// the rest, and each one is its own mesh so it can be picked and pulled.
export function stacks(books: ShelfEntry[], depth = 5): Stacks {
  const g = new THREE.Group();
  const r = rng(17);
  const mats = {
    wood: stone(0.36),
    slab: stone(0.72),
    iron: stone(0.34),
    lamp: flat(1),
  };
  const slots: { m: THREE.Matrix4; tone: number }[] = [];

  for (let k = 0; k < depth; k++) {
    const z = -k * CELL;
    gallery(g, z, 0, mats, slots, r, k < 2);
    gallery(g, z, FLOOR, mats, slots, r, false);
    if (k % 2 === 1) ladder(g, z, 0, mats.iron);
  }

  // Every spine in the place, in one instanced mesh.
  const spine = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone(0.85), Math.max(1, slots.length));
  spine.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, slots.length) * 3), 3);
  slots.forEach((s, i) => {
    spine.setMatrixAt(i, s.m);
    spine.instanceColor!.setXYZ(i, s.tone, s.tone, s.tone);
  });
  spine.instanceMatrix.needsUpdate = true;
  g.add(spine);

  // Yours: the shelf you can reach, at eye level in the first gallery.
  const mine: THREE.Mesh[] = [];
  const wall = WALLS[3]!;
  const shelfY = FLOOR * 0.44;
  const c = new THREE.Object3D();
  c.position.set(wall.x, 0, wall.z);
  c.rotation.y = -wall.a - Math.PI / 2;
  c.updateMatrix();
  let at = -R * 0.34;
  books.forEach((b, i) => {
    const thick = 0.1 + Math.min(0.14, b.chapters * 0.006);
    const tall = 0.62 + Math.min(0.3, b.chapters * 0.012);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, tall, 0.34), stone(0.95 - (i % 3) * 0.12));
    const where = new THREE.Vector3(at + thick / 2, shelfY + tall / 2, 0.04).applyMatrix4(c.matrix);
    mesh.position.copy(where);
    mesh.rotation.y = c.rotation.y;
    mesh.userData = { book: b.id, home: where.clone(), homeRot: mesh.rotation.y, index: i, tall, thick };
    g.add(mesh);
    mine.push(mesh);
    at += thick * 1.16;
  });

  return {
    group: g,
    mine,
    update(t: number) {
      // The lamps swing, barely, the way a hung thing does in a draught.
      g.rotation.z = Math.sin(t * 0.21) * 0.002;
    },
  };
}
