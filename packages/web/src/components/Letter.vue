<script setup lang="ts">
// A letter to Kael'thos, asking for a lecture's map. It arrives folded and
// opens; you write on it; it folds again and takes a blot of red wax, and the
// stamp is yours to press into it (or click it, and it presses itself). Then
// it flies to the corner where he sits.
import { onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import Gl from './Gl.vue';
import { reduced } from '../gl/engine';

const props = defineProps<{ modelValue: string; topics: string[]; guessed: number; heading: string; note: string; busy: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [string]; send: []; arrived: [] }>();

// The page, in canvas pixels, and where the reader writes on it. The written
// text is set in the same hand and size as the line above it.
const PW = 1000, PH = 1300;
const BODY = { x: 90, y: 424, w: 820, h: 546 };
const FONT = 32, LINE = 42;
const W = 2.0, H = (W * PH) / PW;
const INK = '#17130f';
// Kept free under the letter for the button and the hint.
const STRIP = 76;

const page = document.createElement('canvas'); page.width = PW; page.height = PH;
const back = document.createElement('canvas'); back.width = PW; back.height = PH;
const pageTex = new THREE.CanvasTexture(page); pageTex.colorSpace = THREE.SRGBColorSpace; pageTex.anisotropy = 8;
const backTex = new THREE.CanvasTexture(back); backTex.colorSpace = THREE.SRGBColorSpace;

// Parchment in the console's own ink: the off-white, grained, darker toward
// the edges in a printed dither rather than a blur.
function parchment(g: CanvasRenderingContext2D) {
  g.clearRect(0, 0, PW, PH);
  g.fillStyle = '#d6cdba'; g.fillRect(0, 0, PW, PH);
  let s = 9;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3200; i++) { const v = 150 + r() * 70; g.fillStyle = `rgba(${v},${v - 8},${v - 22},.28)`; g.fillRect(r() * PW, r() * PH, 2 + r() * 10, 1 + r() * 2); }
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  g.fillStyle = 'rgba(70,60,48,.55)';
  for (let y = 0; y < PH; y += 4) for (let x = 0; x < PW; x += 4) {
    const dx = Math.min(x, PW - x) / PW, dy = Math.min(y, PH - y) / PH;
    const e = Math.max(0, 1 - Math.min(dx, dy) * 9);
    if (e * 16 > B[((y / 4) % 4) * 4 + ((x / 4) % 4)]! + 1) g.fillRect(x, y, 3, 3);
  }
}
// Age, lightly: a crease where it has been folded before, a ring where a cup
// stood, a corner turned down, a small tear, edges worn uneven. Front and
// back share the same cuts, so the page is the same page from both sides.
function age(g: CanvasRenderingContext2D, front: boolean) {
  g.fillStyle = 'rgba(60,50,38,.22)'; g.fillRect(0, PH / 2 - 1, PW, 2);
  g.fillStyle = 'rgba(255,250,238,.25)'; g.fillRect(0, PH / 2 + 1, PW, 1);
  if (front) {
    g.strokeStyle = 'rgba(92,70,48,.16)'; g.lineWidth = 7;
    g.beginPath(); g.arc(170, 1170, 66, 0.4, Math.PI * 1.85); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(172, 1168, 58, 1.2, Math.PI * 1.4); g.stroke();
  }
  // The corner, turned down: its shadow on the page, then the flap.
  const C = 92;
  g.fillStyle = 'rgba(30,24,18,.35)';
  g.beginPath(); g.moveTo(PW - C - 4, 0); g.lineTo(PW - C - 4, C + 6); g.lineTo(PW, C + 4); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(PW - C, 0); g.lineTo(PW, 0); g.lineTo(PW, C); g.closePath(); g.fill();
  // The tear, and the worn edges.
  g.beginPath(); g.moveTo(612, PH); g.lineTo(624, PH - 22); g.lineTo(631, PH - 9); g.lineTo(640, PH - 16); g.lineTo(648, PH); g.closePath(); g.fill();
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const side = i % 4, t = r(), rad = 1.5 + r() * 4;
    const x = side === 0 ? 0 : side === 1 ? PW : t * PW, y = side < 2 ? t * PH : side === 2 ? 0 : PH;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#c6bca6';
  g.beginPath(); g.moveTo(PW - C, 0); g.lineTo(PW - C, C); g.lineTo(PW, C); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,50,38,.4)'; g.lineWidth = 2; g.stroke();
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number) {
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > w && line) { g.fillText(line, x, y); y += lh; line = word; } else line = next;
    }
    g.fillText(line, x, y); y += lh;
  }
}
function drawPage() {
  const g = page.getContext('2d')!;
  parchment(g);
  g.fillStyle = INK; g.textBaseline = 'alphabetic';
  g.font = '76px UnifrakturMaguntia, serif'; g.fillText("To Kael'thos,", 90, 180);
  g.font = 'italic 36px "IM Fell English", serif'; g.fillText('at the event horizon.', 96, 234);
  g.font = `${FONT}px "IM Fell English", serif`;
  wrap(g, props.heading, 90, 314, 820, LINE);
  g.strokeStyle = 'rgba(40,32,24,.24)'; g.lineWidth = 2;
  for (let y = BODY.y + LINE; y <= BODY.y + BODY.h; y += LINE) { g.beginPath(); g.moveTo(BODY.x, y - 6); g.lineTo(BODY.x + BODY.w, y - 6); g.stroke(); }
  g.fillStyle = INK; wrap(g, props.modelValue, BODY.x, BODY.y + LINE - 12, BODY.w, LINE);
  g.font = 'italic 34px "IM Fell English", serif'; g.fillText('Yours, in study,', 600, 1086);
  g.font = '56px UnifrakturMaguntia, serif'; g.fillText('mr retard', 600, 1156);
  age(g, true);
  pageTex.needsUpdate = true;
}
function drawBack() {
  const g = back.getContext('2d')!;
  parchment(g);
  // Folded, the back of the upper half shows turned over: the address is
  // written there upside down on the flat page.
  g.save(); g.translate(PW / 2, PH * 0.1); g.rotate(Math.PI);
  g.fillStyle = INK; g.font = '52px UnifrakturMaguntia, serif'; g.textAlign = 'center';
  g.fillText("Kael'thos", 0, 0);
  g.restore();
  age(g, false);
  backTex.needsUpdate = true;
}

