// The console's objects, modelled from primitives rather than extruded from a
// drawing: Kael'thos sitting, the cathedral, stars, planets, a galaxy, the
// event horizon, the AURA-1 and a tesseract.
import * as THREE from 'three';
import { rng } from './engine';

const standard = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
const basic = (color: number) => new THREE.MeshBasicMaterial({ color });

// Kael'thos as Jiji: a slim black cat sitting upright, a large head, tall
// ears lit on their inner faces, big white eyes, whiskers that droop, his tail
// curled round to the front.
export function kaelthos(): THREE.Group {
  const cat = new THREE.Group();
  const fur = standard(0x77716a, 0.65);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
    cat.add(m);
    return m;
  };

  const profile = [[0, 0], [0.3, 0.01], [0.39, 0.07], [0.41, 0.2], [0.37, 0.38], [0.3, 0.57], [0.23, 0.74], [0.18, 0.88], [0.15, 0.98], [0, 1.03]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(profile, 40), fur, [0, 0, 0], [0.86, 1, 0.95]);
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(1, 24, 16), fur, [s * 0.25, 0.19, -0.06], [0.2, 0.2, 0.3]);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 12), fur, [s * 0.1, 0.31, 0.22]);
    add(new THREE.SphereGeometry(0.07, 12, 10), fur, [s * 0.1, 0.03, 0.27], [1, 0.6, 1.3]);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.31, 0.03);
  cat.add(head);
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot); head.add(m); return m;
  };
  part(new THREE.SphereGeometry(0.36, 32, 24), fur, [0, 0, 0], [1.1, 0.92, 0.96]);
  part(new THREE.SphereGeometry(0.13, 20, 14), fur, [0, -0.1, 0.28], [1.25, 0.78, 0.9]);
  for (const s of [-1, 1]) {
    part(new THREE.ConeGeometry(0.14, 0.46, 20), fur, [s * 0.21, 0.36, -0.02], [1, 1, 0.55], [0, 0, -s * 0.24]);
    // The inner ear: a pale face that catches the light, as on the device.
    part(new THREE.ConeGeometry(0.085, 0.3, 16), standard(0x9d968a, 0.5), [s * 0.2, 0.33, 0.035], [1, 1, 0.2], [0, 0, -s * 0.24]);
    part(new THREE.SphereGeometry(0.09, 20, 14), basic(0xf2eee6), [s * 0.145, 0.03, 0.29], [1, 1.25, 0.45]);
    part(new THREE.SphereGeometry(0.04, 12, 10), basic(0x0a0a0a), [s * 0.14, 0.02, 0.33], [0.65, 1.5, 0.4]);
  }
  const whiskers: number[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const y = -0.1 - k * 0.028;
    const pts = [new THREE.Vector3(s * 0.12, y, 0.36), new THREE.Vector3(s * 0.34, y - 0.01 - k * 0.012, 0.32), new THREE.Vector3(s * 0.52, y - 0.06 - k * 0.03, 0.25)];
    for (let i = 0; i < pts.length - 1; i++) whiskers.push(...pts[i]!.toArray(), ...pts[i + 1]!.toArray());
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(whiskers, 3));
  head.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0xd8d2c6 })));
  head.rotation.set(0.05, 0, 0.1);

  const tail = new THREE.CatmullRomCurve3([[0.04, 0.12, -0.36], [0.34, 0.07, -0.3], [0.5, 0.05, 0.0], [0.44, 0.05, 0.27], [0.26, 0.06, 0.39], [0.12, 0.08, 0.4]]
    .map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  cat.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 48, 0.048, 10), fur));
  return cat;
}

