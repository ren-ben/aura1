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
// The cup ring in the bottom corner, where the seal is pressed.
const SEAT = { x: 205, y: 1128 };
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
  // A ring where a cup once stood: where the seal goes.
  if (front) {
    g.strokeStyle = 'rgba(92,70,48,.16)'; g.lineWidth = 7;
    g.beginPath(); g.arc(SEAT.x, SEAT.y, 70, 0.4, Math.PI * 1.85); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(SEAT.x + 2, SEAT.y - 2, 62, 1.2, Math.PI * 1.4); g.stroke();
  }
  // The corner, turned down: cut away, and folded over onto the page.
  const C = 92;
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
  // The flap: a shade darker than the page, its shadow a soft band along
  // the fold only.
  const shade = g.createLinearGradient(PW - C / 2, C / 2, PW - C / 2 - 14, C / 2 + 14);
  shade.addColorStop(0, 'rgba(30,24,18,.28)'); shade.addColorStop(1, 'rgba(30,24,18,0)');
  g.fillStyle = shade;
  g.beginPath(); g.moveTo(PW - C, 0); g.lineTo(PW, C); g.lineTo(PW - 14, C + 14); g.lineTo(PW - C - 14, 14); g.closePath(); g.fill();
  g.fillStyle = '#c9bfa9';
  g.beginPath(); g.moveTo(PW - C, 0); g.lineTo(PW - C, C); g.lineTo(PW, C); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,50,38,.35)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(PW - C, 0); g.lineTo(PW, C); g.stroke();
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
  // Folded, the back of the upper half shows turned over top to bottom: the
  // address is written there upside down on the flat page (mirrored in
  // height only).
  g.save(); g.translate(PW / 2, PH * 0.1); g.scale(1, -1);
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
// Where the stamp goes: a ring of square dots and runes, the way the
// console's frames are dotted, drawn once.
function runeRing(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d')!, c = size / 2;
  g.fillStyle = '#fff';
  for (let i = 0; i < 44; i++) { const a = (i / 44) * Math.PI * 2; g.fillRect(Math.round(c + Math.cos(a) * size * 0.46) - 3, Math.round(c + Math.sin(a) * size * 0.46) - 3, 6, 6); }
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'square';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * size * 0.37, c + Math.sin(a) * size * 0.37); g.rotate(a + Math.PI / 2);
    g.beginPath(); g.moveTo(-9, -10); g.lineTo(0, 10); g.lineTo(9, -10); if (i % 2) { g.moveTo(-11, 0); g.lineTo(11, 0); } g.stroke(); g.restore();
  }
  return cv;
}

drawPage(); drawBack();
document.fonts.ready.then(() => { drawPage(); drawBack(); });
watch(() => [props.heading, props.modelValue], drawPage);

// ---- the console's dither, on single things ------------------------------
// The letter is drawn crisp, to be read; the wax, the stamp and the ring on
// it are thresholded to two inks the way every other scene is, in cells of
// the same size.
const CELL = 2 * Math.min(devicePixelRatio, 2);
const BAYER = `
  float b2(vec2 a) { a = floor(mod(a, 2.0)); return mod(a.x * 2.0 + a.y * 3.0, 4.0); }
  float bayer(vec2 p) { return (4.0 * b2(p) + b2(floor(p / 2.0))) / 16.0; }`;
function dithered<M extends THREE.Material>(m: M, ink: number, ground: number): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.inkC = { value: new THREE.Color(ink) };
    sh.uniforms.groundC = { value: new THREE.Color(ground) };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform vec3 inkC; uniform vec3 groundC;${BAYER}\nvoid main() {`)
      .replace(/}\s*$/, `  float l = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(l > bayer(floor(gl_FragCoord.xy / ${CELL.toFixed(1)})) + 0.015 ? inkC : groundC, 1.0);
}`);
  };
  return m;
}
// A dithered stain in one ink, fading out by a strength: the shadow, the ring.
function stain(map: THREE.Texture | null, ink: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: map }, strength: { value: 0 }, inkC: { value: new THREE.Color(ink) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float strength; uniform vec3 inkC; varying vec2 vUv;${BAYER}
      void main() {
        float a = ${map ? 'texture2D(map, vUv).a' : 'smoothstep(0.5, 0.0, length(vUv - 0.5))'} * strength;
        if (a <= bayer(floor(gl_FragCoord.xy / ${CELL.toFixed(1)})) + 0.02) discard;
        gl_FragColor = vec4(inkC, 1.0);
      }`,
  });
}

