// Mount Yeezus, seen from the floor: a white disc hung tipped over the stage,
// the pyramid under it on its tier, and at its front corner the tip, a crag of
// stone columns that rises over the crowd with Kael'thos on its point in the
// jewelled mask, one hard shaft of light on him. Fog, a truss of lamps, the
// speaker stacks. Click the tip to lower or raise it; drag to look round a
// little. Drawn in grey for the dither.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type Build } from './engine';
import { kaelthos } from './models';

const paint = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

// Smooth 1D noise from a seeded table, for the folds.
function noise(seed: number) {
  const r = rng(seed), t = Array.from({ length: 512 }, () => r());
  return (x: number) => {
    const i = Math.floor(x), f = x - i, a = t[i & 511]!, b = t[(i + 1) & 511]!;
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

// One face of the mountain as a sheet of crumpled fabric: a fine grid between
// four corners (bottom left, bottom right, top right, top left), pushed out
// along its normal in sharp folds that run down the slope and gather toward
// the top, with a few seams across where the sheets were joined. The folds die
// out at the face's edges so its ridges stay clean.
function sheet(corners: THREE.Vector3[], centre: THREE.Vector3, seed: number, nu: number, nv: number, amp: number) {
  const [a, b, c, d] = corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
  const mid = a.clone().add(b).add(c).add(d).multiplyScalar(0.25);
  const out = n.dot(mid.sub(centre)) > 0;
  if (!out) n.negate();
  const fold = noise(seed), warp = noise(seed + 1), crumple = noise(seed + 2), seam = noise(seed + 3);
  const pos: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), lo = new THREE.Vector3(), hi = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      lo.lerpVectors(a, b, u); hi.lerpVectors(d, c, u); p.lerpVectors(lo, hi, v);
      const ridge = 1 - Math.abs(2 * fold(u * nu * 0.34 + warp(v * 5) * 2.2) - 1);
      const step = Math.floor(v * 5 + seam(u * 3) * 0.8) * 0.04;
      const edge = Math.min(1, u * 14, (1 - u) * 14, (1 - v) * 10);
      p.addScaledVector(n, (ridge * ridge * (0.5 + crumple(v * 9 + u * 4)) + step) * amp * edge);
      pos.push(p.x, p.y, p.z);
    }
  }
  // Wound so the front faces the way the normal points.
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const q = j * (nu + 1) + i, w = q + nu + 1;
    if (out) idx.push(q, q + 1, w + 1, q, w + 1, w);
    else idx.push(q, w + 1, q + 1, q, w, w + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A square ring of four sheets between a lower and an upper square, a corner
// toward the floor; the pyramid is one whose upper square is all but a point.
function frustum(bottom: number, top: number, y0: number, y1: number, seed: number, amp: number) {
  const at = (rad: number, y: number) => [0, 1, 2, 3].map((k) => new THREE.Vector3(Math.sin(k * Math.PI / 2) * rad, y, Math.cos(k * Math.PI / 2) * rad));
  const lo = at(bottom, y0), hi = at(top, y1), centre = new THREE.Vector3(0, (y0 + y1) / 2, 0);
  return mergeGeometries([0, 1, 2, 3].map((k) =>
    sheet([lo[k]!, lo[(k + 1) % 4]!, hi[(k + 1) % 4]!, hi[k]!], centre, seed + k * 7, Math.round(bottom * 16), Math.round((y1 - y0) * 7) + 8, amp)));
}

// The tip: a crag of stone columns, tallest at its point over the crowd,
// falling away to either side in steps so it stands as a triangle from the
// front, and its ridge running back down to the tier.
function crag(H: number, peak: number) {
  const r = rng(61), cols: THREE.BufferGeometry[] = [];
  const ridge = (z: number) => z <= peak ? 1.7 + (H - 1.7) * Math.max(0, (z + 4.5) / (peak + 4.5)) ** 1.5 : H * (1 - (z - peak) * 0.55);
  for (let z = -4.5; z <= peak + 0.75; z += 0.3) for (let x = -2.9; x <= 2.9; x += 0.24) {
    const cx = x + (r() - 0.5) * 0.12, cz = z + (r() - 0.5) * 0.12;
    const h = ridge(cz) * Math.max(0, 1 - Math.abs(cx) / 2.9) + (r() - 0.5) * 0.45;
    if (h < 0.3) continue;
    const w = 0.13 + r() * 0.09, g = new THREE.CylinderGeometry(w * (0.7 + r() * 0.3), w, h, 5);
    g.rotateY(r() * 6); g.translate(cx, h / 2, cz);
    cols.push(g);
  }
  // The column he stands on, the tallest, with a flat top.
  const top = new THREE.CylinderGeometry(0.32, 0.4, H, 6);
  top.translate(0, H / 2, peak);
  cols.push(top);
  return mergeGeometries(cols);
}

// The mask: rows of small white stones, set like bricks over his whole head
// and muzzle, his ears left out through it.
function mask(head: THREE.Group) {
  const shells = [
    { c: new THREE.Vector3(0, 0, 0), r: new THREE.Vector3(0.396, 0.331, 0.346) },
    { c: new THREE.Vector3(0, -0.1, 0.28), r: new THREE.Vector3(0.163, 0.101, 0.117) },
  ];
  // How far out from the middle of the head the surface is along d.
  const reach = (d: THREE.Vector3) => Math.max(...shells.map(({ c, r }) => {
    const dd = d.clone().divide(r), cc = c.clone().divide(r);
    const b = dd.dot(cc), disc = b * b - dd.lengthSq() * (cc.lengthSq() - 1);
    return disc < 0 ? 0 : (b + Math.sqrt(disc)) / dd.lengthSq();
  }));
  const spots: THREE.Matrix4[] = [];
  const o = new THREE.Object3D();
  for (let row = 0; row <= 22; row++) {
    const lat = -1.35 + (row / 22) * 2.7, around = Math.max(6, Math.round(Math.cos(lat) * 44));
    for (let k = 0; k < around; k++) {
      const lon = ((k + (row % 2) * 0.5) / around) * Math.PI * 2;
      const d = new THREE.Vector3(Math.sin(lon) * Math.cos(lat), Math.sin(lat), Math.cos(lon) * Math.cos(lat));
      o.position.copy(d).multiplyScalar(reach(d) + 0.012);
      o.lookAt(o.position.clone().multiplyScalar(2));
      o.updateMatrix();
      spots.push(o.matrix.clone());
    }
  }
  const stones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.052, 0.036, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.25, metalness: 0.2 }), spots.length);
  spots.forEach((m, i) => stones.setMatrixAt(i, m));
  head.add(stones);
  // Under the mask there is no face to see.
  head.children.forEach((c) => {
    if (c instanceof THREE.LineSegments || (c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial)) c.visible = false;
  });
}

