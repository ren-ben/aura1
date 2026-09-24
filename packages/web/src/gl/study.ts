// The study: a desk under a lancet window, where the books being read lie
// between readings. Built in three dimensions and drawn through the same
// dither as the stacks, so it is the same charcoal as the rest of the house.
// On the desk: your books in a pile, each its own volume with its name on the
// spine; a skull with a candle guttering on it, which is the light in here;
// an hourglass, an inkwell with its quill, and loose leaves with workings on
// them. Behind, the moon through the tracery.
import * as THREE from 'three';
import { rng, type Build } from './engine';
import { moonDisc, starfield } from './plate';

export type DeskBook = {
  title: string;
  author: string;
  read: number;      // percent
  chapters: number;
  kept: number;
  format: string;
  sigil: string;     // an svg path in a 24 unit box
  seed: number;
};
export type DeskHooks = {
  pick: (index: number) => void;   // a book clicked
  hover: (index: number) => void;  // -1 when none
  out: () => number;               // the book taken from the pile, or -1
};

const INK = '#e6e0d4', DIM = '#8a8378';
const grey = (v: number) => new THREE.Color(v, v, v);
const lambert = (v: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color: grey(v), ...extra });

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
const texture = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// A spine: leather, two raised bands, dotted rules at head and foot, his
// sigil, the title, who wrote it and what is kept, and the moon of how far.
function paintSpine(g: CanvasRenderingContext2D, w: number, h: number, b: DeskBook): void {
  const leather = g.createLinearGradient(0, 0, 0, h);
  leather.addColorStop(0, '#3a352f'); leather.addColorStop(0.25, '#1f1d1a'); leather.addColorStop(0.7, '#171513'); leather.addColorStop(1, '#34302a');
  g.fillStyle = leather; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(197,188,171,.22)';
  for (const x of [h * 1.3, w - h * 1.9]) g.fillRect(x, 0, h * 0.09, h);
  g.strokeStyle = 'rgba(197,188,171,.45)'; g.lineWidth = Math.max(1, h * 0.03); g.setLineDash([h * 0.05, h * 0.07]);
  g.beginPath(); g.moveTo(h * 0.2, h * 0.12); g.lineTo(w - h * 0.2, h * 0.12); g.moveTo(h * 0.2, h * 0.88); g.lineTo(w - h * 0.2, h * 0.88); g.stroke();
  g.setLineDash([]);
  // The sigil, drawn from the same path as on the web.
  g.save();
  g.translate(h * 0.2, h * 0.2); g.scale((h * 0.6) / 24, (h * 0.6) / 24);
  g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(new Path2D(b.sigil));
  g.restore();
  // The moon, filling as it is read.
  const mx = w - h * 0.95, my = h / 2, r = h * 0.24, p = b.read / 100;
  g.strokeStyle = INK; g.lineWidth = h * 0.04;
  g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK; g.beginPath();
  g.arc(mx, my, r, -Math.PI / 2, Math.PI / 2, false);
  g.ellipse(mx, my, r * Math.abs(1 - 2 * p), r, 0, Math.PI / 2, -Math.PI / 2, p < 0.5);
  g.fill();
  // The name, and what is known of it.
  const x0 = h * 1.6, room = w - h * 1.6 - h * 2.1;
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  let size = h * 0.5;
  g.font = `${size}px UnifrakturMaguntia, serif`;
  while (g.measureText(b.title).width > room && size > h * 0.3) { size *= 0.94; g.font = `${size}px UnifrakturMaguntia, serif`; }
  let title = b.title;
  while (g.measureText(title).width > room && title.length > 4) title = `${title.slice(0, -2)}…`;
  g.fillText(title, x0, h * 0.58);
  g.fillStyle = DIM;
  g.font = `${h * 0.16}px Silkscreen, monospace`;
  const meta = `${b.author} // ${b.chapters} ch // ${b.kept} kept // ${b.read}%`.toUpperCase();
  g.fillText(meta.length > 60 ? `${meta.slice(0, 59)}…` : meta, x0, h * 0.8);
}