// ---- the scene -----------------------------------------------------------
type Phase = 'open' | 'write' | 'drip' | 'stamp' | 'press' | 'fold' | 'fly' | 'gone';
const phase = ref<Phase>(reduced() ? 'write' : 'open');
const box = ref({ left: 0, top: 0, width: 0, height: 0, scale: 1 });
const grab = ref<'' | 'near' | 'held'>('');
let started = performance.now() / 1000;
const setPhase = (p: Phase) => { phase.value = p; started = performance.now() / 1000; };

// Where things are, in the letter's plane (it lies at the origin, facing us).
const X = (px: number) => -W / 2 + (px / PW) * W, Y = (py: number) => H / 2 - (py / PH) * H;
const SEAL = new THREE.Vector3(X(SEAT.x), Y(SEAT.y), 0);
const HOLD_Z = 0.5;
// The stamp at rest: stood on its die on the desk, left of the letter,
// leaning a little away from it, the way a thing is set down.
const REST = new THREE.Vector3(-W / 2 - 0.42, SEAL.y + 0.3, 0.04);
const RESTING = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, -0.38, 0.22));
const UPRIGHT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, -0.1, 0.05));

// What the hand needs from the scene, filled in once it is built.
let cam: THREE.PerspectiveCamera | null = null, glass: HTMLCanvasElement | null = null, stampObj: THREE.Group | null = null;
const want = new THREE.Vector3(), pressFrom = new THREE.Vector3();
let held = false;

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

  // The wax: a blot with a ragged edge, in two reds; smooth, then pressed.
  const smooth = new THREE.CanvasTexture(sigil(512, false)), pressed = new THREE.CanvasTexture(sigil(512, true));
  smooth.colorSpace = pressed.colorSpace = THREE.SRGBColorSpace;
  const blotGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.03, 48, 1);
  const pos = blotGeo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 0.15) { const a = Math.atan2(z, x), k = 1 + 0.07 * Math.sin(a * 5) + 0.05 * Math.sin(a * 11 + 1); pos.setX(i, x * k); pos.setZ(i, z * k); }
  }
  blotGeo.computeVertexNormals();
  const RED = 0xb4402f, DEEP = 0x2c0906;
  const waxSide = dithered(new THREE.MeshStandardMaterial({ color: 0x8a2a20, roughness: 0.35 }), RED, DEEP);
  const waxTop = dithered(new THREE.MeshStandardMaterial({ map: smooth, roughness: 0.35, emissive: 0x552018, emissiveMap: smooth }), RED, DEEP);
  const blot = new THREE.Mesh(blotGeo, [waxSide, waxTop, waxSide]);
  blot.rotation.x = Math.PI / 2; blot.position.set(SEAL.x, SEAL.y, 0.02); blot.visible = false; lower.parent!.add(blot);
  // The ring that shows where the stamp goes, and the stamp's shadow.
  const ringTex = new THREE.CanvasTexture(runeRing(256));
  const ringMat = stain(ringTex, 0x17130f);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), ringMat);
  ring.position.set(SEAL.x, SEAL.y, 0.04); letter.add(ring);
  const shadowMat = stain(null, 0x17130f);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), shadowMat);
  shadow.position.z = 0.01; letter.add(shadow);
  // The stamp, gothic: a die with a beaded rim, a collar crowned with iron
  // thorns, a turned ebony handle, faceted, and a spire for a finial with
  // thorns of its own. Built along its axis, the die toward the page.
  const stamp = new THREE.Group(); stamp.visible = false; letter.add(stamp); stampObj = stamp;
  const PHOS = 0xc5bcab, GROUND = 0x121212;
  const iron = dithered(new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.28, metalness: 0.75, emissive: 0x1c1a16 }), PHOS, GROUND);
  const ebony = dithered(new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 0.35, metalness: 0.2 }), PHOS, GROUND);
  const along = (m: THREE.Object3D, z: number) => { m.rotation.x = Math.PI / 2; m.position.z = z; stamp.add(m); return m; };
  const turned = (profile: [number, number][], m: THREE.Material, facets: number) =>
    along(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), facets), m), 0);
  // The metal: die, rim and collar.
  turned([[0, 0], [0.17, 0], [0.17, 0.035], [0.155, 0.045], [0.155, 0.06], [0.12, 0.075], [0.07, 0.1], [0.055, 0.13],
    [0.09, 0.16], [0.095, 0.185], [0.06, 0.2], [0.05, 0.23], [0, 0.23]], iron, 16);
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), iron);
    bead.position.set(Math.cos(a) * 0.162, Math.sin(a) * 0.162, 0.05); stamp.add(bead);
  }
  // The crown of thorns round the collar, leaning outward and up.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 5), iron);
    thorn.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.2);
    thorn.lookAt(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.55); thorn.rotateX(Math.PI / 2);
    stamp.add(thorn);
  }
  // The handle: turned ebony, faceted, swelling and narrowing, banded.
  turned([[0.05, 0.23], [0.042, 0.3], [0.058, 0.36], [0.09, 0.44], [0.098, 0.5], [0.08, 0.56], [0.046, 0.6],
    [0.04, 0.64], [0, 0.64]], ebony, 8);
  along(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), iron), 0.37);
  along(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 16), iron), 0.605);
  // The finial: a spire, and small thorns round its foot.
  turned([[0.04, 0.64], [0.07, 0.66], [0.07, 0.685], [0.034, 0.7], [0.03, 0.78], [0.016, 0.9], [0, 1.0]], iron, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 4), iron);
    thorn.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.72);
    thorn.lookAt(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.95); thorn.rotateX(Math.PI / 2);
    stamp.add(thorn);
  }
  stamp.position.copy(REST); stamp.quaternion.copy(RESTING);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.2); key.position.set(-2, 3, 4); scene.add(key);

  const v = new THREE.Vector3();
  const toScreen = (x: number, y: number) => {
    v.set(x, y, 0).applyMatrix4(letter.matrixWorld).project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  };
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const overshoot = (u: number) => 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2;
  const clamp = (u: number) => Math.max(0, Math.min(1, u));
  const upright = new THREE.Quaternion();
  return (t: number, dt: number) => {
    // Framed with room left of the letter for the stamp, and a strip below.
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), h = canvas.clientHeight || 600;
    const half = (H / 2 + 0.2) * (h / Math.max(1, h - STRIP));
    const d = Math.max(half / f, (W / 2 + 0.95) / (f * camera.aspect));
    const V = d * f, strip = (STRIP / h) * 2 * V;
    camera.position.set(-0.25, -strip / 2, d); camera.lookAt(-0.25, -strip / 2, 0);
    const u = performance.now() / 1000 - started, calm = reduced();
    const p = phase.value;
    if (p === 'open') {
      // It arrives folded, rising out of the dark, and opens, ending exactly
      // where it will rest.
      const k = ease(clamp(u / 0.9)), o = ease(clamp((u - 0.8) / 0.7));
      letter.position.set(0, -2.6 * (1 - k), 0);
      letter.rotation.set(0.6 * (1 - k), 0, -0.25 * (1 - k));
      hinge.rotation.x = Math.PI * (1 - o);
      hinge.position.z = 0.006 * (1 - o);
      if (u >= 1.5) setPhase('write');
    } else if (p === 'write') {
      letter.position.set(0, 0, 0); letter.rotation.set(0, 0, 0); hinge.rotation.x = 0; hinge.position.z = 0;
      group.updateMatrixWorld();
      const a = toScreen(X(BODY.x), Y(BODY.y)), b = toScreen(X(BODY.x + BODY.w), Y(BODY.y + BODY.h));
      box.value = { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, scale: (b.x - a.x) / BODY.w };
    } else if (p === 'drip') {
      // Wax drips onto the ring in the corner; the stamp is laid beside it.
      blot.visible = true; stamp.visible = true;
      const k = overshoot(clamp(u / 0.45));
      blot.scale.set(k, 1, k);
      ringMat.uniforms.strength!.value = clamp(u / 0.5) * 0.7;
      if (u >= 0.5) setPhase('stamp');
    } else if (p === 'stamp') {
      // At rest on its side until it is held; held, it stands up and follows
      // the hand, a shadow under it on the page.
      stamp.position.lerp(held ? want : REST, 1 - Math.exp(-dt * (held ? 20 : 9)));
      stamp.quaternion.slerp(held ? UPRIGHT : RESTING, 1 - Math.exp(-dt * 12));
      const lift = clamp((stamp.position.z - 0.05) / HOLD_Z);
      shadow.position.set(stamp.position.x + lift * 0.08, stamp.position.y - lift * 0.1, 0.01);
      shadow.scale.setScalar(0.6 + lift * 0.5);
      shadowMat.uniforms.strength!.value = held ? 0.7 - lift * 0.35 : 0;
      // The ring breathes, and burns brighter the nearer the stamp comes.
      const near = held ? clamp(1 - Math.hypot(stamp.position.x - SEAL.x, stamp.position.y - SEAL.y) / 0.9) : 0;
      ringMat.uniforms.strength!.value = (calm ? 0.6 : 0.5 + 0.2 * Math.sin(t * 3)) * (1 - near) + near * 1.1;
      ring.scale.setScalar(1 + near * 0.1);
    } else if (p === 'press') {
      // Over the wax, straight down, pressed, the mark left; back to its place.
      const over = ease(clamp(u / 0.25)), down = ease(clamp((u - 0.25) / 0.18)), back = ease(clamp((u - 0.7) / 0.5));
      const press = clamp((u - 0.43) / 0.06) * (1 - clamp((u - 0.58) / 0.08));
      const at = pressFrom.clone().lerp(new THREE.Vector3(SEAL.x, SEAL.y, HOLD_Z), over);
      at.z = at.z * (1 - down) + 0.035 * down - press * 0.01;
      stamp.position.copy(at.lerp(REST, back));
      upright.copy(UPRIGHT).slerp(RESTING, back);
      stamp.quaternion.copy(upright);
      blot.scale.set(1 + press * 0.12, 1 - press * 0.35, 1 + press * 0.12);
      if (u > 0.5 && waxTop.map !== pressed) { waxTop.map = pressed; waxTop.emissiveMap = pressed; waxTop.needsUpdate = true; }
      ringMat.uniforms.strength!.value = Math.max(0, 1.1 - u * 2.5);
      shadowMat.uniforms.strength!.value = (1 - back) * 0.6;
      shadow.position.set(stamp.position.x, stamp.position.y, 0.01);
      letter.position.x = calm ? 0 : press * Math.sin(u * 90) * 0.01;
      if (u >= 1.3) { letter.position.x = 0; setPhase('fold'); }
    } else if (p === 'fold') {
      // The upper half folds down over the writing and the seal.
      const k = ease(clamp(u / 0.8));
      hinge.rotation.x = Math.PI * k;
      hinge.position.z = 0.05 * k;
      stamp.visible = u < 0.2;
      if (u >= 0.9) setPhase('fly');
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
function seal() {
  if (props.busy || props.modelValue.trim().length < 3 || phase.value !== 'write') return;
  setPhase('drip');
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) seal(); };
// Where a point of the scene is on the screen, and the point at holding
// height under the pointer.
const onScreen = (p: THREE.Vector3) => {
  const v = p.clone().project(cam!);
  return { x: ((v.x + 1) / 2) * glass!.clientWidth, y: ((1 - v.y) / 2) * glass!.clientHeight };
};
function under(e: PointerEvent) {
  const r = glass!.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam!);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -HOLD_Z), new THREE.Vector3());
}
const local = (e: PointerEvent) => { const r = glass!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
// The middle of the stamp as it lies, for finding it under the pointer.
const stampMiddle = () => stampObj!.localToWorld(new THREE.Vector3(0, 0, 0.4));
function down(e: PointerEvent) {
  if (!cam || !stampObj || phase.value !== 'stamp') return;
  if (dist(local(e), onScreen(stampMiddle())) > 110) return;
  held = true; grab.value = 'held';
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  const p = under(e); if (p) want.copy(p);
}
function move(e: PointerEvent) {
  if (!cam || !stampObj || phase.value !== 'stamp') return;
  if (!held) { grab.value = dist(local(e), onScreen(stampMiddle())) < 110 ? 'near' : ''; return; }
  const p = under(e); if (p) want.copy(p);
}
// Let go over the wax, and it presses; anywhere else, and it is laid back.
function up() {
  if (!held || !stampObj) return;
  held = false; grab.value = '';
  if (dist(onScreen(stampObj.position), onScreen(new THREE.Vector3(SEAL.x, SEAL.y, HOLD_Z))) < 80) {
    pressFrom.copy(stampObj.position);
    emit('send');
    setPhase('press');
  }
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
        <button v-if="phase === 'write' || phase === 'open'" key="seal" class="btn send" :disabled="busy || phase === 'open' || modelValue.trim().length < 3" title="ctrl + enter" @click="seal">
          <i class="blot" aria-hidden="true"></i>seal it
        </button>
        <p v-else-if="phase === 'stamp'" key="hint" class="send hint-line pix">hold the stamp // press it into the wax</p>
      </Transition>
    </div>
    <aside v-if="topics.length" class="syllabus" :class="{ done: phase !== 'write' && phase !== 'open' }">
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
  scrollbar-width: thin; scrollbar-color: var(--low) transparent; transition: opacity .6s var(--out); }
/* Once sealed, the syllabus stays where it is, only quieter. */
.syllabus.done { opacity: .3; pointer-events: none; }
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
