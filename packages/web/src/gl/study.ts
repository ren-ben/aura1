// The study: a desk under a lancet window, where the books being read lie
// between readings. Built in three dimensions and drawn through the same
// dither as the stacks, so it is the same charcoal as the rest of the house.
// On the desk: your books in a pile, each its own volume with its name on the
// spine; a skull with a candle guttering on it, which is the light in here;
// an hourglass, an inkwell with its quill, and loose leaves with workings on
// them. Behind, the moon through the tracery.
import * as THREE from 'three';
import { rng, type Build } from './engine';

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

export function study(books: DeskBook[], hooks: DeskHooks): Build {
  return ({ scene, camera, canvas: glass }) => {
    camera.fov = 34;
    camera.updateProjectionMatrix();
    scene.fog = new THREE.Fog(0x000000, 4.5, 9);
    // Everything made here that holds GPU memory, let go when the room is.
    const held: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => { held.push(x); return x; };
    glass.addEventListener('aura:dispose', () => held.forEach((x) => x.dispose()), { once: true });

    // ---- the room -------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    // The reader's own lamp, low and to the left, off the edge of the glass:
    // what the spines are read by.
    const reading = new THREE.DirectionalLight(0xffffff, 1.1);
    reading.position.set(-2, 2.2, 3.5);
    scene.add(reading);
    const moonlight = new THREE.DirectionalLight(0xffffff, 0.75);
    moonlight.position.set(1.6, 3, -2.5);
    scene.add(moonlight);

    // The wall, with the window cut through it.
    const WX = 0.8, WY = 0.5, WW = 0.9, WH = 0.7;
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-5, -2); wallShape.lineTo(5, -2); wallShape.lineTo(5, 5); wallShape.lineTo(-5, 5); wallShape.lineTo(-5, -2);
    wallShape.holes.push(lancet(WX, WY, WW, WH, new THREE.Path()));
    const wall = new THREE.Mesh(keep(new THREE.ShapeGeometry(wallShape, 24)), lambert(0.2));
    wall.position.z = -1.35;
    scene.add(wall);
    // Stone courses on it, faintly.
    const courses = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const y = -1 + i * 0.55;
      const line = new THREE.Mesh(keep(new THREE.BoxGeometry(10, 0.012, 0.01)), lambert(0.1));
      line.position.set(0, y, -1.34);
      courses.add(line);
    }
    scene.add(courses);

    // The window: its frame of stone, a mullion, a transom, a round of tracery, the sill.
    const frameShape = lancet(WX, WY - 0.08, WW + 0.2, WH + 0.08) as THREE.Shape;
    frameShape.holes.push(lancet(WX, WY, WW, WH, new THREE.Path()));
    const frame = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(frameShape, { depth: 0.14, bevelEnabled: false, curveSegments: 24 })), lambert(0.42));
    frame.position.z = -1.42;
    scene.add(frame);
    const apex = WY + WH + WW * Math.sin(Math.PI / 3);
    const stoneBar = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, 0.07)), lambert(0.4));
      m.position.set(x, y, -1.38);
      scene.add(m);
    };
    stoneBar(0.045, apex - WY - 0.25, WX, WY + (apex - WY - 0.25) / 2);
    stoneBar(WW, 0.045, WX, WY + WH * 0.55);
    const rose = new THREE.Mesh(keep(new THREE.TorusGeometry(0.16, 0.022, 6, 24)), lambert(0.4));
    rose.position.set(WX, WY + WH + 0.3, -1.38);
    scene.add(rose);
    stoneBar(WW + 0.34, 0.07, WX, WY - 0.09);

    // Outside: the night, the stars, the moon, and its light coming in.
    const sky = new THREE.Mesh(keep(new THREE.PlaneGeometry(4, 4)), new THREE.MeshBasicMaterial({ color: grey(0.04), fog: false }));
    sky.position.set(WX, 1.4, -2.4);
    scene.add(sky);
    const r = rng(7);
    const starPos = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) starPos.set([WX + (r() - 0.5) * 2.4, 0.4 + r() * 2.4, -2.3], i * 3);
    const starGeo = keep(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
    const moon = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 32, 16)), new THREE.MeshBasicMaterial({ color: grey(0.95), fog: false }));
    moon.position.set(WX + 0.18, WY + WH + 0.1, -2.2);
    scene.add(moon);
    const bite = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 32, 16)), new THREE.MeshBasicMaterial({ color: grey(0.04), fog: false }));
    bite.position.set(WX + 0.28, WY + WH + 0.16, -2.19);
    scene.add(bite);
    // The beam: faint, so the dither lays it down as a scatter of light.
    const beamGeo = keep(new THREE.BufferGeometry());
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      WX - WW / 2, WY + WH, -1.36, WX + WW / 2, WY + WH, -1.36, WX + WW / 2 - 0.6, 0.002, 0.7,
      WX - WW / 2, WY + WH, -1.36, WX + WW / 2 - 0.6, 0.002, 0.7, WX - WW / 2 - 0.8, 0.002, 0.5,
    ]), 3));
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(beam);

    // ---- the desk -------------------------------------------------------
    const [woodC, woodG] = canvas(1024, 512);
    paintWood(woodG, 1024, 512);
    const wood = keep(texture(woodC));
    const deskMat = new THREE.MeshLambertMaterial({ map: wood });
    const top = new THREE.Mesh(keep(new THREE.BoxGeometry(4.4, 0.12, 1.9)), deskMat);
    top.position.set(0, -0.06, -0.25);
    scene.add(top);
    const apron = new THREE.Mesh(keep(new THREE.BoxGeometry(4.3, 0.55, 0.08)), lambert(0.16));
    apron.position.set(0, -0.4, 0.62);
    scene.add(apron);
    const lip = new THREE.Mesh(keep(new THREE.BoxGeometry(4.46, 0.035, 0.05)), lambert(0.45));
    lip.position.set(0, -0.015, 0.69);
    scene.add(lip);

    // ---- the skull, and the candle on it ------------------------------------
    const bone = lambert(0.78), hollow = lambert(0.02);
    const skull = new THREE.Group();
    const cranium = new THREE.Mesh(keep(new THREE.SphereGeometry(0.2, 32, 24)), bone);
    cranium.scale.set(1, 0.92, 1.12);
    cranium.position.y = 0.25;
    skull.add(cranium);
    const face = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 24, 16)), bone);
    face.scale.set(1, 0.9, 0.8);
    face.position.set(0, 0.16, 0.1);
    skull.add(face);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(keep(new THREE.SphereGeometry(0.05, 16, 12)), hollow);
      eye.scale.set(1, 1.1, 0.6);
      eye.position.set(s * 0.068, 0.2, 0.205);
      skull.add(eye);
    }
    const nose = new THREE.Mesh(keep(new THREE.ConeGeometry(0.025, 0.06, 3)), hollow);
    nose.rotation.x = Math.PI;
    nose.position.set(0, 0.125, 0.22);
    skull.add(nose);
    const jaw = new THREE.Mesh(keep(new THREE.BoxGeometry(0.19, 0.08, 0.16)), bone);
    jaw.position.set(0, 0.04, 0.09);
    skull.add(jaw);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(keep(new THREE.BoxGeometry(0.022, 0.035, 0.02)), lambert(0.9));
      tooth.position.set(-0.06 + i * 0.024, 0.085, 0.17);
      skull.add(tooth);
    }
    const wax = lambert(0.85);
    const candle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.042, 0.048, 0.34, 20)), wax);
    candle.position.y = 0.6;
    skull.add(candle);
    for (const [x, z, len] of [[0.04, 0.02, 0.16], [-0.03, 0.035, 0.24], [0.01, -0.04, 0.12]] as const) {
      const drip = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.012, len, 4, 8)), wax);
      drip.position.set(x, 0.62 - len / 2, z);
      skull.add(drip);
    }
    const pool = new THREE.Mesh(keep(new THREE.SphereGeometry(0.09, 16, 8)), wax);
    pool.scale.set(1, 0.25, 1);
    pool.position.y = 0.44;
    skull.add(pool);
    const flame = new THREE.Mesh(keep(new THREE.SphereGeometry(0.03, 16, 12)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    flame.position.y = 0.83;
    skull.add(flame);
    const [haloC, haloG] = canvas(128, 128);
    const glow = haloG.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255,255,255,.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    haloG.fillStyle = glow; haloG.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(texture(haloC)), depthWrite: false, transparent: true }));
    halo.scale.set(0.5, 0.5, 1);
    halo.position.y = 0.83;
    skull.add(halo);
    const candlelight = new THREE.PointLight(0xffffff, 2.4, 5, 1.6);
    candlelight.position.y = 0.86;
    skull.add(candlelight);
    skull.position.set(0.82, 0, 0.02);
    skull.rotation.y = -0.45;
    scene.add(skull);

    // ---- the hourglass --------------------------------------------------
    const hourglass = new THREE.Group();
    const cap = keep(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 16));
    for (const y of [0.015, 0.45]) { const m = new THREE.Mesh(cap, lambert(0.3)); m.position.y = y; hourglass.add(m); }
    const post = keep(new THREE.CylinderGeometry(0.01, 0.01, 0.43, 6));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const m = new THREE.Mesh(post, lambert(0.35));
      m.position.set(Math.cos(a) * 0.11, 0.23, Math.sin(a) * 0.11);
      hourglass.add(m);
    }
    const bulb = [0.03, 0.09, 0.105, 0.09, 0.03, 0.012, 0.03, 0.09, 0.105, 0.09, 0.03].map((x, i) => new THREE.Vector2(x, 0.03 + i * 0.04));
    hourglass.add(new THREE.Mesh(keep(new THREE.LatheGeometry(bulb, 20)), new THREE.MeshLambertMaterial({ color: grey(0.7), transparent: true, opacity: 0.45 })));
    const sand = new THREE.Mesh(keep(new THREE.ConeGeometry(0.075, 0.08, 16)), lambert(0.75));
    sand.position.y = 0.08;
    hourglass.add(sand);
    hourglass.position.set(1.08, 0, -0.62);
    scene.add(hourglass);

    // ---- the inkwell and its quill -----------------------------------------
    const ink = new THREE.Group();
    const well = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.13, 0.1, 20)), lambert(0.12));
    well.position.y = 0.05;
    ink.add(well);
    const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 16)), lambert(0.12));
    neck.position.y = 0.12;
    ink.add(neck);
    const vane = new THREE.Shape();
    vane.moveTo(0, 0); vane.quadraticCurveTo(0.07, 0.3, 0.02, 0.62); vane.quadraticCurveTo(-0.04, 0.3, 0, 0);
    const quill = new THREE.Mesh(keep(new THREE.ShapeGeometry(vane, 12)), new THREE.MeshLambertMaterial({ color: grey(0.85), side: THREE.DoubleSide }));
    quill.position.set(0, 0.12, 0);
    quill.rotation.set(-0.25, 0.6, 0.35);
    ink.add(quill);
    ink.position.set(0.42, 0, 0.78);
    scene.add(ink);

    // ---- loose leaves ---------------------------------------------------
    [[0.62, 0.5, 0.35, 11], [0.2, -0.45, -0.3, 12]].forEach(([x, z, turn, seed]) => {
      const [c, g] = canvas(512, 360);
      paintLeaf(g, 512, 360, seed!);
      const leaf = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.62, 0.44)), new THREE.MeshLambertMaterial({ map: keep(texture(c)) }));
      leaf.rotation.set(-Math.PI / 2, 0, turn!);
      leaf.position.set(x!, 0.003, z!);
      scene.add(leaf);
    });

    // ---- the pile -------------------------------------------------------
    // Newest on top. Each book is a group, so it can be slid and lifted.
    const D = 0.72;
    const covers: THREE.Mesh[] = [];
    const pile = books.map((b, i) => {
      const f = rng(b.seed);
      const L = 1.02 + f() * 0.3, t = 0.13 + Math.min(0.07, b.chapters * 0.0025);
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
      // The faces: +x, -x the head and tail, +y the cover, -y the back
      // cover, +z the spine to you, -z the fore-edge.
      const mats = [
        new THREE.MeshLambertMaterial({ map: pages }), new THREE.MeshLambertMaterial({ map: pages }),
        new THREE.MeshLambertMaterial({ map: keep(texture(cc)) }), lambert(0.12),
        // The name glows a little of its own, so the dither never loses it.
        new THREE.MeshLambertMaterial({ map: spine, emissive: 0xffffff, emissiveMap: spine, emissiveIntensity: 0.45 }),
        new THREE.MeshLambertMaterial({ map: pages }),
      ];
      const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(L, t, D)), mats);
      mesh.userData.index = i;
      covers.push(mesh);
      const group = new THREE.Group();
      group.add(mesh);
      scene.add(group);
      return { group, t, x: -0.32 + (f() - 0.5) * 0.24, z: 0.3 + (f() - 0.5) * 0.12, yaw: (f() - 0.5) * 0.5, draw, y: 0, off: 0 };
    });
    // The fonts arrive after the first paint; the spines are painted again.
    document.fonts?.ready.then(() => pile.forEach((p) => p.draw()));
    // Laid down at once where they rest, before anything moves.
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

    // ---- looking, and picking ---------------------------------------------
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

    const eye = new THREE.Vector3(0, 1.4, 3.05), look = new THREE.Vector3(0.08, 0.34, -0.3);
    const lean = new THREE.Vector2();
    return (t, dt) => {
      const k = 1 - Math.pow(0.004, dt);
      // The candle gutters; the light on everything breathes with it.
      const f = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1) * 0.3 + Math.sin(t * 2.1) * 0.2;
      flame.scale.set(1 - f * 0.08, 1.9 + f * 0.25, 1 - f * 0.08);
      candlelight.intensity = 2.4 + f * 0.45;
      halo.material.opacity = 0.85 + f * 0.15;
      // The room leans a little toward the pointer, as a head would.
      if (Math.abs(pointer.x) <= 1) lean.lerp(pointer, 0.04); else lean.multiplyScalar(0.96);
      // A narrow glass stands further back, so the whole desk is still in it.
      const back = Math.max(0, 1.5 - camera.aspect) * 1.6;
      camera.position.set(eye.x + lean.x * 0.18, eye.y + lean.y * 0.08 + back * 0.3, eye.z + back);
      camera.lookAt(look);
      // The pile: the book taken slides off toward the hall, the ones above
      // it come down, the one under the pointer comes out to meet it.
      rest();
      const out = hooks.out();
      // Down into the gap only once the book taken has slid clear of it.
      const clear = out < 0 || pile[out]!.group.position.x - pile[out]!.x > 1.6;
      pile.forEach((p, i) => {
        const x = p.x + (i === out ? 3.4 : 0) + (i === hovered && i !== out ? -0.05 : 0);
        const z = p.z + (i === hovered && i !== out ? 0.16 : 0);
        p.group.position.x += (x - p.group.position.x) * k;
        p.group.position.z += (z - p.group.position.z) * k;
        p.group.position.y += ((clear ? p.y : p.group.position.y) - p.group.position.y) * k;
      });
    };
  };
}