// A cover seen from above: tooled frame, and a lozenge with a star in it.
function paintCover(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  g.fillStyle = '#26221e'; g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = 'rgba(197,188,171,.5)'; g.lineWidth = 3; g.setLineDash([6, 8]);
  g.strokeRect(w * 0.06, h * 0.1, w * 0.88, h * 0.8);
  g.setLineDash([]); g.lineWidth = 2;
  g.strokeRect(w * 0.09, h * 0.16, w * 0.82, h * 0.68);
  const cx = w / 2, cy = h / 2, s = h * 0.22;
  g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.3, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 1.3, cy); g.closePath(); g.stroke();
  g.beginPath(); g.arc(cx, cy, s * 0.45, 0, Math.PI * 2); g.stroke();
}

// The edges of the leaves, as seen at a book's head, tail and fore-edge.
function paintPages(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#cfc7b6'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,34,26,.35)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
}

// A leaf of workings: a circle, a star in it, and lines of a hand nobody reads.
function paintLeaf(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const r = rng(seed);
  g.fillStyle = '#d2cab9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 60;
    const stain = g.createRadialGradient(x, y, 0, x, y, rad);
    stain.addColorStop(0, 'rgba(90,78,58,.25)'); stain.addColorStop(1, 'rgba(90,78,58,0)');
    g.fillStyle = stain; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = '#1e1a15'; g.lineWidth = 3;
  const cx = w * 0.3, cy = h * 0.5, rad = h * 0.32;
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(cx, cy, rad * 0.82, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad * 0.8, y = cy + Math.sin(a) * rad * 0.8;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const y = h * 0.2 + i * h * 0.1;
    g.beginPath(); g.moveTo(w * 0.58, y);
    for (let x = w * 0.58; x < w * (0.9 - r() * 0.1); x += 8) g.lineTo(x, y + (r() - 0.5) * 5);
    g.stroke();
  }
}

// Wood with its grain, for the desk.
function paintWood(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#2a2521'; g.fillRect(0, 0, w, h);
  const r = rng(41);
  for (let i = 0; i < 90; i++) {
    const y = r() * h;
    g.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '197,188,171'},${0.08 + r() * 0.14})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 6);
    g.stroke();
  }
}

// A pointed arch: two arcs, each struck from the other's springing.
function lancet(cx: number, y0: number, w: number, h: number, path: THREE.Path = new THREE.Shape()): THREE.Path {
  const l = cx - w / 2, rr = cx + w / 2;
  path.moveTo(l, y0);
  path.lineTo(l, y0 + h);
  path.absarc(rr, y0 + h, w, Math.PI, (Math.PI * 2) / 3, true);
  path.absarc(l, y0 + h, w, Math.PI / 3, 0, true);
  path.lineTo(rr, y0);
  path.lineTo(l, y0);
  return path;
}

// The night outside the glass, drawn like every other sky on the console: a
// cratered moon with its halo, a thin scatter of stars, and cloud across it.
function paintSky(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  starfield(g, w, h, 420, 23);
  const r = rng(5);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = '#fff';
    const x = r() * w, y = r() * h * 0.8, s = 2 + r() * 2;
    g.fillRect(x - s, y, s * 2 + 1, 1); g.fillRect(x, y - s, 1, s * 2 + 1);
  }
  moonDisc(g, w * 0.62, h * 0.3, w * 0.14, 11);
  for (let i = 0; i < 4; i++) {
    const y = h * (0.26 + i * 0.07), band = g.createLinearGradient(0, y - 10, 0, y + 10);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, 'rgba(0,0,0,.55)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band; g.fillRect(0, y - 10, w, 20);
  }
}

