// Under the ward: the vault the ledge stands on, where the reading is kept.
// In the crossing an altar with the book being read open on a stand between
// two candles; either side, a row of bookcases running off down the aisle,
// each row holding half of every book read, as many cases as that takes.
// Chosen, a row is brought round: the top of the altar turns on its ratchet a
// quarter at a time, the altar sinks into the floor and the slabs grind shut
// over it, the other row goes down into the floor, the great wheel turns, the
// chain runs and the counterweight climbs, the seals under the cases wake,
// and the cases turn one after another to stand in a line facing you. Drag
// along the line; draw any book out; touch anything else to send it back.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type Build } from './engine';
import { canvasTexture, riffle, tome, type Held, type TomeModel } from './tome';
import type { Tome } from '../store';

export type VaultHooks = {
  hover: (index: number) => void;         // a read book under the pointer, or -1
  pick: (index: number) => void;          // a read book clicked
  focus: (side: number) => void;          // -1 or 1 when a row is brought round, 0 when it goes back
  bind: (back: () => void) => void;       // how the page sends it back
};

const grey = (v: number) => new THREE.Color(v, v, v);
const surname = (a: string) => a.split(' ').pop() ?? a;
const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const span = (u: number, a: number, b: number) => ease((u - a) / (b - a));
const TONES = [0.13, 0.19, 0.26, 0.34, 0.6, 0.74];
const FLOOR = -1.5;
const ROWS = 4, ROW = 0.8, H = ROWS * ROW;            // a case: four shelves
const SW = 1.9, IW = 1.72;                            // a case's width, and its shelves'
const CAP = 64;                                       // books a case holds: its atlas has room for so many spines
const CX = 1.38, CZ = -0.2;                           // where the rows stand, at rest
const CZF = -0.9;                                     // where the line stands, brought round
const DUR = 4.6;                                      // seconds, altar to line

// A spine, painted into its slot of a case's atlas: leather or vellum, two
// raised bands, the title in the book hand, whose it is at the tail.
function paintSpine(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, b: Tome, tone: number): void {
  g.save(); g.translate(x0, y0);
  const c = Math.round(tone * 255);
  g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(0, 0, w, h);
  const r = rng(b.title.length * 97 + 3);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.fillStyle = tone > 0.45 ? '#141210' : '#efe9dc';
  g.fillRect(w * 0.05, 0, h * 0.12, h); g.fillRect(w * 0.95 - h * 0.12, 0, h * 0.12, h);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  const room = w * 0.62;
  let size = h * 0.6;
  g.font = `${size}px 'IM Fell English', serif`;
  while (g.measureText(b.title).width > room && size > h * 0.32) { size *= 0.93; g.font = `${size}px 'IM Fell English', serif`; }
  let title = b.title;
  while (g.measureText(title).width > room && title.length > 4) title = `${title.slice(0, -2)}…`;
  g.fillText(title, w * 0.05 + h * 0.4, h * 0.54);
  g.textAlign = 'right';
  g.font = `${h * 0.26}px Silkscreen, monospace`;
  g.fillText(surname(b.author).toUpperCase(), w * 0.95 - h * 0.3, h * 0.54);
  g.restore();
}