// His mark, for the wax: a ring of runes round an eye that does not close,
// and the arms that reach out of it.
function sigil(size: number, pressed: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d')!, c = size / 2, R = size * 0.46;
  const wax = g.createRadialGradient(c * 0.8, c * 0.7, 0, c, c, R * 1.1);
  wax.addColorStop(0, '#9a2a22'); wax.addColorStop(0.7, '#6a1812'); wax.addColorStop(1, '#3e0c08');
  g.fillStyle = wax; g.fillRect(0, 0, size, size);
  if (!pressed) return cv;
  // Everything cut twice: a dark line for the hollow, a light one above it
  // for the edge that catches the light.
  const cut = (draw: () => void, w: number) => {
    g.save(); g.translate(2, 2); g.strokeStyle = '#2a0805'; g.lineWidth = w; draw(); g.restore();
    g.save(); g.strokeStyle = '#c2574b'; g.lineWidth = w * 0.7; draw(); g.restore();
  };
  const u = size / 512;
  cut(() => { g.beginPath(); g.arc(c, c, R * 0.92, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, R * 0.74, 0, 7); g.stroke(); }, 6 * u);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, rr = R * 0.83, x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    cut(() => {
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.beginPath();
      const k = i % 3;
      if (k === 0) { g.moveTo(0, -12 * u); g.lineTo(0, 12 * u); g.moveTo(-8 * u, -4 * u); g.lineTo(8 * u, 4 * u); }
      else if (k === 1) { g.moveTo(-8 * u, 10 * u); g.lineTo(0, -10 * u); g.lineTo(8 * u, 10 * u); }
      else { g.arc(0, 0, 7 * u, 0, Math.PI); g.moveTo(0, -12 * u); g.lineTo(0, 0); }
      g.stroke(); g.restore();
    }, 4 * u);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    cut(() => {
      g.beginPath();
      const p = (t: number, off: number) => [c + Math.cos(a + off) * R * t, c + Math.sin(a + off) * R * t] as const;
      const [x0, y0] = p(0.3, 0), [x1, y1] = p(0.52, 0.35), [x2, y2] = p(0.68, -0.1), [x3, y3] = p(0.62, -0.32);
      g.moveTo(x0, y0); g.bezierCurveTo(x1, y1, x2, y2, x3, y3); g.stroke();
    }, 7 * u);
  }
  cut(() => {
    g.beginPath(); g.moveTo(c - R * 0.34, c);
    g.quadraticCurveTo(c, c - R * 0.34, c + R * 0.34, c); g.quadraticCurveTo(c, c + R * 0.34, c - R * 0.34, c); g.stroke();
  }, 8 * u);
  g.fillStyle = '#2a0805'; g.beginPath(); g.ellipse(c, c, R * 0.045, R * 0.15, 0, 0, 7); g.fill();
  return cv;
}
// Where the stamp goes: a ring of runes, drawn once, turned slowly.
function runeRing(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d')!, c = size / 2;
  g.strokeStyle = '#e6e0d4'; g.lineWidth = 3;
  g.setLineDash([10, 12]); g.beginPath(); g.arc(c, c, size * 0.45, 0, 7); g.stroke();
  g.setLineDash([]); g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * size * 0.38, c + Math.sin(a) * size * 0.38); g.rotate(a);
    g.beginPath(); g.moveTo(-6, -8); g.lineTo(0, 8); g.lineTo(6, -8); if (i % 2) { g.moveTo(-8, 0); g.lineTo(8, 0); } g.stroke(); g.restore();
  }
  return cv;
}