// Ashlar: the wall laid in courses of dark stone, each block its own shade.
function paintStone(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = rng(29);
  const rows = 14, bh = h / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -bh : 0;
    while (x < w) {
      const bw = bh * (1.6 + r() * 1.4), v = 18 + r() * 16;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`;
      g.fillRect(x + 2, row * bh + 2, bw - 4, 2);
      x += bw;
    }
  }
}

// A circle of summoning chalked on the desk: rings, the houses, a star, and
// letters nobody reads, turning slowly under the pile.
function paintCircle(g: CanvasRenderingContext2D, s: number): void {
  g.clearRect(0, 0, s, s);
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  const c = s / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  for (const [rad, lw] of [[0.47, 5], [0.43, 2], [0.3, 3], [0.27, 1.5]] as const) {
    g.lineWidth = lw; g.beginPath(); g.arc(c, c, s * rad, 0, Math.PI * 2); g.stroke();
  }
  g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const x = c + Math.cos(a) * s * 0.3, y = c + Math.sin(a) * s * 0.3;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  const r = rng(61);
  g.font = `${s * 0.04}px UnifrakturMaguntia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const letters = 'ABRAXASIAOSABAOTHADONAIELOHIMAGLA';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * s * 0.365, c + Math.sin(a) * s * 0.365); g.rotate(a + Math.PI / 2);
    g.fillText(letters[i % letters.length]!, 0, 0); g.restore();
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    g.beginPath(); g.arc(c + Math.cos(a) * s * 0.45, c + Math.sin(a) * s * 0.45, s * 0.018, 0, Math.PI * 2); g.fill();
  }
}