// The seal cut into a case's turntable: circles, the houses, a star, and a
// name in letters nobody reads.
function paintSeal(g: CanvasRenderingContext2D, s: number, seed: number): void {
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  const c = s / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  for (const [rad, lw] of [[0.48, 6], [0.44, 2], [0.3, 3], [0.27, 1.5]] as const) { g.lineWidth = lw; g.beginPath(); g.arc(c, c, s * rad, 0, Math.PI * 2); g.stroke(); }
  g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 7; i++) { const a = -Math.PI / 2 + (i * 6 * Math.PI) / 7; const x = c + Math.cos(a) * s * 0.3, y = c + Math.sin(a) * s * 0.3; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * s * 0.3, c + Math.sin(a) * s * 0.3); g.lineTo(c + Math.cos(a) * s * 0.44, c + Math.sin(a) * s * 0.44); g.stroke(); }
  const r = rng(seed);
  g.font = `${s * 0.045}px UnifrakturMaguntia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const letters = 'KAELTHOSABRAXASIAOSABAOTHADONAIAGLA';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    g.save(); g.translate(c + Math.cos(a) * s * 0.37, c + Math.sin(a) * s * 0.37); g.rotate(a + Math.PI / 2);
    g.fillText(letters[(i + Math.floor(r() * 3)) % letters.length]!, 0, 0); g.restore();
  }
}

// A cog: teeth round the rim, spokes cut through the web.
function cog(radius: number, teeth: number, depth: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i <= teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2, r = radius * (i % 4 === 1 || i % 4 === 2 ? 1 : 0.86);
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2 + 0.12, a1 = a0 + Math.PI / 3 - 0.24;
    const h = new THREE.Path();
    h.absarc(0, 0, radius * 0.7, a0, a1, false);
    h.absarc(0, 0, radius * 0.24, a1, a0, true);
    s.holes.push(h);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
}

// Everything that never moves against its parent, gathered up and merged at
// the end into one mesh a material and one set of scored edges: the vault is
// hundreds of stones and would otherwise be hundreds of draw calls.
class Mason {
  private parts: { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4; etch: boolean }[] = [];
  constructor(private keep: Held, private edges: Map<THREE.BufferGeometry, THREE.EdgesGeometry>, private score: THREE.Material) {}
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rot?: THREE.Euler, etch = true): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), new THREE.Vector3(1, 1, 1));
    this.parts.push({ geo, mat, m, etch });
  }
  build(parent: THREE.Object3D): void {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const lines: THREE.BufferGeometry[] = [];
    for (const p of this.parts) {
      const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
      g.clearGroups();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), g]);
      if (p.etch) {
        let e = this.edges.get(p.geo);
        if (!e) { e = this.keep(new THREE.EdgesGeometry(p.geo, 25)); this.edges.set(p.geo, e); }
        lines.push(e.clone().applyMatrix4(p.m));
      }
    }
    byMat.forEach((geos, mat) => {
      parent.add(new THREE.Mesh(this.keep(mergeGeometries(geos)!), mat));
      geos.forEach((g) => g.dispose());
    });
    if (lines.length) { parent.add(new THREE.LineSegments(this.keep(mergeGeometries(lines)!), this.score)); lines.forEach((g) => g.dispose()); }
  }
}

type Book = { mesh: THREE.Mesh; home: THREE.Vector3; index: number; owner: Case };
type Case = { group: THREE.Group; books: Book[]; seal: THREE.Mesh; lit: THREE.Material; spine: THREE.Material };
type Row = { side: number; cases: Case[]; gear: THREE.Mesh; pinion: THREE.Mesh; links: THREE.InstancedMesh; weight: THREE.Mesh; sealMat: THREE.MeshBasicMaterial };

export function vault(current: Tome | null, read: Tome[], hooks: VaultHooks): Build {
  return ({ scene, camera, canvas: glass }) => {
    const held: { dispose: () => void }[] = [];
    const keep: Held = (x) => { held.push(x); return x; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    addEventListener('keydown', onKey);
    glass.addEventListener('aura:dispose', () => { held.forEach((x) => x.dispose()); removeEventListener('keydown', onKey); }, { once: true });
    glass.style.touchAction = 'none';
    camera.fov = 36; camera.updateProjectionMatrix();
    const fog = new THREE.Fog(0x000000, 3.5, 11);
    scene.fog = fog;
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    const mat = (v: number) => keep(new THREE.MeshLambertMaterial({ color: grey(v) }));
    const stone = mat(0.2), dark = mat(0.06), wood = mat(0.13), bronze = mat(0.34), pages = mat(0.7), wax = mat(0.85);
    const tones = TONES.map(mat);
    const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const score = keep(new THREE.LineBasicMaterial({ color: grey(0.62) }));
    const edges = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
    const etch = <T extends THREE.Mesh>(mesh: T) => {
      let e = edges.get(mesh.geometry);
      if (!e) { e = keep(new THREE.EdgesGeometry(mesh.geometry, 25)); edges.set(mesh.geometry, e); }
      mesh.add(new THREE.LineSegments(e, score));
      return mesh;
    };
    const boxes = new Map<string, THREE.BoxGeometry>();
    const B = (w: number, h: number, d: number) => {
      const k = `${w}|${h}|${d}`;
      let g = boxes.get(k);
      if (!g) { g = keep(new THREE.BoxGeometry(w, h, d)); boxes.set(k, g); }
      return g;
    };
    const flames: THREE.Mesh[] = [];
    const flameGeo = keep(new THREE.SphereGeometry(0.016, 8, 6));
    const candle = (parent: THREE.Object3D, x: number, y: number, z: number, h: number) => {
      const c = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.024, 0.028, h, 10)), wax); c.position.set(x, y + h / 2, z); parent.add(c);
      const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, y + h + 0.028, z); parent.add(f); flames.push(f);
    };
    const hall = new Mason(keep, edges, score);

    // ---- the altar ------------------------------------------------------------------
    // A plinth with a bronze collar, and on it the crown that turns: a slab,
    // a slanted stand, the book open on it, a candle either side.
    const altar = new THREE.Group();
    scene.add(altar);
    const altarStone = new Mason(keep, edges, score);
    altarStone.add(B(0.7, 0.86, 0.6), stone, 0, FLOOR + 0.43, 0);
    altarStone.add(B(0.8, 0.08, 0.7), stone, 0, FLOOR + 0.04, 0);
    altarStone.build(altar);
    const collar = etch(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.46, 0.46, 0.06, 8)), bronze));
    collar.position.y = FLOOR + 0.89; altar.add(collar);
    const crown = new THREE.Group();
    crown.position.y = FLOOR + 0.92;
    altar.add(crown);
    const crownStone = new Mason(keep, edges, score);
    crownStone.add(B(1.3, 0.06, 0.62), stone, 0, 0.03, 0);
    // The stand leans back as far as the book does, and a lip holds its foot.
    const LEAN = 0.5, BOOK_Y = 0.36;
    crownStone.add(B(0.66, 0.035, 0.66), wood, 0, BOOK_Y - Math.sin(LEAN) * 0.08, -0.03 - Math.cos(LEAN) * 0.08, new THREE.Euler(Math.PI / 2 - LEAN, 0, 0));
    crownStone.add(B(0.7, 0.06, 0.06), wood, 0, 0.09, 0.14);
    crownStone.build(crown);
    const S = 0.6;
    let m: TomeModel | null = null;
    if (current) {
      m = tome(current.cover, current.title, current.pages, keep);
      m.group.scale.setScalar(S);
      m.group.rotation.x = -LEAN;
      crown.add(m.group);
    }
    candle(crown, -0.56, 0.06, 0.08, 0.2); candle(crown, 0.56, 0.06, 0.08, 0.28);
    const altarLight = new THREE.PointLight(0xffffff, 2.2, 3.4, 1.3);
    altarLight.position.set(0, 0.7, 0.8); crown.add(altarLight);
    // The shaft the altar goes down, and the slabs that close over it.
    hall.add(B(0.84, 0.02, 0.74), keep(new THREE.MeshBasicMaterial({ color: 0x000000 })), 0, FLOOR + 0.02, 0, undefined, false);
    const slabs = [-1, 1].map((s) => {
      const d = etch(new THREE.Mesh(B(0.44, 0.06, 0.76), stone));
      d.userData.side = s; d.visible = false; scene.add(d);
      return d;
    });

    // ---- the rows of cases ---------------------------------------------------------------
    const sealTex = [0, 1].map((i) => keep(canvasTexture(512, 512, (g) => paintSeal(g, 512, 5 + i * 4))));
    const repaint: (() => void)[] = [];
    const rows: Row[] = [-1, 1].map((side, si) => {
      // Half of the books each, alternately, so both hold the newest.
      const mine = read.map((b, index) => ({ b, index })).filter((_, i) => i % 2 === si);
      const sealMat = keep(new THREE.MeshBasicMaterial({ map: sealTex[si], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2 }));
      const cases: Case[] = [];
      let at = 0, row = 0, slot = 0, c: Case | null = null, atlas: CanvasRenderingContext2D | null = null;
      // A new case, and the atlas its spines are painted into: two columns
      // of thirty-two slots.
      const open = () => {
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 2048;
        atlas = cv.getContext('2d')!;
        const tex = keep(new THREE.CanvasTexture(cv)); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
        const spine = keep(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }));
        const lit = keep(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.25 }));
        cases.push(c = { group: new THREE.Group(), books: [], seal: new THREE.Mesh(), lit, spine });
        at = 0; row = 0; slot = 0;
        repaint.push(() => { tex.needsUpdate = true; });
      };
      mine.forEach(({ b, index }) => {
        const r = rng(index * 131 + 7);
        const l = 0.58 + r() * 0.14, t = 0.055 + Math.min(0.065, (b.pages ?? 300) / 7500), d = 0.38;
        if (!c || slot === CAP) open();
        if (at + t > IW - 0.08) { at = 0; row++; if (row === ROWS) open(); }
        const tone = Math.floor(r() * 6);
        const sx = (slot % 2) * 512, sy = Math.floor(slot / 2) * 64, g = atlas!;
        paintSpine(g, sx, sy, 512, 64, b, TONES[tone]!);
        document.fonts?.ready.then(() => { g.clearRect(sx, sy, 512, 64); paintSpine(g, sx, sy, 512, 64, b, TONES[tone]!); });
        const geo = keep(new THREE.BoxGeometry(l, t, d));
        const uv = geo.attributes.uv!;
        // The face toward you (+z, the fifth) shows its slot.
        for (let v = 16; v < 20; v++) uv.setXY(v, (sx + uv.getX(v) * 512) / 1024, 1 - (sy + (1 - uv.getY(v)) * 64) / 2048);
        const mesh = new THREE.Mesh(geo, [pages, pages, tones[tone]!, tones[tone]!, c!.spine, pages]);
        mesh.rotation.z = -Math.PI / 2;
        mesh.userData.index = index;
        const home = new THREE.Vector3(-IW / 2 + 0.04 + at + t / 2, 0.12 + (ROWS - 1 - row) * ROW + 0.018 + l / 2, -0.19 + d / 2);
        mesh.position.copy(home);
        c!.group.add(mesh);
        c!.books.push({ mesh, home, index, owner: c! });
        at += t + 0.004;
        slot++;
      });
      if (!cases.length) open();
      // Each case: its turntable and seal, back, sides, shelves, and a gable.
      const gable = new THREE.Shape();
      gable.moveTo(-IW / 2 - 0.1, 0); gable.lineTo(0, 0.34); gable.lineTo(IW / 2 + 0.1, 0); gable.lineTo(-IW / 2 - 0.1, 0);
      const gableGeo = keep(new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }));
      const tableGeo = keep(new THREE.CylinderGeometry(1.0, 1.04, 0.1, 32));
      const sealGeo = keep(new THREE.PlaneGeometry(2, 2));
      cases.forEach((cs) => {
        const w = new Mason(keep, edges, score);
        w.add(tableGeo, stone, 0, 0.05, 0);
        w.add(B(SW - 0.06, H + 0.04, 0.04), dark, 0, 0.12 + H / 2, -0.21);
        for (const s of [-1, 1]) w.add(B(0.06, H + 0.1, 0.46), wood, s * (IW / 2 + 0.05), 0.12 + H / 2, 0);
        for (let k = 0; k <= ROWS; k++) w.add(B(IW + 0.16, 0.035, 0.46), wood, 0, 0.1 + k * ROW, 0);
        w.add(gableGeo, wood, 0, 0.12 + H, -0.2);
        w.build(cs.group);
        cs.seal.geometry = sealGeo; cs.seal.material = sealMat;
        cs.seal.rotation.x = -Math.PI / 2; cs.seal.position.y = 0.102;
        cs.group.add(cs.seal);
        cs.group.userData.side = side;
        scene.add(cs.group);
      });
      // The row's works, back in the corner of the crossing: a great wheel
      // and its pinion, a chain up over a pulley, and a counterweight.
      const gx = side * 2.45, gz = -2.0;
      const gear = etch(new THREE.Mesh(keep(cog(0.62, 24, 0.1)), bronze));
      gear.position.set(gx, FLOOR + 0.75, gz); scene.add(gear);
      const pinion = etch(new THREE.Mesh(keep(cog(0.26, 10, 0.1)), bronze));
      pinion.position.set(gx - side * 0.8, FLOOR + 0.42, gz); scene.add(pinion);
      hall.add(B(0.1, 0.85, 0.1), stone, gx, FLOOR + 0.42, gz - 0.13);
      hall.add(keep(new THREE.TorusGeometry(0.2, 0.035, 8, 24)), bronze, gx + side * 0.42, FLOOR + 3.1, gz);
      const links = new THREE.InstancedMesh(keep(new THREE.TorusGeometry(0.035, 0.009, 5, 10)), bronze, 80);
      scene.add(links);
      const weight = etch(new THREE.Mesh(B(0.34, 0.5, 0.34), stone));
      const face = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.3, 0.3)), sealMat);
      face.position.z = 0.171; weight.add(face);
      weight.position.set(gx + side * 0.62, FLOOR + 0.6, gz); scene.add(weight);
      // An iron stand of candles by the works.
      hall.add(keep(new THREE.CylinderGeometry(0.02, 0.05, 1.4, 8)), bronze, side * 1.95, FLOOR + 0.7, -1.4);
      hall.add(B(0.36, 0.03, 0.12), bronze, side * 1.95, FLOOR + 1.4, -1.4);
      for (const dx of [-0.14, 0, 0.14]) candle(scene, side * 1.95 + dx, FLOOR + 1.415, -1.4, 0.1 + Math.abs(dx) * 0.4);
      return { side, cases, gear, pinion, links, weight, sealMat };
    });
    document.fonts?.ready.then(() => repaint.forEach((f) => f()));
    const longest = Math.max(...rows.map((r) => r.cases.length));

    // ---- the aisle beyond the rows, running off into the dark ---------------------------
    const X = 1.4, z0 = CZ - SW / 2 - (longest - 1) * SW;
    const fill: { m: THREE.Matrix4; v: number }[] = [];
    const fr = rng(17);
    for (let b = 0; b < 6; b++) {
      const z = z0 - b * SW;
      for (const s of [-1, 1]) {
        hall.add(B(0.22, H + 0.5, 0.22), stone, s * (X + 0.05), FLOOR + (H + 0.5) / 2, z);
        hall.add(B(0.06, H, SW), dark, s * (X + 0.26), FLOOR + H / 2, z - SW / 2);
        for (let k = 0; k <= ROWS; k++) {
          const y = FLOOR + 0.085 + k * ROW;
          hall.add(B(0.5, 0.03, SW - 0.22), wood, s * (X + 0.02), y, z - SW / 2);
          if (k === ROWS) continue;
          // Other people's books: dim, and not for taking down.
          let a = z - 0.12;
          while (a > z - SW + 0.14) {
            const bw = 0.05 + fr() * 0.05, bh = 0.5 + fr() * 0.2;
            if (fr() > 0.1) fill.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(s * (X + 0.02), y + 0.015 + bh / 2, a - bw / 2), new THREE.Quaternion(), new THREE.Vector3(0.38, bh, bw)), v: 0.06 + fr() * 0.16 });
            a -= bw + 0.004;
          }
        }
      }
      hall.add(keep(new THREE.TorusGeometry(X + 0.05, 0.05, 6, 24, Math.PI)), stone, 0, FLOOR + H + 0.5, z);
      hall.add(B(2 * X, 0.05, SW * 0.96), b % 2 ? stone : dark, 0, FLOOR, z - SW / 2);
    }
    const inst = new THREE.InstancedMesh(B(1, 1, 1), keep(new THREE.MeshLambertMaterial()), fill.length);
    fill.forEach((f, i) => { inst.setMatrixAt(i, f.m); inst.setColorAt(i, grey(f.v)); });
    scene.add(inst);
    // The crossing's floor, the slabs under the rows, and the arch behind.
    hall.add(B(7, 0.05, 4.4), dark, 0, FLOOR, 0);
    for (let k = 0; k < longest; k++) for (const s of [-1, 1]) hall.add(B(1.2, 0.05, SW * 0.96), k % 2 ? stone : dark, s * 1.2, FLOOR + 0.001, CZ - k * SW);
    for (const s of [-1, 1]) {
      hall.add(B(0.55, 4.2, 0.55), stone, s * 3.1, FLOOR + 2.1, -2.3);
      hall.add(B(0.75, 0.14, 0.75), stone, s * 3.1, FLOOR + 0.07, -2.3);
    }
    hall.add(keep(new THREE.TorusGeometry(3.1, 0.09, 6, 40, Math.PI)), stone, 0, FLOOR + 4.2, -2.3);
    hall.build(scene);

    // Light: the altar's, one over each row, one far down the aisle, and one
    // that goes with the eye to light a row brought round. Few, since every
    // light is paid for at every pixel.
    const rowLights = [-1, 1].map((s) => { const l = new THREE.PointLight(0xffffff, 1.6, 3.2, 1.3); l.position.set(s * 0.7, FLOOR + 2.2, CZ + 0.6); scene.add(l); return l; });
    const far = new THREE.PointLight(0xffffff, 1.1, 3, 1.4); far.position.set(0, FLOOR + 2.4, z0 - SW * 1.5); scene.add(far);
    const lamp = new THREE.PointLight(0xffffff, 0, 5, 1.2); scene.add(lamp);

    // ---- state -------------------------------------------------------------------------
    // Which row is brought round (0 for none), which is still showing on its
    // way back, how far the works have run, and where the eye is on the line.
    let chosen = 0, shown = 0, u = 0;
    const pan = { x: 0, to: 0, v: 0, max: 0 };
    const back = () => { if (chosen) { chosen = 0; hooks.focus(0); } };
    hooks.bind(back);
    const bring = (side: number) => { chosen = side; shown = side; pan.to = pan.x = pan.v = 0; hooks.focus(side); };
    const dirOf = (side: number) => (side < 0 ? 1 : -1);

    const ray = new THREE.Raycaster();
    // Only solid things are found: the scored edges would catch every ray.
    const solid = (hits: THREE.Intersection[]) => hits.find((h) => (h.object as THREE.Mesh).isMesh);
    const pointer = new THREE.Vector2(9, 9);
    let dirty = true, hovered = -1, hoveredBook: Book | null = null, overCurrent = false, overRow = 0, overCase = false, phase = 0;
    let drag: { x: number; px: number; far: boolean; lastX: number; lastT: number } | null = null;
    const aim = (e: PointerEvent) => { const b = glass.getBoundingClientRect(); pointer.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); dirty = true; };
    // World units a pixel is worth on the line.
    const perPx = () => (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - CZF)) / Math.max(1, glass.clientHeight);
    glass.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, px: pan.to, far: false, lastX: e.clientX, lastT: performance.now() }; pan.v = 0; aim(e); });
    glass.addEventListener('pointermove', (e) => {
      aim(e);
      if (!drag || !e.buttons) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.far = true;
      if (chosen && u > 0.97) {
        const now = performance.now();
        pan.v = (-(e.clientX - drag.lastX) * perPx()) / Math.max(0.008, (now - drag.lastT) / 1000);
        drag.lastX = e.clientX; drag.lastT = now;
        pan.to = drag.px - dx * perPx();
      }
    });
    glass.addEventListener('pointerup', (e) => {
      if (drag && !drag.far) {
        // A tap has no hover before it: look now.
        aim(e); seek();
        if (chosen) { if (u > 0.97) { if (hovered >= 0) hooks.pick(hovered); else if (!overCase) back(); } }
        else if (overCurrent) { if (phase === 0) phase = 0.001; }
        else if (overRow) bring(overRow);
      } else if (drag && performance.now() - drag.lastT > 80) pan.v = 0;
      drag = null;
    });
    glass.addEventListener('pointerleave', () => { pointer.set(9, 9); dirty = true; });
    glass.addEventListener('wheel', (e) => {
      if (!chosen) return;
      e.preventDefault();
      pan.to += (e.deltaY + e.deltaX) * 0.004;
      pan.v = 0;
    }, { passive: false });
    const lean = new THREE.Vector2();
    const rest = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const near = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    const look = new THREE.Vector3();
    const linkM = new THREE.Matrix4(), flat = new THREE.Quaternion(), turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(), at = new THREE.Vector3(), out = new THREE.Vector3(0, 0.03, 0.24);
    const pickable = rows.flatMap((r) => r.cases.map((c) => c.group));
    const books = rows.flatMap((r) => r.cases.flatMap((c) => c.books));
    // What the pointer is over: a book on the line brought round, or, at
    // rest, the book on the altar or either row.
    function seek() {
      dirty = false;
      let over = -1, book: Book | null = null, cur = false, row = 0, onCase = false;
      if (Math.abs(pointer.x) <= 1 && !drag?.far) {
        ray.setFromCamera(pointer, camera);
        if (chosen && u > 0.97) {
          const r = rows.find((x) => x.side === chosen)!;
          const hit = solid(ray.intersectObjects(r.cases.map((c) => c.group), true));
          if (hit) {
            onCase = true;
            const i = hit.object.userData.index as number | undefined;
            if (i !== undefined) { over = i; book = books.find((b) => b.index === i) ?? null; }
          }
        } else if (!chosen && u === 0) {
          const hit = solid(ray.intersectObjects([...(m?.faces ?? []), ...pickable], true));
          if (hit) {
            if (m?.faces.includes(hit.object)) cur = true;
            else { let o: THREE.Object3D | null = hit.object; while (o && o.userData.side === undefined) o = o.parent; row = (o?.userData.side as number) ?? 0; }
          }
        }
      }
      if (over !== hovered) {
        if (hoveredBook) (hoveredBook.mesh.material as THREE.Material[])[4] = hoveredBook.owner.spine;
        if (book) (book.mesh.material as THREE.Material[])[4] = book.owner.lit;
        hovered = over; hoveredBook = book; hooks.hover(over);
      }
      overCurrent = cur; overRow = row; overCase = onCase;
      glass.style.cursor = over >= 0 || cur || row ? 'pointer' : chosen && pan.max > 0 ? (drag?.far ? 'grabbing' : 'grab') : '';
    }


    return (t, dt) => {
      const k = 1 - Math.pow(0.002, dt);
      flames.forEach((f, i) => { const q = Math.sin(t * (7 + i) + i) * 0.5 + Math.sin(t * 13.1 + i * 2) * 0.3; f.scale.set(1, 1.8 + q * 0.4, 1); });
      altarLight.intensity = 2.2 + (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1) * 0.3) * 0.3;

      // The works run at one pace, whichever way they are going.
      const was = u;
      u = Math.min(1, Math.max(0, u + (chosen ? dt : -dt) / DUR));
      if (!chosen && u === 0) shown = 0;
      const moving = u !== was;
      // The crown turns on its ratchet: a quarter, a rest, a quarter, a rest.
      const q = span(u, 0, 0.26) * 4, step = Math.min(3, Math.floor(q)), within = Math.min(1, (q - step) * 1.8);
      crown.rotation.y = (Math.PI / 2) * (q >= 4 ? 4 : step + ease(within));
      // Then the altar goes down, and the slabs grind over the shaft.
      const sink = span(u, 0.24, 0.42), shut = span(u, 0.4, 0.5);
      altar.position.y = -1.9 * sink;
      altar.visible = sink < 0.999;
      slabs.forEach((s) => {
        s.position.set((s.userData.side as number) * (0.62 - shut * 0.4), FLOOR - 0.04 + span(u, 0.37, 0.41) * 0.07, 0);
        s.visible = u > 0.36;
      });
      // The other row goes down into the floor; the chosen one turns and
      // comes to stand in a line, one case after another.
      rows.forEach((r) => {
        const mine = r.side === shown;
        const down = shown && !mine ? span(u, 0.3, 0.55) : 0;
        const dir = dirOf(r.side), restRot = r.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        let lead = 0;
        r.cases.forEach((c, i) => {
          const delay = Math.min(i, 8) * 0.025;
          const p = mine ? span(u, 0.42 + delay, 0.82 + delay) : 0;
          if (i === 0) lead = p;
          c.group.rotation.y = restRot * (1 - (mine ? span(u, 0.38 + delay, 0.7 + delay) : 0));
          c.group.position.set(r.side * CX + (dir * i * SW - r.side * CX) * p, FLOOR - down * (H + 0.8), CZ - i * SW + (CZF - CZ + i * SW) * p);
          c.group.visible = down < 0.999;
          c.seal.rotation.z = c.group.rotation.y * 2 + t * 0.03 + i;
        });
        r.sealMat.opacity += ((mine && moving ? 0.95 : 0.18 + Math.sin(t * 0.8 + r.side) * 0.05) - r.sealMat.opacity) * k;
        // The wheel turns with the row, the pinion against it, the chain runs
        // over the pulley, and the counterweight climbs.
        const run = mine ? lead : down, drive = run * 7;
        r.gear.rotation.z = drive * r.side;
        r.pinion.rotation.z = -drive * r.side * (0.62 / 0.26) + 0.13;
        r.weight.position.y = FLOOR + 0.6 + run * 1.6;
        if (!moving && t > 0.5) return;
        const gTop = r.gear.position.y + 0.62, px = r.gear.position.x + r.side * 0.42, top = FLOOR + 3.1, gz = r.gear.position.z;
        const shift = (((drive * 0.62) % 0.06) + 0.06) % 0.06, wy = r.weight.position.y + 0.25;
        for (let i = 0; i < 40; i++) {
          const ya = gTop + i * 0.06 + shift, yb = top - i * 0.06 - shift;
          linkM.compose(at.set(px - r.side * 0.2, Math.min(ya, top), gz), i % 2 ? turned : flat, ya > top ? none : one);
          r.links.setMatrixAt(i, linkM);
          linkM.compose(at.set(px + r.side * 0.2, yb, gz), i % 2 ? turned : flat, yb < wy ? none : one);
          r.links.setMatrixAt(40 + i, linkM);
        }
        r.links.instanceMatrix.needsUpdate = true;
      });

      // What the pointer is over, looked for only when something has moved.
      if (dirty || moving) seek();
      // The book under the pointer comes out to meet you; let go, it goes back.
      for (const b of books) {
        const want = b === hoveredBook ? at.copy(b.home).add(out) : b.home;
        if (b.mesh.position.distanceToSquared(want) > 1e-7) b.mesh.position.lerp(want, k);
      }
      // A row under the pointer lights up as a whole.
      rowLights.forEach((l, i) => { const want = !chosen && overRow === (i ? 1 : -1) ? 3.2 : 1.6; l.intensity += (want * (1 - span(u, 0.3, 0.6)) - l.intensity) * k; });

      if (m) {
        if (phase > 0) { phase += dt / 9; if (phase >= 1) phase = 0; } else if (t > 1 && t % 20 < dt && u === 0) phase = 0.001;
        riffle(m, phase);
        // It slides as it opens, so the open spread sits in the middle.
        const open = m.board.rotation.y / -(Math.PI - 0.02);
        m.group.position.set(m.size.w * S * 0.5 * open, BOOK_Y, -0.03);
      }

      // The eye at rest: fitted to the open book on the altar for whatever
      // shape the glass is; each clunk of the ratchet jolts it. Brought
      // round: the line, fitted to its height and carried along it by the
      // drag, and everything behind it let go into the dark.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const fitY = FLOOR + 0.92 + BOOK_Y;
      const d0 = Math.max(0.5 / tan, 0.85 / (tan * camera.aspect));
      if (Math.abs(pointer.x) <= 1 && !drag && !chosen) lean.lerp(pointer, 0.03); else lean.multiplyScalar(0.95);
      const jolt = shown && q < 4 && within >= 1 ? Math.max(0, 1 - (q - step - 1 / 1.8) * 12) * 0.018 : 0;
      rest.pos.set(lean.x * 0.12, fitY + 0.28 + lean.y * 0.04 - jolt, d0);
      rest.look.set(0, fitY - 0.04 - jolt, -0.3);
      const r = rows.find((x) => x.side === shown);
      const eye = span(u, 0.45, 1);
      if (r) {
        const d1 = (H / 2 + 0.12) / tan;
        const end = dirOf(r.side) * (r.cases.length - 1) * SW;
        const lo = Math.min(0, end), hi = Math.max(0, end);
        pan.max = hi - lo;
        if (!drag) { pan.to += pan.v * dt; pan.v *= Math.pow(0.03, dt); }
        pan.to = Math.min(hi, Math.max(lo, pan.to));
        pan.x += (pan.to - pan.x) * Math.min(1, k * 1.6);
        const cy = FLOOR + 0.12 + H / 2;
        near.pos.set(pan.x, cy, CZF + d1);
        near.look.set(pan.x, cy, CZF);
        lamp.position.set(pan.x, cy + 0.6, CZF + 1.4);
        lamp.intensity = 2.4 * eye;
        fog.near = THREE.MathUtils.lerp(3.5, d1 + 0.2, eye);
        fog.far = THREE.MathUtils.lerp(11, d1 + 0.9, eye);
      } else { lamp.intensity = 0; fog.near = 3.5; fog.far = 11; }
      camera.position.lerpVectors(rest.pos, r ? near.pos : rest.pos, eye);
      look.lerpVectors(rest.look, r ? near.look : rest.look, eye);
      camera.lookAt(look);
    };
  };
}