drawPage(); drawBack();
document.fonts.ready.then(() => { drawPage(); drawBack(); });
watch(() => [props.heading, props.modelValue], drawPage);

// ---- the scene -----------------------------------------------------------
type Phase = 'open' | 'write' | 'fold' | 'drip' | 'stamp' | 'press' | 'fly' | 'gone';
const phase = ref<Phase>(reduced() ? 'write' : 'open');
const box = ref({ left: 0, top: 0, width: 0, height: 0, scale: 1 });
const grab = ref<'' | 'near' | 'held'>('');
let started = performance.now() / 1000;
const setPhase = (p: Phase) => { phase.value = p; started = performance.now() / 1000; };

// What the pointer needs from the scene, filled in once it is built.
let cam: THREE.PerspectiveCamera | null = null, glass: HTMLCanvasElement | null = null;
let stampAt: THREE.Vector3 | null = null;
const want = new THREE.Vector3(), pressFrom = new THREE.Vector3();
let held = false, moved = false, press0 = { x: 0, y: 0 };
const HOVER_Z = 0.45;
const SEAL_Y = -H / 4;
const HOME = new THREE.Vector3(W / 2 + 0.55, SEAL_Y + 0.2, HOVER_Z);
const TARGET = new THREE.Vector3(0, SEAL_Y, HOVER_Z);

function half(top: boolean) {
  const g = new THREE.Group();
  const geo = (flip: boolean) => {
    const pg = new THREE.PlaneGeometry(W, H / 2);
    const uv = pg.attributes.uv!;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, flip ? 1 - u : u, top ? 0.5 + v / 2 : v / 2); }
    return pg;
  };
  const front = new THREE.Mesh(geo(false), new THREE.MeshBasicMaterial({ map: pageTex, alphaTest: 0.5 }));
  const rear = new THREE.Mesh(geo(true), new THREE.MeshBasicMaterial({ map: backTex, alphaTest: 0.5 }));
  rear.rotation.y = Math.PI;
  g.add(front, rear);
  return g;
}

