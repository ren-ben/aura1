// Mount Yeezus, seen from the floor: a white sun of a screen, the crumpled
// peak rising in front of it, a blade of rock leaning out over the crowd,
// three beams through the smoke, and on the summit Kael'thos, his face under
// the jewelled mask. Drawn in grey for the dither; drag to look round a little.
import * as THREE from 'three';
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

// The rock: pale fabric crumpled into grooves that run down the slope, and a
// few seams across them where the sheets were joined.
function rock() {
  const r = rng(41);
  const t = paint(512, 512, (g) => {
    g.fillStyle = grey(0.8); g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
      const x = r() * 512, w = 3 + r() * 9, lean = (r() - 0.5) * 40;
      g.strokeStyle = grey(r() < 0.5 ? 0.2 + r() * 0.2 : 0.9 + r() * 0.1, 0.9);
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, -10);
      for (let y = 0; y <= 522; y += 40) g.lineTo(x + lean * (y / 512) + (r() - 0.5) * 6, y);
      g.stroke();
    }
    g.strokeStyle = grey(0.12); g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const y = r() * 512; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + (r() - 0.5) * 60); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A peak: a many-sided frustum, its faces pushed in and out so it reads as
// folded stone, with a small flat top to stand on.
function peak(bottom: number, top: number, height: number, sides: number, seed: number, mat: THREE.Material) {
  const geo = new THREE.CylinderGeometry(top, bottom, height, sides, 12);
  const p = geo.attributes.position!, r = rng(seed), jag = Array.from({ length: 256 }, () => r() - 0.5);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (y / height + 0.5);
    if (u > 0.97) continue;
    const a = Math.atan2(z, x), k = 1 + 0.07 * jag[(Math.round(a * 9) + Math.round(u * 12) * 17 & 255)]! * (1 - u);
    p.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.y = height / 2;
  return m;
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

export const yeezus: Build = ({ scene, camera, turn }) => {
  const r = rng(9);
  const stone = rock();
  const face = new THREE.MeshStandardMaterial({ color: 0x8a8781, map: stone, bumpMap: stone, bumpScale: 1, roughness: 0.95, flatShading: true });

  // The screen: a white disc taller than the mountain, faint weather moving
  // across it, and a dim ring of light spilling round its edge.
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
  const screen = new THREE.Mesh(new THREE.CircleGeometry(9.2, 96), new THREE.MeshBasicMaterial({ map: sky }));
  screen.position.set(0, 9.4, -12);
  scene.add(screen);
  const halo = new THREE.Mesh(new THREE.RingGeometry(9.2, 12.5, 96), new THREE.MeshBasicMaterial({
    map: paint(256, 256, (g) => {
      const h = g.createRadialGradient(128, 128, 94, 128, 128, 128);
      h.addColorStop(0, grey(0.3)); h.addColorStop(1, grey(0));
      g.fillStyle = h; g.fillRect(0, 0, 256, 256);
    }),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.position.copy(screen.position).z += 0.01;
  scene.add(halo);

  // The arena behind, far off: a scatter of small lights in the dark.
  const far = new THREE.BufferGeometry();
  const fp: number[] = [], fc: number[] = [];
  for (let i = 0; i < 500; i++) {
    const x = (r() - 0.5) * 70, y = r() * 26 - 2;
    if (Math.hypot(x, y - 9.4) < 12) continue;
    fp.push(x, y, -18 - r() * 6);
    const v = 0.15 + r() ** 3 * 0.8; fc.push(v, v, v);
  }
  far.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  far.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  scene.add(new THREE.Points(far, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true })));

  // The mountain: the main peak, a lower shoulder in front of it, the stage
  // it stands on with its lit lip, and the blade leaning out to the left.
  const main = peak(6, 0.32, 8.6, 5, 3, face);
  main.rotation.y = 0.3;
  scene.add(main);
  const shoulder = peak(4.2, 0.2, 4.4, 4, 8, face);
  shoulder.position.set(3.1, 2.2, 2.6); shoulder.rotation.y = 0.9;
  scene.add(shoulder);
  const stage = new THREE.Mesh(new THREE.BoxGeometry(24, 1.1, 11), new THREE.MeshStandardMaterial({ color: 0x3a3835, map: stone, roughness: 1 }));
  stage.position.set(0, -0.55, 1);
  scene.add(stage);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xd9d4ca }));
  lip.position.set(0, 0, 6.5);
  scene.add(lip);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 0.7), face);
  blade.geometry.translate(-5, 0, 0);
  blade.position.set(-2.8, 2.6, 1.8); blade.rotation.set(0, 0.35, -0.22);
  scene.add(blade);

  // Him, on the summit, facing the crowd.
  const cat = kaelthos();
  mask(cat.children.find((c): c is THREE.Group => c instanceof THREE.Group)!);
  cat.scale.setScalar(0.8);
  cat.position.set(0, 8.6, 0);
  scene.add(cat);

  // The light: a cold key from the front and above, the screen's glow
  // raking the rock from behind, and a spot straight down on him.
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 4.5); key.position.set(-9, 9, 10); scene.add(key);
  const back = new THREE.DirectionalLight(0xffffff, 3); back.position.set(-4, 6, -10); scene.add(back);
  const spot = new THREE.SpotLight(0xffffff, 60, 20, 0.12, 0.6, 1.2);
  spot.position.set(0, 20, 3); spot.target = cat; scene.add(spot);

  // Beams through the smoke: soft cones from lamps hung high, three in a row
  // off to the side and one straight down on him.
  const fall = paint(4, 256, (g) => {
    const b = g.createLinearGradient(0, 0, 0, 256);
    b.addColorStop(0, grey(0.75)); b.addColorStop(0.5, grey(0.28)); b.addColorStop(1, grey(0));
    g.fillStyle = b; g.fillRect(0, 0, 4, 256);
  });
  const beams: { m: THREE.Mesh; lean: number; phase: number }[] = [];
  const beam = (x: number, y: number, z: number, radius: number, length: number, lean: number, strength: number) => {
    const geo = new THREE.CylinderGeometry(0.12, radius, length, 32, 1, true);
    geo.translate(0, -length / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: fall, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(x, y, z);
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lamp.position.set(x, y + 0.05, z);
    scene.add(m, lamp);
    beams.push({ m, lean, phase: r() * 6 });
  };
  beam(-14, 16.5, -4, 2.2, 21, 0.2, 0.42);
  beam(-9.5, 17.5, -3, 2.0, 21, 0.08, 0.38);
  beam(12.5, 16.8, -4, 2.4, 21, -0.18, 0.42);
  beam(0, 20, 3, 0.9, 11.4, 0, 0.5);

  // Smoke along the foot of the mountain, drifting.
  const puff = paint(64, 64, (g) => {
    const p = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    p.addColorStop(0, grey(1, 0.5)); p.addColorStop(1, grey(1, 0));
    g.fillStyle = p; g.fillRect(0, 0, 64, 64);
  });
  const smoke: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, opacity: 0.18 + r() * 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set((r() - 0.5) * 30, 0.4 + r() * 3.2, 3 + r() * 5);
    s.scale.setScalar(4 + r() * 6);
    scene.add(s); smoke.push(s);
  }

  // The crowd in front, black against the haze their own light makes.
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshBasicMaterial({
    map: paint(4, 128, (g) => {
      const h = g.createLinearGradient(0, 0, 0, 128);
      h.addColorStop(0, grey(0)); h.addColorStop(0.6, grey(0.5)); h.addColorStop(1, grey(0.6));
      g.fillStyle = h; g.fillRect(0, 0, 4, 128);
    }),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  haze.position.set(0, 1.2, 8.5);
  scene.add(haze);
  const people = new THREE.Mesh(new THREE.PlaneGeometry(48, 9.8), new THREE.MeshBasicMaterial({ map: crowd(), alphaTest: 0.5, transparent: true }));
  people.position.set(0, 0.2, 10);
  scene.add(people);

  // Stood back on the floor, far enough off to take in the disc and the
  // lamps, and turned only a little by a drag.
  return (t) => {
    turn.y = Math.max(-0.35, Math.min(0.35, turn.y));
    turn.x = Math.max(-0.08, Math.min(0.2, turn.x));
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(11.5 / half, 9.5 / (half * camera.aspect));
    // A narrow window stands farther back; lifting the aim keeps the crowd on its bottom edge.
    const aim = new THREE.Vector3(0, 7.2 + (dist * half - 11.5) * 0.85, 0);
    const yaw = turn.y + Math.sin(t * 0.07) * 0.05;
    camera.position.set(Math.sin(yaw) * dist, aim.y - 3.2 + turn.x * dist, Math.cos(yaw) * dist);
    camera.far = dist * 3;
    camera.updateProjectionMatrix();
    camera.lookAt(aim);
    sky.offset.set(t * 0.004, t * 0.0015);
    for (const b of beams) b.m.rotation.z = b.lean + Math.sin(t * 0.25 + b.phase) * 0.05;
    smoke.forEach((s, i) => { s.position.x += Math.sin(t * 0.1 + i) * 0.004; });
  };
};