// A gothic west front: a nave, twin towers with spires and pinnacles,
// flying buttresses, a rose window and lancets cut dark into the stone.
export function cathedral(): THREE.Group {
  const g = new THREE.Group();
  const stone = standard(0x6d675e, 0.95), dark = basic(0x0b0b0b);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = stone) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); g.add(b); return b;
  };
  const spire = (r: number, h: number, x: number, y: number, z: number) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), stone); c.position.set(x, y + h / 2, z); c.rotation.y = Math.PI / 4; g.add(c);
  };
  box(2.2, 2.2, 5, 0, 0, -2.6);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.35, 1.1, 4, 1, false, Math.PI / 4), stone);
  roof.scale.set(1.15, 1, 3.6); roof.position.set(0, 2.75, -2.6); g.add(roof);
  for (const s of [-1, 1]) {
    box(0.95, 4.2, 0.95, s * 1.45, 0, 0);
    spire(0.62, 2.6, s * 1.45, 4.2, 0);
    for (const cx of [-0.38, 0.38]) spire(0.08, 0.5, s * 1.45 + cx, 4.2, 0.38);
    for (let k = 0; k < 4; k++) {
      box(0.2, 1.6, 0.3, s * 1.35, 0, -1.2 - k * 1.1);
      const fly = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.7), stone);
      fly.position.set(s * 1.2, 1.9, -1.2 - k * 1.1); fly.rotation.z = s * 0.6; fly.rotation.y = Math.PI / 2; g.add(fly);
      spire(0.07, 0.45, s * 1.35, 1.6, -1.2 - k * 1.1);
    }
    for (let k = 0; k < 3; k++) box(0.16, 0.8, 0.02, s * 1.45, 1.1 + k * 0.95, 0.48, dark);
  }
  box(1.95, 3.1, 0.7, 0, 0, 0.05);
  const gable = new THREE.Shape([new THREE.Vector2(-0.98, 0), new THREE.Vector2(0.98, 0), new THREE.Vector2(0, 1.2)]);
  const gab = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.6, bevelEnabled: false }), stone);
  gab.position.set(0, 3.1, -0.25); g.add(gab);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), dark); rose.position.set(0, 2.25, 0.41); g.add(rose);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 40), stone); ring.position.set(0, 2.25, 0.42); g.add(ring);
  for (let k = 0; k < 8; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.96, 0.02), stone);
    spoke.position.set(0, 2.25, 0.43); spoke.rotation.z = (k / 8) * Math.PI; g.add(spoke);
  }
  const door = new THREE.Shape();
  door.moveTo(-0.34, 0); door.lineTo(0.34, 0); door.lineTo(0.34, 0.9); door.quadraticCurveTo(0.3, 1.35, 0, 1.55); door.quadraticCurveTo(-0.3, 1.35, -0.34, 0.9); door.lineTo(-0.34, 0);
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(door), dark); portal.position.set(0, 0, 0.41); g.add(portal);
  return g;
}

export function stars(count: number, radius: number, seed = 5, size = 0.02): THREE.Points {
  const r = rng(seed), pos: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = radius * (0.6 + r() * 0.4);
    pos.push(Math.sqrt(1 - u * u) * Math.cos(a) * rr, u * rr, Math.sqrt(1 - u * u) * Math.sin(a) * rr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true }));
}

// Lines between a handful of the fixed stars, the way charts join them.
export function constellation(seed: number, radius: number): THREE.LineSegments {
  const r = rng(seed), pts: THREE.Vector3[] = [];
  for (let i = 0; i < 9; i++) {
    const u = r() * 0.7 - 0.1, a = r() * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a)).multiplyScalar(radius));
  }
  const seg: THREE.Vector3[] = [];
  for (let i = 1; i < pts.length; i++) { seg.push(pts[i - 1]!, pts[i]!); }
  seg.push(pts[pts.length - 1]!, pts[3]!);
  const g = new THREE.BufferGeometry().setFromPoints(seg);
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8e877d, transparent: true, opacity: 0.5 }));
  l.computeLineDistances?.();
  return l;
}

export function moon(radius: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(radius, 32, 24);
  const r = rng(71), p = g.attributes.position!;
  // Craters as dents, so the dither finds shadow in them.
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9 + r() * 0.1) * Math.sin(v.y * 7) * Math.sin(v.z * 8);
    v.multiplyScalar(1 - Math.max(0, n) * 0.04);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, standard(0xd8d2c6, 1));
}

export function planet(radius: number, seed: number, ringed: boolean): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const r = rng(seed), p = geo.attributes.position!;
  const bands = 3 + Math.floor(r() * 5);
  const colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / radius;
    const c = 0.45 + 0.4 * Math.sin(y * bands * Math.PI + seed) * 0.5 + 0.1 * r();
    colors.push(c, c, c);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
  if (ringed) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.45, radius * 2.2, 64), new THREE.MeshStandardMaterial({ color: 0xbdb6aa, side: THREE.DoubleSide, roughness: 1 }));
    ring.rotation.x = Math.PI / 2 - 0.35;
    g.add(ring);
  }
  return g;
}