const build = ({ scene, group, camera, canvas }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement }) => {
  cam = camera; glass = canvas;
  const letter = new THREE.Group(); group.add(letter);
  const hinge = new THREE.Group(); letter.add(hinge);
  const upper = half(true); upper.position.y = H / 4; hinge.add(upper);
  const lower = half(false); lower.position.y = -H / 4; letter.add(lower);

  // The wax: a blot with a ragged edge, first smooth, then pressed.
  const smooth = new THREE.CanvasTexture(sigil(512, false)), pressed = new THREE.CanvasTexture(sigil(512, true));
  smooth.colorSpace = pressed.colorSpace = THREE.SRGBColorSpace;
  const blotGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.035, 48, 1);
  const pos = blotGeo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 0.2) { const a = Math.atan2(z, x), k = 1 + 0.07 * Math.sin(a * 5) + 0.05 * Math.sin(a * 11 + 1); pos.setX(i, x * k); pos.setZ(i, z * k); }
  }
  blotGeo.computeVertexNormals();
  const waxSide = new THREE.MeshStandardMaterial({ color: 0x5a140f, roughness: 0.35, emissive: 0x2a0806 });
  const waxTop = new THREE.MeshStandardMaterial({ map: smooth, roughness: 0.35, emissive: 0x220605, emissiveMap: smooth });
  const blot = new THREE.Mesh(blotGeo, [waxSide, waxTop, waxSide]);
  blot.rotation.x = Math.PI / 2; blot.visible = false; letter.add(blot);
  // The ring that shows where the stamp goes.
  const ringMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(runeRing(256)), transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), ringMat);
  ring.position.set(0, SEAL_Y, 0.04); letter.add(ring);
  // The stamp: a dark handle, a brass neck and the die, the die toward the page.
  const stamp = new THREE.Group(); stamp.visible = false; letter.add(stamp);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8a67e, roughness: 0.3, metalness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x2c2621, roughness: 0.5, metalness: 0.1 });
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, z: number) => { const x = new THREE.Mesh(geo, m); x.rotation.x = Math.PI / 2; x.position.z = z; stamp.add(x); };
  part(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 40), brass, 0.03);
  part(new THREE.CylinderGeometry(0.06, 0.12, 0.1, 24), brass, 0.11);
  part(new THREE.CylinderGeometry(0.075, 0.055, 0.42, 24), wood, 0.37);
  part(new THREE.TorusGeometry(0.075, 0.012, 8, 24), brass, 0.2);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), wood); knob.position.z = 0.62; stamp.add(knob);
  stamp.position.copy(HOME); stampAt = stamp.position;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff0e0, 1.6); key.position.set(-2, 3, 4); scene.add(key);

  const v = new THREE.Vector3();
  const toScreen = (x: number, y: number) => {
    v.set(x, y, 0).applyMatrix4(letter.matrixWorld).project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  };
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const overshoot = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
  const clamp = (u: number) => Math.max(0, Math.min(1, u));
  return (t: number, dt: number) => {
    // Framed with room beside the letter for the stamp, and a strip below.
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), h = canvas.clientHeight || 600;
    const half = (H / 2 + 0.2) * (h / Math.max(1, h - STRIP));
    const d = Math.max(half / f, (W / 2 + 1.0) / (f * camera.aspect));
    const V = d * f, strip = (STRIP / h) * 2 * V;
    camera.position.set(0, -strip / 2, d); camera.lookAt(0, -strip / 2, 0);
    const u = performance.now() / 1000 - started, calm = reduced();
    const p = phase.value;
    if (p === 'open') {
      // It arrives folded, rising out of the dark, and opens.
      const k = ease(clamp(u / 0.9)), o = ease(clamp((u - 0.8) / 0.7));
      letter.position.set(0, -2.6 * (1 - k), 0);
      letter.rotation.set(0.6 * (1 - k), 0, -0.25 * (1 - k));
      hinge.rotation.x = Math.PI * (1 - o);
      hinge.position.z = 0.006 * (1 - o);
      if (u >= 1.55) { hinge.rotation.x = 0; hinge.position.z = 0; setPhase('write'); }
    } else if (p === 'write') {
      letter.position.set(0, calm ? 0 : Math.sin(t * 0.8) * 0.008, 0); letter.rotation.set(0, 0, 0);
      group.updateMatrixWorld();
      const a = toScreen(-W / 2 + (BODY.x / PW) * W, H / 2 - (BODY.y / PH) * H);
      const b = toScreen(-W / 2 + ((BODY.x + BODY.w) / PW) * W, H / 2 - ((BODY.y + BODY.h) / PH) * H);
      box.value = { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, scale: (b.x - a.x) / BODY.w };
    } else if (p === 'fold') {
      letter.position.set(0, 0, 0);
      const k = ease(clamp(u / 0.75));
      hinge.rotation.x = Math.PI * k;
      hinge.position.z = 0.006 * k;
      if (u >= 0.85) setPhase('drip');
    } else if (p === 'drip') {
      blot.visible = true;
      blot.position.set(0, SEAL_Y, 0.03);
      const k = overshoot(clamp(u / 0.45));
      blot.scale.set(k, 1, k);
      if (u >= 0.5) { stamp.visible = true; stamp.position.set(HOME.x, HOME.y - 1.5, HOME.z); setPhase('stamp'); }
    } else if (p === 'stamp') {
      // The stamp waits beside the letter, or follows the hand that holds it.
      const goal = held ? want : HOME.clone().setY(HOME.y + (calm ? 0 : Math.sin(t * 1.4) * 0.04));
      stamp.position.lerp(goal, 1 - Math.exp(-dt * (held ? 18 : 6)));
      stamp.rotation.set(held ? 0.1 : 0.25, held ? -0.15 : -0.45, calm ? 0 : Math.sin(t * 0.7) * 0.1);
      // The ring glows, brighter the nearer the stamp comes.
      const near = clamp(1 - stamp.position.distanceTo(TARGET) / 1.2);
      ringMat.opacity = (0.35 + 0.25 * Math.sin(t * 3)) * (1 - near) + near * 0.95;
      ring.rotation.z = t * 0.3;
      ring.scale.setScalar(1 + near * 0.08);
    } else if (p === 'press') {
      // Over the wax, down, pressed, the mark left; lifted away.
      const from = pressFrom;
      const over = ease(clamp(u / 0.4)), down = ease(clamp((u - 0.4) / 0.22)), up = ease(clamp((u - 0.85) / 0.45));
      const press = clamp((u - 0.6) / 0.08) * (1 - clamp((u - 0.8) / 0.08));
      const x = from.x + (TARGET.x - from.x) * over, y = from.y + (TARGET.y - from.y) * over;
      stamp.position.set(x, y, (from.z + (HOVER_Z - from.z) * over) * (1 - down) + 0.05 * down - press * 0.012 + up * 2.4);
      stamp.rotation.set(0.25 * (1 - over), -0.45 * (1 - over), up * -0.8);
      stamp.scale.setScalar(1 - up * 0.4);
      blot.scale.set(1 + press * 0.12, 1 - press * 0.35, 1 + press * 0.12);
      if (u > 0.66 && waxTop.map !== pressed) { waxTop.map = pressed; waxTop.emissiveMap = pressed; waxTop.needsUpdate = true; }
      ringMat.opacity = Math.max(0, 0.95 - u * 2);
      letter.position.x = calm ? 0 : press * Math.sin(u * 90) * 0.01;
      if (u >= 1.45) { stamp.visible = false; letter.position.x = 0; setPhase('fly'); }
    } else if (p === 'fly') {
      const k = ease(clamp(u / 1.3));
      const dir = new THREE.Vector3(-0.9, -0.86, 0.5).unproject(camera).sub(camera.position).normalize();
      const end = camera.position.clone().addScaledVector(dir, camera.position.z * 0.62);
      letter.position.set(end.x * k, end.y * k + Math.sin(k * Math.PI) * 0.5, end.z * k);
      letter.rotation.set(-0.5 * Math.sin(k * Math.PI), 0, k * 0.9);
      letter.scale.setScalar(1 - 0.88 * k);
      if (u >= 1.35) { setPhase('gone'); letter.visible = false; emit('arrived'); }
    }
  };
};