export function study(books: DeskBook[], hooks: DeskHooks): Build {
  return ({ scene, camera, canvas: glass }) => {
    camera.fov = 34;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(0x000000, 3.8, 8);
    // Everything made here that holds GPU memory, let go when the room is.
    const held: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => { held.push(x); return x; };
    glass.addEventListener('aura:dispose', () => held.forEach((x) => x.dispose()), { once: true });
    const basic = (params: THREE.MeshBasicMaterialParameters) => keep(new THREE.MeshBasicMaterial(params));

    // ---- light ------------------------------------------------------------
    // Almost none. The room is lit by the candle and the moon, and the pile by
    // a reading lamp overhead, so the books are the brightest thing in it.
    scene.add(new THREE.AmbientLight(0xffffff, 0.05));
    const moonlight = new THREE.DirectionalLight(0xffffff, 0.35);
    moonlight.position.set(1.2, 2.5, -2.5);
    scene.add(moonlight);
    const lamp = new THREE.SpotLight(0xffffff, 9, 6, 0.42, 0.75, 1.2);
    lamp.position.set(-0.9, 2.6, 1.6);
    lamp.target.position.set(-0.15, 0.1, 0.2);
    scene.add(lamp, lamp.target);

    // ---- the wall and its window ------------------------------------------
    const WX = 0.75, WY = 0.55, WW = 0.95, WH = 0.62;
    const [stoneC, stoneG] = canvas(1024, 1024);
    paintStone(stoneG, 1024, 1024);
    const stone = keep(texture(stoneC));
    stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
    stone.repeat.set(2.4, 2.4);
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-5, -2); wallShape.lineTo(5, -2); wallShape.lineTo(5, 5); wallShape.lineTo(-5, 5); wallShape.lineTo(-5, -2);
    wallShape.holes.push(lancet(WX, WY, WW, WH, new THREE.Path()));
    const wallGeo = keep(new THREE.ShapeGeometry(wallShape, 24));
    const uv = wallGeo.attributes.position!;
    const uvs = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { uvs[i * 2] = (uv.getX(i) + 5) / 10; uvs[i * 2 + 1] = (uv.getY(i) + 2) / 7; }
    wallGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const wall = new THREE.Mesh(wallGeo, keep(new THREE.MeshLambertMaterial({ map: stone })));
    wall.position.z = -1.35;
    scene.add(wall);

    // The window's stone: a deep reveal, two lights under a round, the sill.
    const stoneMat = keep(new THREE.MeshLambertMaterial({ color: grey(0.34) }));
    const frameShape = lancet(WX, WY - 0.09, WW + 0.22, WH + 0.09) as THREE.Shape;
    frameShape.holes.push(lancet(WX, WY, WW, WH, new THREE.Path()));
    const frame = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(frameShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 32 })), stoneMat);
    frame.position.z = -1.5;
    scene.add(frame);
    const apex = WY + WH + WW * Math.sin(Math.PI / 3);
    // Two narrow lancets inside the big one, and a round over them.
    const inner = new THREE.Shape();
    inner.moveTo(WX - WW / 2, WY); inner.lineTo(WX + WW / 2, WY); inner.lineTo(WX + WW / 2, apex); inner.lineTo(WX - WW / 2, apex); inner.lineTo(WX - WW / 2, WY);
    const lw = WW * 0.4, lh = WH * 0.95;
    inner.holes.push(lancet(WX - WW * 0.23, WY, lw, lh, new THREE.Path()));
    inner.holes.push(lancet(WX + WW * 0.23, WY, lw, lh, new THREE.Path()));
    const roundR = WW * 0.17, roundY = WY + lh + lw * 0.87 + roundR * 1.05;
    const oculus = new THREE.Path(); oculus.absarc(WX, roundY, roundR, 0, Math.PI * 2, true);
    inner.holes.push(oculus);
    const tracery = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(inner, { depth: 0.05, bevelEnabled: false, curveSegments: 32 })), stoneMat);
    // Only the tracery inside the arch shows: the wall covers the rest.
    tracery.position.z = -1.43;
    scene.add(tracery);
    const cusps = new THREE.Mesh(keep(new THREE.TorusGeometry(roundR * 0.55, 0.012, 6, 4)), stoneMat);
    cusps.position.set(WX, roundY, -1.4);
    cusps.rotation.z = Math.PI / 4;
    scene.add(cusps);
    const sill = new THREE.Mesh(keep(new THREE.BoxGeometry(WW + 0.4, 0.06, 0.34)), stoneMat);
    sill.position.set(WX, WY - 0.12, -1.3);
    scene.add(sill);
    // A candle guttered out on the sill, long ago.
    const stub = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.035, 0.09, 12)), keep(new THREE.MeshLambertMaterial({ color: grey(0.6) })));
    stub.position.set(WX + WW * 0.34, WY - 0.045, -1.24);
    scene.add(stub);

    // Outside.
    const [skyC, skyG] = canvas(1024, 1024);
    paintSky(skyG, 1024, 1024);
    const sky = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, 2.6)), basic({ map: keep(texture(skyC)), fog: false }));
    sky.position.set(WX - 0.5, 0.78, -2.1);
    scene.add(sky);
    // Its light, coming in across the desk, faint enough to be a scatter.
    const beamGeo = keep(new THREE.BufferGeometry());
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      WX - WW / 2, WY + WH, -1.36, WX + WW / 2, WY + WH, -1.36, WX - 0.15, 0.004, 0.6,
      WX - WW / 2, WY + WH, -1.36, WX - 0.15, 0.004, 0.6, WX - 1.2, 0.004, 0.45,
    ]), 3));
    scene.add(new THREE.Mesh(beamGeo, basic({ color: 0xffffff, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide })));

    // ---- the desk -----------------------------------------------------------
    const [woodC, woodG] = canvas(1024, 512);
    paintWood(woodG, 1024, 512);
    const woodMat = keep(new THREE.MeshLambertMaterial({ map: keep(texture(woodC)) }));
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(4.4, 0.12, 1.9)), woodMat);
    top.position.set(0, -0.06, -0.25);
    scene.add(top);
    const carved = keep(new THREE.MeshLambertMaterial({ color: grey(0.22) }));
    const lip = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 4.46, 12)), carved);
    lip.rotation.z = Math.PI / 2;
    lip.position.set(0, -0.03, 0.7);
    scene.add(lip);
    const apron = new THREE.Mesh(keep(new THREE.BoxGeometry(4.3, 0.5, 0.06)), keep(new THREE.MeshLambertMaterial({ color: grey(0.08) })));
    apron.position.set(0, -0.35, 0.64);
    scene.add(apron);

    // The circle under the pile, chalked and faintly alight.
    const [circleC, circleG] = canvas(1024, 1024);
    paintCircle(circleG, 1024);
    const circleTex = keep(texture(circleC));
    const circle = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.9, 1.9)),
      basic({ map: circleTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(-0.15, 0.002, 0.18);
    scene.add(circle);

    // ---- the skull and its candle ---------------------------------------------
    const bone = keep(new THREE.MeshLambertMaterial({ color: grey(0.62) }));
    const hollow = basic({ color: 0x000000 });
    const skull = new THREE.Group();
    const cranium = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 40, 30)), bone);
    cranium.scale.set(0.96, 0.9, 1.15);
    cranium.position.set(0, 0.27, -0.02);
    skull.add(cranium);
    const face = new THREE.Mesh(keep(new THREE.SphereGeometry(0.16, 32, 24)), bone);
    face.scale.set(0.95, 0.85, 0.75);
    face.position.set(0, 0.17, 0.09);
    skull.add(face);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 16, 12)), bone);
      cheek.position.set(s * 0.1, 0.12, 0.13);
      skull.add(cheek);
      const socket = new THREE.Mesh(keep(new THREE.SphereGeometry(0.055, 20, 16)), hollow);
      socket.scale.set(1, 0.95, 0.55);
      socket.position.set(s * 0.068, 0.2, 0.19);
      skull.add(socket);
    }
    const nose = new THREE.Mesh(keep(new THREE.ConeGeometry(0.028, 0.065, 3)), hollow);
    nose.rotation.x = Math.PI;
    nose.position.set(0, 0.125, 0.205);
    skull.add(nose);
    const jaw = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.085, 0.07, 24, 1, false, -Math.PI / 2, Math.PI)), bone);
    jaw.position.set(0, 0.04, 0.08);
    skull.add(jaw);
    const toothGeo = keep(new THREE.BoxGeometry(0.018, 0.03, 0.02));
    for (let i = 0; i < 8; i++) {
      const a = -0.95 + (i / 7) * 1.9;
      const tooth = new THREE.Mesh(toothGeo, bone);
      tooth.position.set(Math.sin(a) * 0.1, 0.085, 0.08 + Math.cos(a) * 0.085);
      tooth.rotation.y = a;
      skull.add(tooth);
    }
    const wax = keep(new THREE.MeshLambertMaterial({ color: grey(0.85) }));
    const candle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.046, 0.3, 20)), wax);
    candle.position.y = 0.6;
    skull.add(candle);
    for (const [x, z, len] of [[0.04, 0.02, 0.2], [-0.035, 0.03, 0.28], [0.01, -0.04, 0.14], [0.12, 0.08, 0.1]] as const) {
      const drip = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.011, len, 4, 8)), wax);
      drip.position.set(x, 0.6 - len / 2, z);
      skull.add(drip);
    }
    const pool = new THREE.Mesh(keep(new THREE.SphereGeometry(0.1, 20, 8)), wax);
    pool.scale.set(1, 0.22, 1);
    pool.position.y = 0.44;
    skull.add(pool);
    const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.028, 16, 12)), basic({ color: 0xffffff }));
    flame.position.y = 0.8;
    skull.add(flame);
    const [haloC, haloG] = canvas(128, 128);
    const glow = haloG.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255,255,255,.6)'); glow.addColorStop(0.35, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    haloG.fillStyle = glow; haloG.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(texture(haloC)), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })));
    halo.scale.set(0.7, 0.7, 1);
    halo.position.y = 0.8;
    skull.add(halo);
    const candlelight = new THREE.PointLight(0xffffff, 2.6, 3.4, 1.5);
    candlelight.position.y = 0.84;
    skull.add(candlelight);
    skull.position.set(0.8, 0, -0.05);
    skull.rotation.y = -0.5;
    scene.add(skull);

    // ---- the hourglass --------------------------------------------------------
    const brass = keep(new THREE.MeshLambertMaterial({ color: grey(0.4) }));
    const hourglass = new THREE.Group();
    const cap = keep(new THREE.CylinderGeometry(0.13, 0.14, 0.035, 20));
    for (const y of [0.018, 0.46]) { const m = new THREE.Mesh(cap, brass); m.position.y = y; hourglass.add(m); }
    const post = keep(new THREE.CylinderGeometry(0.009, 0.009, 0.43, 6));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const m = new THREE.Mesh(post, brass);
      m.position.set(Math.cos(a) * 0.11, 0.24, Math.sin(a) * 0.11);
      hourglass.add(m);
    }
    const bulb = [0.02, 0.085, 0.1, 0.085, 0.03, 0.01, 0.03, 0.085, 0.1, 0.085, 0.02].map((x, i) => new THREE.Vector2(x, 0.035 + i * 0.039));
    hourglass.add(new THREE.Mesh(keep(new THREE.LatheGeometry(bulb, 24)),
      keep(new THREE.MeshLambertMaterial({ color: grey(0.9), transparent: true, opacity: 0.22, depthWrite: false }))));
    const sand = new THREE.Mesh(keep(new THREE.ConeGeometry(0.075, 0.07, 20)), keep(new THREE.MeshLambertMaterial({ color: grey(0.8) })));
    sand.position.y = 0.075;
    hourglass.add(sand);
    hourglass.position.set(-1.2, 0, -0.55);
    scene.add(hourglass);

    // ---- the inkwell and its quill ----------------------------------------------
    const ink = new THREE.Group();
    const well = new THREE.Mesh(keep(new THREE.LatheGeometry(
      [[0, 0], [0.12, 0], [0.13, 0.03], [0.12, 0.08], [0.06, 0.11], [0.05, 0.15], [0.06, 0.16], [0, 0.16]].map(([x, y]) => new THREE.Vector2(x, y)), 24)),
      keep(new THREE.MeshLambertMaterial({ color: grey(0.2) })));
    ink.add(well);
    const vane = new THREE.Shape();
    vane.moveTo(0, 0); vane.quadraticCurveTo(0.09, 0.32, 0.03, 0.66); vane.quadraticCurveTo(-0.05, 0.34, 0, 0);
    const quill = new THREE.Mesh(keep(new THREE.ShapeGeometry(vane, 16)), keep(new THREE.MeshLambertMaterial({ color: grey(0.9), side: THREE.DoubleSide })));
    quill.position.set(0, 0.14, 0);
    quill.rotation.set(-0.3, 0.5, 0.4);
    ink.add(quill);
    ink.position.set(-1.05, 0, 0.45);
    scene.add(ink);

    // ---- loose leaves ---------------------------------------------------------
    [[0.55, 0.45, 0.4, 11], [-0.95, -0.2, -0.35, 12]].forEach(([x, z, turn, seed]) => {
      const [c, g] = canvas(512, 360);
      paintLeaf(g, 512, 360, seed!);
      const leaf = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.6, 0.42)), keep(new THREE.MeshLambertMaterial({ map: keep(texture(c)) })));
      leaf.rotation.set(-Math.PI / 2, 0, turn!);
      leaf.position.set(x!, 0.004, z!);
      scene.add(leaf);
    });

    // ---- motes in the lamp's light ------------------------------------------------
    const MOTES = 70;
    const motePos = new Float32Array(MOTES * 3), moteCol = new Float32Array(MOTES * 3), moteSeed = new Float32Array(MOTES);
    const mr = rng(3);
    for (let i = 0; i < MOTES; i++) {
      motePos.set([-0.9 + mr() * 1.6, mr() * 1.6, -0.4 + mr() * 1.2], i * 3);
      moteSeed[i] = mr() * 100;
    }
    const moteGeo = keep(new THREE.BufferGeometry());
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('color', new THREE.BufferAttribute(moteCol, 3));
    scene.add(new THREE.Points(moteGeo, keep(new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, fog: false }))));

    // ---- the pile -------------------------------------------------------------
    // Newest on top. Each book is a group, so it can be slid and lifted, with
    // a line drawn round it while the pointer is on it.
    const D = 0.72;
    const covers: THREE.Mesh[] = [];
    const outlineMat = basic({ color: 0xffffff, side: THREE.BackSide });
    const pile = books.map((b, i) => {
      const f = rng(b.seed);
      const L = 1.05 + f() * 0.28, t = 0.13 + Math.min(0.07, b.chapters * 0.0025);
      const spineH = Math.max(48, Math.round((1024 * t) / L));
      const [sc, sg] = canvas(1024, spineH);
      const [cc, cg] = canvas(512, Math.round((512 * D) / L));
      const [pc, pg] = canvas(128, 64);
      paintCover(cg, cc.width, cc.height, b.seed);
      paintPages(pg, 128, 64);
      const pages = keep(texture(pc));
      const spine = keep(texture(sc));
      const draw = () => { paintSpine(sg, 1024, spineH, b); spine.needsUpdate = true; };
      draw();
      const spineMat = keep(new THREE.MeshLambertMaterial({ map: spine, emissive: 0xffffff, emissiveMap: spine, emissiveIntensity: 0.35 }));
      // The faces: +x, -x the head and tail, +y the cover, -y the back
      // cover, +z the spine to you, -z the fore-edge.
      const pageMat = keep(new THREE.MeshLambertMaterial({ map: pages }));
      const mats = [pageMat, pageMat, keep(new THREE.MeshLambertMaterial({ map: keep(texture(cc)) })),
        keep(new THREE.MeshLambertMaterial({ color: grey(0.1) })), spineMat, pageMat];
      const geo = keep(new THREE.BoxGeometry(L, t, D));
      const mesh = new THREE.Mesh(geo, mats);
      mesh.userData.index = i;
      covers.push(mesh);
      const outline = new THREE.Mesh(geo, outlineMat);
      outline.scale.set(1 + 0.03 / L, 1 + 0.03 / t, 1 + 0.03 / D);
      outline.visible = false;
      const group = new THREE.Group();
      group.add(outline, mesh);
      scene.add(group);
      return { group, outline, spineMat, t, x: -0.15 + (f() - 0.5) * 0.22, z: 0.22 + (f() - 0.5) * 0.12, yaw: (f() - 0.5) * 0.45, draw, y: 0 };
    });
    // The fonts arrive after the first paint; the spines are painted again.
    document.fonts?.ready.then(() => pile.forEach((p) => p.draw()));
    const rest = () => {
      let y = 0;
      const out = hooks.out();
      for (let i = pile.length - 1; i >= 0; i--) {
        const p = pile[i]!;
        p.y = y + p.t / 2;
        if (i !== out) y += p.t;
      }
    };
    rest();
    pile.forEach((p) => { p.group.position.set(p.x, p.y, p.z); p.group.rotation.y = p.yaw; });

    // ---- looking, and picking ---------------------------------------------------
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2(9, 9);
    let hovered = -1, down: { x: number; y: number } | null = null;
    const aim = (e: PointerEvent) => {
      const b = glass.getBoundingClientRect();
      pointer.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    };
    const hit = () => {
      ray.setFromCamera(pointer, camera);
      const h = ray.intersectObjects(covers, false)[0];
      return h ? (h.object.userData.index as number) : -1;
    };
    const onMove = (e: PointerEvent) => {
      aim(e);
      const i = hit();
      if (i !== hovered) { hovered = i; hooks.hover(i); glass.style.cursor = i >= 0 ? 'pointer' : ''; }
    };
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; aim(e); };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 8) { down = null; return; }
      down = null;
      aim(e);
      const i = hit();
      if (i >= 0) hooks.pick(i);
    };
    const onLeave = () => { pointer.set(9, 9); if (hovered >= 0) { hovered = -1; hooks.hover(-1); } };
    glass.addEventListener('pointermove', onMove);
    glass.addEventListener('pointerdown', onDown);
    glass.addEventListener('pointerup', onUp);
    glass.addEventListener('pointerleave', onLeave);

    // The pile's height sets where the eye rests: the top book is always in view.
    const height = pile.reduce((a, p) => a + p.t, 0);
    const eye = new THREE.Vector3(-0.05, 1.3, 2.75), look = new THREE.Vector3(-0.05, Math.min(0.45, 0.15 + height * 0.5), -0.2);
    const lean = new THREE.Vector2();
    return (t, dt) => {
      const k = 1 - Math.pow(0.004, dt);
      // The candle gutters; the light on everything breathes with it.
      const f = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1) * 0.3 + Math.sin(t * 2.1) * 0.2;
      flame.scale.set(1 - f * 0.08, 1.9 + f * 0.25, 1 - f * 0.08);
      candlelight.intensity = 2.6 + f * 0.5;
      halo.material.opacity = 0.8 + f * 0.2;
      circle.rotation.z = t * 0.03;
      (circle.material as THREE.MeshBasicMaterial).opacity = 0.34 + Math.sin(t * 0.7) * 0.08;
      // Motes rise through the light, and catch it as they turn.
      for (let i = 0; i < MOTES; i++) {
        const s = moteSeed[i]!;
        let y = motePos[i * 3 + 1]! + dt * (0.02 + (s % 1) * 0.03);
        if (y > 1.7) y = 0.05;
        motePos[i * 3 + 1] = y;
        motePos[i * 3] = motePos[i * 3]! + Math.sin(t * 0.5 + s) * dt * 0.02;
        const v = Math.max(0, Math.sin(t * (0.8 + (s % 3) * 0.4) + s)) * 0.9;
        moteCol.set([v, v, v], i * 3);
      }
      moteGeo.attributes.position!.needsUpdate = true;
      moteGeo.attributes.color!.needsUpdate = true;
      // The room leans a little toward the pointer, as a head would.
      if (Math.abs(pointer.x) <= 1) lean.lerp(pointer, 0.04); else lean.multiplyScalar(0.96);
      // A narrow glass stands further back, so the whole desk is still in it.
      const back = Math.max(0, 1.5 - camera.aspect) * 1.6;
      camera.position.set(eye.x + lean.x * 0.16, eye.y + lean.y * 0.07 + back * 0.3, eye.z + back);
      camera.lookAt(look);
      // The pile: the book taken slides off toward the hall, the ones above
      // it come down, the one under the pointer comes out to meet you, lit.
      rest();
      const out = hooks.out();
      const clear = out < 0 || pile[out]!.group.position.x - pile[out]!.x > 1.6;
      pile.forEach((p, i) => {
        const on = i === hovered && i !== out;
        p.outline.visible = on;
        p.spineMat.emissiveIntensity += ((on ? 0.8 : 0.35) - p.spineMat.emissiveIntensity) * k;
        const x = p.x + (i === out ? 3.4 : 0) + (on ? -0.04 : 0);
        const z = p.z + (on ? 0.18 : 0);
        p.group.position.x += (x - p.group.position.x) * k;
        p.group.position.z += (z - p.group.position.z) * k;
        p.group.position.y += ((clear ? p.y : p.group.position.y) - p.group.position.y) * k;
      });
    };
  };
}