export function galaxy(count: number, radius: number, seed = 3): THREE.Points {
  const r = rng(seed), pos: number[] = [], col: number[] = [];
  for (let i = 0; i < count; i++) {
    const arm = Math.floor(r() * 3), t = Math.pow(r(), 0.7), rr = t * radius;
    const a = arm * (Math.PI * 2 / 3) + rr * 1.9 + (r() - 0.5) * (0.5 - t * 0.3);
    const spread = (r() - 0.5) * 0.25 * radius * (1 - t);
    pos.push(Math.cos(a) * rr + spread, (r() - 0.5) * 0.12 * radius * (1 - t), Math.sin(a) * rr + spread);
    const b = 1 - t * 0.7; col.push(b, b, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.03, vertexColors: true }));
}

// The event horizon as Interstellar drew it: a black sphere, a thin photon
// ring, the disk flat around it, and the far side of the disk bent up over
// the top and under the bottom. The bent image always faces the viewer.
export function blackHole() {
  const disk = new THREE.Group();
  disk.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), basic(0x000000)));
  const points = (count: number, place: (r: () => number) => [number, number, number, number], seed: number, size: number) => {
    const r = rng(seed), pos: number[] = [], col: number[] = [];
    for (let i = 0; i < count; i++) { const [x, y, z, b] = place(r); pos.push(x, y, z); col.push(b, b, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true }));
  };
  // The disk: brightest at its inner edge, the approaching side brighter.
  disk.add(points(26000, (r) => {
    const t = Math.pow(r(), 1.8), rad = 0.95 + t * 2.4, a = r() * Math.PI * 2;
    const b = (1.25 - t * 0.9) * (0.75 + 0.35 * Math.cos(a));
    return [Math.cos(a) * rad, (r() - 0.5) * 0.015 * rad, Math.sin(a) * rad, b];
  }, 11, 0.018));
  const facing = new THREE.Group();
  // The far disk lensed over the top and under the bottom of the horizon.
  facing.add(points(12000, (r) => {
    const a = r() * Math.PI * 2, top = Math.abs(Math.sin(a));
    if (r() > top * top + 0.05) return [0, 0, -50, 0];
    const rad = 0.66 + Math.pow(r(), 2) * 0.55 * (0.5 + top);
    return [Math.cos(a) * rad * 1.05, Math.sin(a) * rad, 0, 0.8 + 0.4 * top];
  }, 23, 0.016));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.008, 6, 160), basic(0xffffff));
  facing.add(ring);
  return { disk, facing };
}

// The AURA-1: a dark rounded body, the glass flush in its face, two buttons
// on the side. The glass shows whatever canvas it is given.
export function aura1(screen: HTMLCanvasElement): { group: THREE.Group; texture: THREE.CanvasTexture } {
  const g = new THREE.Group();
  const rr = (w: number, h: number, r: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  };
  const body = new THREE.ExtrudeGeometry(rr(1.62, 1.62, 0.2), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5, curveSegments: 10 });
  body.center();
  g.add(new THREE.Mesh(body, standard(0x2a2825, 0.55)));
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), basic(0x0e0e0e));
  bezel.position.z = 0.206; g.add(bezel);
  const texture = new THREE.CanvasTexture(screen);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: texture }));
  glass.position.z = 0.21; g.add(glass);
  for (const [y, len] of [[0.35, 0.16], [0.05, 0.16]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.12), standard(0x8d877c, 0.35));
    b.position.set(0.86, y, 0); g.add(b);
  }
  return { group: g, texture };
}

// Sixteen corners of a hypercube, turned in the fourth dimension each frame.
export function tesseract() {
  const verts = Array.from({ length: 16 }, (_, i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const edges: [number, number][] = [];
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(edges.length * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  const update = (t: number) => {
    const a = t * 0.45, c = Math.cos(a), s = Math.sin(a);
    const p = verts.map(([x, y, z, w]) => {
      const x1 = x! * c - w! * s, w1 = x! * s + w! * c;
      const k = 0.95 / (2.6 - w1);
      return [x1 * k, y! * k, z! * k];
    });
    edges.forEach(([i, j], e) => { pos.set(p[i]!, e * 6); pos.set(p[j]!, e * 6 + 3); });
    geo.attributes.position!.needsUpdate = true;
  };
  update(0);
  return { lines, update };
}

export function lights(scene: THREE.Scene, key = 1.2, rim = 1.4, ambient = 0.22): void {
  scene.add(new THREE.AmbientLight(0xffffff, ambient));
  const k = new THREE.DirectionalLight(0xffffff, key); k.position.set(2.5, 3, 3.5); scene.add(k);
  const r = new THREE.DirectionalLight(0xffffff, rim); r.position.set(-3, 1.5, -2.5); scene.add(r);
}