// ---- the hand ----------------------------------------------------------------
function fold() {
  if (props.busy || props.modelValue.trim().length < 3 || phase.value !== 'write') return;
  setPhase('fold');
}
function pressIt() {
  if (phase.value !== 'stamp') return;
  held = false; grab.value = '';
  if (stampAt) pressFrom.copy(stampAt);
  emit('send');
  setPhase('press');
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) fold(); };
// Where a point in the scene is on screen, and the point in the stamp's
// plane under the pointer.
const onScreen = (p: THREE.Vector3) => {
  const v = p.clone().project(cam!);
  return { x: ((v.x + 1) / 2) * glass!.clientWidth, y: ((1 - v.y) / 2) * glass!.clientHeight };
};
function under(e: PointerEvent) {
  const r = glass!.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam!);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -HOVER_Z), new THREE.Vector3());
}
const local = (e: PointerEvent) => { const r = glass!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function down(e: PointerEvent) {
  if (!cam || !stampAt || phase.value !== 'stamp') return;
  const at = local(e);
  if (dist(at, onScreen(stampAt)) > 90) return;
  held = true; moved = false; press0 = at; grab.value = 'held';
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const p = under(e); if (p) want.copy(p);
}
function move(e: PointerEvent) {
  if (!cam || !stampAt || phase.value !== 'stamp') return;
  const at = local(e);
  if (!held) { grab.value = dist(at, onScreen(stampAt)) < 90 ? 'near' : ''; return; }
  if (dist(at, press0) > 6) moved = true;
  const p = under(e); if (p) want.copy(p);
}
function up() {
  if (!held) return;
  held = false; grab.value = '';
  // A click presses it for you; a drop on the wax presses it by hand; a drop
  // anywhere else and it drifts back.
  if (!moved || dist(onScreen(stampAt!), onScreen(TARGET)) < 80) pressIt();
}
onBeforeUnmount(() => { pageTex.dispose(); backTex.dispose(); });
</script>

<template>
  <div class="letter">
    <div class="desk">
      <Gl :build="build" :active="true" :options="{ dither: false, drift: 0, tilt: 0, yaw: 0, fov: 30 }" label="A letter to Kael'thos, on parchment." hint="" />
      <textarea v-if="phase === 'write'" class="pen" :value="modelValue" spellcheck="false" autocomplete="off" maxlength="300" aria-label="What the lecture is about"
                :style="{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, fontSize: `${box.scale * FONT}px`, lineHeight: `${box.scale * LINE}px` }"
                @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown="onKey"></textarea>
      <div v-if="phase === 'stamp'" class="hand" :class="grab" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></div>
      <Transition name="fade" mode="out-in">
        <button v-if="phase === 'write'" key="fold" class="btn send" :disabled="busy || modelValue.trim().length < 3" title="ctrl + enter" @click="fold">
          <i class="blot" aria-hidden="true"></i>fold it // seal it
        </button>
        <p v-else-if="phase === 'stamp'" key="hint" class="send hint-line pix">take the stamp and press it into the wax // or click it</p>
      </Transition>
    </div>
    <aside v-if="(phase === 'write' || phase === 'open') && topics.length" class="syllabus">
      <p class="pix">the syllabus, in order</p>
      <ol>
        <li v-for="(t, i) in topics" :key="i" :class="{ near: i === guessed, now: modelValue.includes(t) }">
          <span class="n pix">{{ String(i + 1).padStart(2, '0') }}</span>
          <button class="fell" @click="emit('update:modelValue', t)">{{ t }}</button>
        </li>
      </ol>
      <p class="note">{{ note }}</p>
    </aside>
  </div>
</template>

<style scoped>
.letter { position: absolute; inset: 0; display: flex; text-align: left; }
.desk { position: relative; flex: 1; min-width: 0; display: flex; }
.desk :deep(.gl) { width: 100%; height: 100%; flex: 1; cursor: default; pointer-events: none; }
.desk :deep(.hint) { display: none; }
/* The words are drawn on the page itself; the field only carries the caret. */
.pen { position: absolute; background: transparent; border: 0; outline: none; resize: none; padding: 0; margin: 0; overflow: hidden;
  font-family: 'IM Fell English', Georgia, serif; color: transparent; caret-color: #17130f; }
.pen::selection { background: rgba(23, 19, 15, .22); color: transparent; }
.hand { position: absolute; inset: 0; touch-action: none; }
.hand.near { cursor: grab; }
.hand.held { cursor: grabbing; }
.send { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: var(--ground); margin: 0; white-space: nowrap; }
.send:hover:not(:disabled) { transform: translateX(-50%); }
.send:active:not(:disabled) { transform: translateX(-50%) scale(.985); }
.send:disabled { opacity: .45; cursor: default; }
.hint-line { bottom: 30px; color: var(--phos); background: none; animation: breathe 2.4s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .5; } }
.blot { width: 12px; height: 12px; border-radius: 50% 46% 52% 44%; background: radial-gradient(circle at 35% 35%, #a33a30, #5e140f 70%); box-shadow: 0 0 6px rgba(160, 50, 40, .45); }
.fade-enter-active, .fade-leave-active { transition: opacity .3s var(--out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.syllabus { position: relative; z-index: 1; width: 320px; flex: none; overflow: auto; overscroll-behavior: contain; padding: 20px 20px 130px; background: var(--ground); border-left: 3px dotted var(--low);
  scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.syllabus ol { list-style: none; margin: 12px 0 16px; padding: 0; display: grid; gap: 0; }
.syllabus li { display: grid; grid-template-columns: 26px 1fr; align-items: baseline; padding: 6px 0; border-bottom: 1px dotted var(--faint); }
.syllabus .n { color: var(--low); }
.syllabus li button { text-align: left; color: var(--dim); font-size: 15px; line-height: 1.3; transition: color .25s var(--out); }
.syllabus li button:hover { color: var(--hi); }
.syllabus li.near .n, .syllabus li.near button { color: var(--phos); }
.syllabus li.near button { text-decoration: underline dotted; text-underline-offset: 4px; }
.syllabus li.now button { color: var(--hi); }
.syllabus .note { line-height: 1.5; }
@media (max-width: 860px) {
  .letter { flex-direction: column; }
  .syllabus { width: auto; max-height: 32%; border-left: 0; border-top: 3px dotted var(--low); padding: 12px 16px 100px; }
  .hint-line { font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) { .hint-line { animation: none; } }
</style>