// The crowd below: heads, arms raised, a few phones held up and lit.
function crowd() {
  const r = rng(77);
  return paint(2048, 420, (g) => {
    g.fillStyle = '#000';
    for (let layer = 0; layer < 3; layer++) {
      const base = 200 + layer * 50;
      for (let x = -20; x < 2068; x += 18 + r() * 20) {
        const hx = x + r() * 8, hy = base + (r() - 0.5) * 18, hr = 12 + r() * 4 + layer * 3;
        g.fillStyle = '#000';
        g.beginPath(); g.ellipse(hx, hy, hr, hr * 1.2, 0, 0, 7); g.fill();
        g.beginPath(); g.ellipse(hx, hy + hr * 2.6, hr * 2, hr * 1.7, 0, 0, 7); g.fill();
        g.fillRect(hx - hr * 2, hy + hr * 2.6, hr * 4, 420);
        if (r() < 0.22) {
          // An arm up: shoulder, elbow, a fist or a lit phone.
          const s = r() < 0.5 ? -1 : 1, sx = hx + s * hr * 1.4, sy = hy + hr * 1.8;
          const ex = sx + s * (8 + r() * 14), ey = sy - 45 - r() * 20, ax = ex + (r() - 0.5) * 20, ay = ey - 45 - r() * 25;
          g.strokeStyle = '#000'; g.lineWidth = 12 + layer * 2; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(ax, ay); g.stroke();
          if (r() < 0.4) { g.fillStyle = grey(1); g.fillRect(ax - 7, ay - 22, 14, 22); }
          else { g.fillStyle = '#000'; g.beginPath(); g.ellipse(ax, ay - 8, 11, 14, 0, 0, 7); g.fill(); }
        }
      }
    }
  });
}

