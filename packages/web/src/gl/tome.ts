// A book off the Goodreads shelf, made solid: boards with a bevel and a
// square over the leaves, a rounded spine with raised bands, the edges of the
// leaves at head, tail and fore-edge, and its own cover on the front board.
// It lies on its back, cover up to +z, spine to -x. Opened, the front board
// swings over to lie flat and the leaves turn after it one by one, each one
// bending as a leaf of paper does, lifted by its edge and falling over.
import * as THREE from 'three';
import { rng } from './engine';

export type Held = <T extends { dispose: () => void }>(x: T) => T;

const grey = (v: number) => new THREE.Color(v, v, v);

export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A leaf of print: a running head, a column of lines, a folio.
function paintLeaf(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const r = rng(seed);
  g.fillStyle = '#ddd6c6'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,34,26,.6)';
  g.fillRect(w * 0.32, h * 0.07, w * 0.36, 3);
  for (let y = h * 0.13; y < h * 0.9; y += h * 0.026) {
    if (r() < 0.05) { y += h * 0.02; continue; }
    g.fillRect(w * 0.13, y, w * (0.66 + r() * 0.1), 2);
  }
  g.fillRect(w * 0.47, h * 0.94, w * 0.06, 3);
  // The gutter darkens where the leaf goes into the binding.
  const gutter = g.createLinearGradient(0, 0, w * 0.12, 0);
  gutter.addColorStop(0, 'rgba(0,0,0,.35)'); gutter.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gutter; g.fillRect(0, 0, w * 0.12, h);
}

