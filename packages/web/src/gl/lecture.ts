// The small scene at the heart of a lecture map, one per kind of topic. Each
// is a few shapes in the console's material, moving the way the topic does.
import * as THREE from 'three';
import type { Build } from './engine';
import { lights } from './models';

type Scene = (typeof import('@aura/shared'))['MAP_SCENES'][number];
const pale = () => new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.35, metalness: 0.3, emissive: 0x2a2620 });
const dark = () => new THREE.MeshStandardMaterial({ color: 0x5a554c, roughness: 0.6, metalness: 0.4 });
const glow = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfb8aa, roughness: 0.4 });
const ball = (r: number, m = pale()) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
const ring = (r: number, tube = 0.012, m = dark()) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 120), m);
const tube = (pts: THREE.Vector3[], r = 0.02, m = pale()) =>
  new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(32, pts.length * 2), r, 6, false), m);
// An arrow from the origin: a shaft and a cone.
function arrow(to: THREE.Vector3, m = pale()) {
  const g = new THREE.Group();
  const len = to.length();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len - 0.18, 8), m); shaft.position.y = (len - 0.18) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.18, 12), m); head.position.y = len - 0.09;
  g.add(shaft, head);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().normalize());
  return g;
}

const BUILDS: Record<Scene, Build> = {
  // A planet and two moons on tilted orbits.
  orbits: ({ scene, group }) => {
    group.add(ball(0.42));
    const moons = [[1.05, 0.35, 1.1], [1.55, -0.5, 0.62]].map(([r, tilt, speed]) => {
      const plane = new THREE.Group(); plane.rotation.x = Math.PI / 2 + tilt!; group.add(plane);
      plane.add(ring(r!));
      const m = ball(0.09, glow()); plane.add(m);
      return { m, r: r!, speed: speed! };
    });
    lights(scene, 1.6, 1.2, 0.25);
    return (t) => moons.forEach(({ m, r, speed }) => m.position.set(Math.cos(t * speed) * r, Math.sin(t * speed) * r, 0));
  },
  // Two charges and the lines between them, a test charge riding one.
  field: ({ scene, group }) => {
    const a = ball(0.2, glow()); a.position.x = -0.9; const b = ball(0.2); b.position.x = 0.9; group.add(a, b);
    const lines: THREE.Vector3[][] = [];
    for (let i = 0; i < 7; i++) {
      const phi = (i / 7) * Math.PI * 2, bend = 0.35 + 0.9 * (i % 3) / 2;
      const pts = Array.from({ length: 24 }, (_, k) => {
        const s = k / 23, x = -0.9 + 1.8 * s, lift = Math.sin(s * Math.PI) * bend;
        return new THREE.Vector3(x, Math.cos(phi) * lift, Math.sin(phi) * lift);
      });
      lines.push(pts); group.add(tube(pts, 0.008, dark()));
    }
    const probe = ball(0.05, glow()); group.add(probe);
    const path = new THREE.CatmullRomCurve3(lines[1]!);
    lights(scene, 1.5, 1.3, 0.25);
    return (t) => probe.position.copy(path.getPoint((t * 0.25) % 1));
  },
  // A sheet with a travelling wave across it.
  wave: ({ scene, group }) => {
    const geo = new THREE.PlaneGeometry(2.6, 2.6, 48, 48);
    const sheet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, flatShading: true }));
    sheet.rotation.x = -Math.PI / 2.6; group.add(sheet);
    const pos = geo.attributes.position!;
    lights(scene, 1.7, 1.2, 0.2);
    return (t) => {
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, 0.16 * Math.sin(3 * x - 2.2 * t) * Math.cos(1.2 * y)); }
      pos.needsUpdate = true; geo.computeVertexNormals();
    };
  },
  // A small crystal: atoms on a cube lattice, each trembling a little.
  lattice: ({ scene, group }) => {
    const atoms: { m: THREE.Mesh; home: THREE.Vector3; ph: number }[] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const home = new THREE.Vector3(x, y, z).multiplyScalar(0.62);
      const m = ball(0.1, (x + y + z) % 2 ? pale() : dark()); m.position.copy(home); group.add(m);
      atoms.push({ m, home, ph: (x * 7 + y * 3 + z * 5) });
      if (x < 1) group.add(bond(home, home.clone().add(new THREE.Vector3(0.62, 0, 0))));
      if (y < 1) group.add(bond(home, home.clone().add(new THREE.Vector3(0, 0.62, 0))));
      if (z < 1) group.add(bond(home, home.clone().add(new THREE.Vector3(0, 0, 0.62))));
    }
    lights(scene, 1.5, 1.3, 0.25);
    return (t) => atoms.forEach(({ m, home, ph }) => m.position.set(home.x + 0.025 * Math.sin(t * 5 + ph), home.y + 0.025 * Math.cos(t * 4.3 + ph), home.z));
  },
  // A curve and the tangent that slides along it.
  tangent: ({ scene, group }) => {
    const f = (x: number) => 0.45 * x * x * x - 0.9 * x;
    const df = (x: number) => 1.35 * x * x - 0.9;
    group.add(tube(Array.from({ length: 60 }, (_, i) => { const x = -1.6 + 3.2 * (i / 59); return new THREE.Vector3(x, f(x), 0); }), 0.025));
    const axis = dark();
    group.add(tube([new THREE.Vector3(-1.8, 0, 0), new THREE.Vector3(1.8, 0, 0)], 0.006, axis), tube([new THREE.Vector3(0, -1.3, 0), new THREE.Vector3(0, 1.3, 0)], 0.006, axis));
    const dot = ball(0.07, glow()); group.add(dot);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 6), glow()); group.add(bar);
    lights(scene, 1.5, 1.2, 0.3);
    return (t) => {
      const x = 1.35 * Math.sin(t * 0.5);
      dot.position.set(x, f(x), 0); bar.position.copy(dot.position);
      bar.rotation.z = Math.atan(df(x)) - Math.PI / 2;
    };
  },
  // Two vectors and their sum, turning.
  vectors: ({ scene, group }) => {
    const axes = dark();
    for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) group.add(tube([new THREE.Vector3(), new THREE.Vector3(...(d as [number, number, number])).multiplyScalar(1.3)], 0.006, axes));
    const holder = new THREE.Group(); group.add(holder);
    lights(scene, 1.6, 1.2, 0.3);
    let last = -1;
    return (t) => {
      const k = Math.floor(t * 0.3);
      if (k === last) return;
      last = k;
      holder.clear();
      const a = new THREE.Vector3(1.1, 0.2, 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.7);
      const b = new THREE.Vector3(-0.2, 0.9, 0.4).applyAxisAngle(new THREE.Vector3(1, 0, 0), k * 0.5);
      holder.add(arrow(a, dark()), arrow(b, dark()), arrow(a.clone().add(b), glow()));
    };
  },
  // A nucleus and three electrons on their shells.
  atom: ({ scene, group }) => {
    for (let i = 0; i < 9; i++) { const n = ball(0.12, i % 2 ? pale() : dark()); n.position.setFromSphericalCoords(0.13, Math.acos(1 - 2 * (i + 0.5) / 9), i * 2.4); group.add(n); }
    const shells = [0, 1, 2].map((i) => {
      const plane = new THREE.Group(); plane.rotation.set(i * 1.05, i * 0.6, 0); group.add(plane);
      plane.add(ring(1.2, 0.008));
      const e = ball(0.06, glow()); plane.add(e);
      return { e, speed: 1.3 + i * 0.4 };
    });
    lights(scene, 1.5, 1.3, 0.25);
    return (t) => shells.forEach(({ e, speed }) => e.position.set(Math.cos(t * speed) * 1.2, Math.sin(t * speed) * 1.2, 0));
  },
  // A box of gas: particles bouncing off its walls.
  heat: ({ scene, group }) => {
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), new THREE.LineBasicMaterial({ color: 0x8a8478 })));
    const r = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const rnd = r(7);
    const ps = Array.from({ length: 22 }, () => {
      const m = ball(0.07, rnd() > 0.7 ? glow() : pale()); group.add(m);
      m.position.set(rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8, rnd() * 1.6 - 0.8);
      return { m, v: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.6) };
    });
    lights(scene, 1.5, 1.2, 0.3);
    return (_, dt) => ps.forEach(({ m, v }) => {
      m.position.addScaledVector(v, dt);
      for (const k of ['x', 'y', 'z'] as const) if (Math.abs(m.position[k]) > 0.92) { v[k] *= -1; m.position[k] = Math.sign(m.position[k]) * 0.92; }
    });
  },
  // A block on a spring, oscillating.
  spring: ({ scene, group }) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 1), dark()); wall.position.x = -1.4; group.add(wall);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), pale()); group.add(block);
    let coil: THREE.Mesh | null = null;
    lights(scene, 1.6, 1.2, 0.3);
    return (t) => {
      const x = 0.45 * Math.sin(t * 2);
      block.position.x = 0.5 + x;
      const end = block.position.x - 0.25, turns = 10;
      const pts = Array.from({ length: 160 }, (_, i) => { const s = i / 159, a = s * turns * Math.PI * 2; return new THREE.Vector3(-1.36 + (end + 1.36) * s, 0.16 * Math.cos(a), 0.16 * Math.sin(a)); });
      if (coil) { group.remove(coil); coil.geometry.dispose(); }
      coil = tube(pts, 0.018, glow()); group.add(coil);
    };
  },
  // Anything else: a knot, turning over.
  grid: ({ scene, group }) => {
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.75, 0.2, 180, 18, 2, 3), pale()); group.add(knot);
    lights(scene, 1.6, 1.3, 0.25);
    return (t) => { knot.rotation.z = t * 0.2; };
  },
};

function bond(a: THREE.Vector3, b: THREE.Vector3) {
  return tube([a, b], 0.012, dark());
}

export const sceneFor = (s: string): Build => BUILDS[s as Scene] ?? BUILDS.grid;