export const yeezus: Build = ({ scene, camera, turn, canvas }) => {
  const r = rng(9);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8c85, roughness: 0.95, flatShading: true });
  const glowy = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false } as const;
  scene.fog = new THREE.FogExp2(0x3a3a3a, 0.009);

  // The screen: a white disc hung high over the stage and tipped down toward
  // the floor, faint weather moving across it, a dim ring of light round it.
  const sky = paint(512, 512, (g) => {
    g.fillStyle = grey(1); g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      const x = r() * 512, y = r() * 512, s = 30 + r() * 90;
      const cl = g.createRadialGradient(x, y, 0, x, y, s);
      cl.addColorStop(0, grey(0.85, 0.22)); cl.addColorStop(1, grey(0.85, 0));
      g.fillStyle = cl; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = grey(0.35); g.fillRect(r() * 512, r() * 512, 2, 2); }
  });
  sky.wrapS = sky.wrapT = THREE.RepeatWrapping;
  const disc = new THREE.Group();
  disc.position.set(2, 18, -8); disc.rotation.set(1.22, -0.3, 0, 'YXZ');
  disc.add(new THREE.Mesh(new THREE.CircleGeometry(10, 96), new THREE.MeshBasicMaterial({ map: sky, fog: false })));
  const halo = new THREE.Mesh(new THREE.RingGeometry(10, 13, 96), new THREE.MeshBasicMaterial({
    map: paint(256, 256, (g) => {
      const h = g.createRadialGradient(128, 128, 98, 128, 128, 128);
      h.addColorStop(0, grey(0.3)); h.addColorStop(1, grey(0));
      g.fillStyle = h; g.fillRect(0, 0, 256, 256);
    }),
    ...glowy,
  }));
  halo.position.z = 0.01;
  disc.add(halo);
  scene.add(disc);

  // The arena behind, far off: a scatter of small lights in the dark.
  const far = new THREE.BufferGeometry();
  const fp: number[] = [], fc: number[] = [];
  for (let i = 0; i < 500; i++) {
    fp.push((r() - 0.5) * 80, r() * 30 - 2, -22 - r() * 6);
    const v = 0.15 + r() ** 3 * 0.8; fc.push(v, v, v);
  }
  far.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  far.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  scene.add(new THREE.Points(far, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, fog: false })));

  // The mountain: a square pyramid, one ridge toward the floor, on a lower
  // tier with a ledge round it, all of it crumpled fabric; the dark floor.
  scene.add(new THREE.Mesh(frustum(9.4, 7.4, 0, 1.8, 8, 0.14), stone));
  const ledge = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.02, 4), stone);
  ledge.position.y = 1.8;
  scene.add(ledge);
  scene.add(new THREE.Mesh(frustum(6.9, 0.01, 1.8, 8.2, 3, 0.2), stone));
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1.1, 30), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 1 }));
  floor.position.set(0, -0.55, 0);
  scene.add(floor);

  // The stage round it: small lamps along the tier's two front edges, a truss
  // across above with cans hung from it, and the speaker stacks either side.
  const dots: number[] = [];
  for (const s of [-1, 1]) for (let k = 0; k <= 16; k++) dots.push(s * 9.6 * (k / 16), 0.15, 9.6 * (1 - k / 16));
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
  const metal = new THREE.MeshStandardMaterial({ color: 0x55524d, roughness: 0.6, metalness: 0.4 });
  const truss = new THREE.Group();
  truss.position.set(0, 17.5, 7);
  for (const [y, z] of [[0, 0], [0, 0.8], [0.8, 0], [0.8, 0.8]] as const) {
    const chord = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 34, 6), metal);
    chord.rotation.z = Math.PI / 2; chord.position.set(0, y, z);
    truss.add(chord);
  }
  const lace: number[] = [];
  for (let x = -17; x < 17; x += 0.8) for (const z of [0, 0.8]) lace.push(x, 0, z, x + 0.8, 0.8, z, x + 0.8, 0.8, z, x + 0.8, 0, z);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lace, 3));
  truss.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x77736c })));
  for (let x = -15; x <= 15; x += 2.5) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.7, 10), metal);
    can.position.set(x, -0.45, 0.4); can.rotation.x = 0.4;
    truss.add(can);
  }
  scene.add(truss);
  for (const s of [-1, 1]) {
    const stack = new THREE.Group();
    stack.position.set(s * 15, 19, 3);
    for (let k = 0; k < 9; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.9), metal);
      box.position.set(0, -k * 0.56, k * k * 0.012); box.rotation.x = k * 0.035;
      stack.add(box);
    }
    stack.rotation.y = -s * 0.35;
    scene.add(stack);
  }

  // The tip, at the pyramid's front corner; it rises with him on it and sinks
  // back into the tier. It starts raised.
  const H = 6.6, PEAK = 0.6, CZ = 8.1 + PEAK;
  const tip = new THREE.Group();
  tip.position.set(0, 0, 8.1);
  tip.add(new THREE.Mesh(crag(H, PEAK), new THREE.MeshStandardMaterial({ color: 0xb0aca4, roughness: 0.95, flatShading: true })));
  scene.add(tip);

  // Him, at the point of it, facing the crowd.
  const cat = kaelthos();
  mask(cat.children.find((c): c is THREE.Group => c instanceof THREE.Group)!);
  cat.scale.setScalar(0.95);
  cat.position.set(0, H, PEAK);
  tip.add(cat);
  const low = -(H - 1.5);
  let lift = 1, raised = true;

  // The light: a cold key from the right and above, the screen's glow
  // raking the rock from behind, and one hard shaft straight down on him.
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 4.5); key.position.set(10, 9, 8); scene.add(key);
  const back = new THREE.DirectionalLight(0xffffff, 3); back.position.set(-4, 6, -10); scene.add(back);
  const top = 30;
  const spot = new THREE.SpotLight(0xffffff, 9, 0, 0.05, 0.5, 0);
  spot.position.set(0, top, CZ); spot.target = cat; scene.add(spot);
  // The floor lights under the crag, washing its face up out of the dark.
  const wash = new THREE.SpotLight(0xffffff, 5, 0, 0.3, 0.8, 0);
  wash.position.set(-6, 0.5, 20); wash.target.position.set(0, 3.5, 8.5); scene.add(wash, wash.target);
  const shaftGeo = new THREE.CylinderGeometry(0.1, 0.32, 1, 20, 1, true);
  shaftGeo.translate(0, -0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.6, ...glowy }));
  shaft.position.set(0, top, CZ);
  scene.add(shaft);
  const puff = paint(64, 64, (g) => {
    const p = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    p.addColorStop(0, grey(1, 0.5)); p.addColorStop(1, grey(1, 0));
    g.fillStyle = p; g.fillRect(0, 0, 64, 64);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, opacity: 0.5, ...glowy }));
  glow.scale.setScalar(2.6);
  // And the smoke at the crag's foot lit white from below, as it was.
  const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, opacity: 0.8, ...glowy }));
  burst.position.set(0, 1.2, 10.6); burst.scale.setScalar(6);
  scene.add(glow, burst);

  // Beams through the smoke: soft cones from lamps hung high off to the sides.
  const fall = paint(4, 256, (g) => {
    const b = g.createLinearGradient(0, 0, 0, 256);
    b.addColorStop(0, grey(0.75)); b.addColorStop(0.5, grey(0.28)); b.addColorStop(1, grey(0));
    g.fillStyle = b; g.fillRect(0, 0, 4, 256);
  });
  const beams: { m: THREE.Mesh; lean: number; phase: number }[] = [];
  const beam = (x: number, y: number, z: number, radius: number, length: number, lean: number, strength: number) => {
    const geo = new THREE.CylinderGeometry(0.12, radius, length, 32, 1, true);
    geo.translate(0, -length / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: fall, opacity: strength, side: THREE.DoubleSide, ...glowy }));
    m.position.set(x, y, z);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    lamp.position.set(x, y + 0.05, z);
    scene.add(m, lamp);
    beams.push({ m, lean, phase: r() * 6 });
  };
  beam(-14, 16.5, -4, 2.2, 21, 0.2, 0.42);
  beam(-9.5, 17.5, -3, 2.0, 21, 0.08, 0.38);
  beam(12.5, 16.8, -4, 2.4, 21, -0.18, 0.42);

  // Fog lying on the floor and round the foot of the mountain, drifting.
  const smoke: THREE.Sprite[] = [];
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, opacity: 0.05 + r() * 0.08, ...glowy }));
    s.position.set((r() - 0.5) * 36, 0.2 + r() * 2.2, -2 + r() * 14);
    s.scale.setScalar(5 + r() * 7);
    scene.add(s); smoke.push(s);
  }

  // The crowd in front, black against the haze their own light makes.
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshBasicMaterial({
    map: paint(4, 128, (g) => {
      const h = g.createLinearGradient(0, 0, 0, 128);
      h.addColorStop(0, grey(0)); h.addColorStop(0.6, grey(0.5)); h.addColorStop(1, grey(0.6));
      g.fillStyle = h; g.fillRect(0, 0, 4, 128);
    }),
    ...glowy,
  }));
  haze.position.set(0, 1.2, 12);
  scene.add(haze);
  const people = new THREE.Mesh(new THREE.PlaneGeometry(48, 9.8), new THREE.MeshBasicMaterial({ map: crowd(), alphaTest: 0.5, transparent: true, fog: false }));
  people.position.set(0, 0.2, 13.5);
  scene.add(people);

  // A click on the tip, or on him, sends it down or back up; a drag does not.
  const ray = new THREE.Raycaster(), at = new THREE.Vector2();
  const hits = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    at.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(at, camera);
    return ray.intersectObject(tip).length > 0;
  };
  let press: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && hits(e)) raised = !raised;
    press = null;
  });
  canvas.addEventListener('pointermove', (e) => { if (!press) canvas.style.cursor = hits(e) ? 'pointer' : ''; });

  // Stood back on the floor, far enough off to take in the disc and the
  // lamps, a little to the left so the tip stands clear of the pyramid, and
  // turned only a little by a drag, the stage following the hand.
  return (t, dt) => {
    turn.y = Math.max(-0.35, Math.min(0.35, turn.y));
    turn.x = Math.max(-0.08, Math.min(0.2, turn.x));
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(12.5 / half, 11 / (half * camera.aspect));
    // A narrow window stands farther back; lifting the aim keeps the crowd on its bottom edge.
    const aim = new THREE.Vector3(0, 8.5 + (dist * half - 12.5) * 0.85, 0);
    const yaw = -turn.y - 0.15 + Math.sin(t * 0.07) * 0.05;
    camera.position.set(Math.sin(yaw) * dist, aim.y - 4 + turn.x * dist, Math.cos(yaw) * dist);
    camera.far = dist * 3;
    camera.updateProjectionMatrix();
    camera.lookAt(aim.x + 2, aim.y, aim.z + 3);

    // The tip rises and sinks over a few seconds, easing at both ends; the
    // shaft and his glow go with him.
    lift = THREE.MathUtils.clamp(lift + (raised ? dt : -dt) * 0.3, 0, 1);
    tip.position.y = low * (1 - THREE.MathUtils.smootherstep(lift, 0, 1));
    const head = tip.position.y + H + 1.35;
    shaft.scale.y = top - head;
    glow.position.set(0, head - 0.5, CZ + 0.2);

    sky.offset.set(t * 0.004, t * 0.0015);
    for (const b of beams) b.m.rotation.z = b.lean + Math.sin(t * 0.25 + b.phase) * 0.05;
    smoke.forEach((s, i) => { s.position.x += Math.sin(t * 0.1 + i) * 0.004; });
  };
};