// The edges of the leaves: fine lines, a little uneven.
function paintEdge(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#d4ccbb'; g.fillRect(0, 0, w, h);
  const r = rng(3);
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(40,34,26,${0.12 + r() * 0.3})`; g.fillRect(0, y, w, 1); }
}

// The inside of the board: marbled endpaper.
function paintEndpaper(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#6d665b'; g.fillRect(0, 0, w, h);
  const r = rng(7);
  g.strokeStyle = 'rgba(20,18,16,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = r() * h;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 12) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 8 + Math.sin(x * 0.013 + i * 3) * 14);
    g.stroke();
  }
}

// Until the cover arrives, and if it never does: a tooled board with the title.
function paintBlank(g: CanvasRenderingContext2D, w: number, h: number, title: string): void {
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(197,188,171,.6)'; g.lineWidth = 4;
  g.strokeRect(w * 0.07, h * 0.05, w * 0.86, h * 0.9);
  g.fillStyle = '#e6e0d4'; g.textAlign = 'center';
  g.font = `${w * 0.11}px UnifrakturMaguntia, serif`;
  let line = '', y = h * 0.34;
  for (const word of title.split(' ')) {
    if (g.measureText(`${line} ${word}`).width > w * 0.76 && line) { g.fillText(line, w / 2, y); y += w * 0.14; line = word; } else line = line ? `${line} ${word}` : word;
  }
  g.fillText(line, w / 2, y);
}

// A board: a rounded rectangle with a bevelled edge, from the hinge at x = 0.
function boardGeometry(w: number, h: number, t: number): THREE.ExtrudeGeometry {
  const r = 0.02, s = new THREE.Shape();
  s.moveTo(0, -h / 2); s.lineTo(w - r, -h / 2); s.quadraticCurveTo(w, -h / 2, w, -h / 2 + r);
  s.lineTo(w, h / 2 - r); s.quadraticCurveTo(w, h / 2, w - r, h / 2); s.lineTo(0, h / 2); s.lineTo(0, -h / 2);
  const bevel = t * 0.35;
  const g = new THREE.ExtrudeGeometry(s, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -t / 2 + bevel);
  // The front face's picture runs corner to corner.
  const uv = g.attributes.uv!, pos = g.attributes.position!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w, pos.getY(i) / h + 0.5);
  return g;
}

export type TomeModel = {
  group: THREE.Group;       // the whole book, lying on its back
  board: THREE.Group;       // the front board's hinge
  leaves: { pivot: THREE.Group; geo: THREE.BufferGeometry; base: number }[];
  size: { w: number; h: number; t: number };
  faces: THREE.Object3D[];  // what a pointer can land on
};

const SEG = 14;

export function tome(cover: string | null, title: string, pages: number | null, keep: Held, leafCount = 7): TomeModel {
  // As fat as it is long: a novella is a board or two, Dumas a brick.
  const h = 1, w = 0.68, t = 0.06 + Math.min(0.3, (pages ?? 300) / 5000);
  const board = 0.028, sq = 0.022;              // board thickness, and how far it stands proud of the leaves
  const group = new THREE.Group();
  const edgeMat = keep(new THREE.MeshLambertMaterial({ map: keep(canvasTexture(64, 128, (g) => paintEdge(g, 64, 128))) }));
  const leather = keep(new THREE.MeshLambertMaterial({ color: grey(0.14) }));
  const band = keep(new THREE.MeshLambertMaterial({ color: grey(0.34) }));
  const endpaper = keep(new THREE.MeshLambertMaterial({ map: keep(canvasTexture(256, 384, (g) => paintEndpaper(g, 256, 384))) }));

  // The cover: unlit, so the picture survives the dark of the room; etched
  // harder than the photograph, or the dither makes it one grey.
  const blank = keep(canvasTexture(256, 384, (g) => paintBlank(g, 256, 384, title)));
  document.fonts?.ready.then(() => { paintBlank((blank.image as HTMLCanvasElement).getContext('2d')!, 256, 384, title); blank.needsUpdate = true; });
  const front = keep(new THREE.MeshBasicMaterial({ map: blank }));
  if (cover) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tex = keep(canvasTexture(384, 576, (g) => { g.filter = 'grayscale(1) contrast(1.35)'; g.drawImage(img, 0, 0, 384, 576); }));
      tex.colorSpace = THREE.NoColorSpace;
      front.map = tex; front.needsUpdate = true;
    };
    img.src = cover;
  }

  const bw = w + sq, bh = h + sq * 2;
  const boardGeo = keep(boardGeometry(bw, bh, board));
  // The back board, the leaves on it, and the spine round them.
  const back = new THREE.Mesh(boardGeo, leather);
  back.position.set(-w / 2, 0, -t / 2 + board / 2);
  group.add(back);
  const blockT = t - board * 2;
  const block = new THREE.Mesh(keep(new THREE.BoxGeometry(w - 0.01, h, blockT)), [edgeMat, leather, edgeMat, edgeMat, edgeMat, edgeMat]);
  block.position.set(0.005, 0, 0);
  group.add(block);
  const spine = new THREE.Mesh(keep(new THREE.CylinderGeometry(t / 2, t / 2, bh, 20, 1, false, Math.PI, Math.PI)), leather);
  spine.position.x = -w / 2;
  group.add(spine);
  const bandGeo = keep(new THREE.CylinderGeometry(t / 2 + 0.006, t / 2 + 0.006, 0.022, 20, 1, false, Math.PI, Math.PI));
  for (const y of [-0.3, -0.1, 0.1, 0.3]) { const b = new THREE.Mesh(bandGeo, band); b.position.set(-w / 2, y * h, 0); group.add(b); }

  // The front board on its hinge: the cover out, the endpaper in.
  const hinge = new THREE.Group();
  hinge.position.set(-w / 2, 0, t / 2 - board / 2);
  const frontBoard = new THREE.Mesh(boardGeo, [front, leather]);
  hinge.add(frontBoard);
  const inside = new THREE.Mesh(keep(new THREE.PlaneGeometry(bw - 0.03, bh - 0.03)), endpaper);
  inside.rotation.y = Math.PI; inside.position.set(bw / 2, 0, -board / 2 - 0.001);
  hinge.add(inside);
  group.add(hinge);

  // Loose leaves over the block, each its own strip of paper that can bend.
  const lw = w - 0.03, lh = h - 0.03;
  const leaves = Array.from({ length: leafCount }, (_, i) => {
    const geo = keep(new THREE.PlaneGeometry(lw, lh, SEG, 1));
    const mat = keep(new THREE.MeshLambertMaterial({ map: keep(canvasTexture(256, 384, (g) => paintLeaf(g, 256, 384, 11 + i))), side: THREE.DoubleSide }));
    const pivot = new THREE.Group();
    const base = blockT / 2 + 0.001 + (leafCount - i) * 0.0015;
    pivot.position.set(-w / 2 + 0.012, 0, base);
    pivot.add(new THREE.Mesh(geo, mat));
    group.add(pivot);
    bend(geo, 0, 0, lw);
    return { pivot, geo, base };
  });
  return { group, board: hinge, leaves, size: { w, h, t }, faces: [frontBoard, block, back, spine] };
}

// A leaf bent along its width: angle is where its root points (0 flat on the
// right, pi flat on the left), curl how much the rest of it lags or leads.
function bend(geo: THREE.BufferGeometry, angle: number, curl: number, lw: number): void {
  const pos = geo.attributes.position!;
  const ds = lw / SEG;
  const xs = [0], zs = [0];
  let x = 0, z = 0;
  for (let i = 1; i <= SEG; i++) {
    const s = (i - 0.5) / SEG;
    const a = Math.min(Math.PI - 0.01, Math.max(0.005, angle + curl * s * s));
    x += Math.cos(a) * ds; z += Math.sin(a) * ds;
    xs.push(x); zs.push(z);
  }
  for (let v = 0; v < pos.count; v++) { const i = v % (SEG + 1); pos.setX(v, xs[i]!); pos.setZ(v, zs[i]!); }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// The book opening and shutting again: u runs 0 to 1 over the cycle. The
// board swings over, the leaves follow one at a time, lifted at the edge and
// falling flat, and at the end all of it comes back together.
export function riffle(m: TomeModel, u: number): void {
  const s = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  const open = s(u / 0.16) * (1 - s((u - 0.84) / 0.14));
  m.board.rotation.y = -(Math.PI - 0.02) * open;
  const lw = m.size.w - 0.03;
  m.leaves.forEach((leaf, i) => {
    const fwd = s((u - (0.2 + i * 0.075)) / 0.1);
    // Over and back: the ones turned last come home first.
    const home = s((u - (0.72 - i * 0.012)) / 0.12);
    const p = fwd * (1 - home);
    const angle = (Math.PI - 0.03 - i * 0.004) * p * open;
    // Lifted by its edge, a leaf leads with the edge; falling, the edge trails.
    const curl = Math.sin(p * Math.PI) * (home === 0 ? 0.9 : -0.9);
    bend(leaf.geo, angle, curl, lw);
    // Turned over, it lies on the open board, not in it.
    leaf.pivot.position.z = leaf.base + (angle / Math.PI) * (0.034 + i * 0.003);
  });
}
