<script setup lang="ts">
// A letter to Kael'thos, asking for a lecture's map: parchment in the
// console's dither, written on in ink. Sealed, it folds, takes the wax, and
// flies to the corner where he sits.
import { onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import Gl from './Gl.vue';
import { reduced } from '../gl/engine';
import { lights } from '../gl/models';

const props = defineProps<{ modelValue: string; topics: string[]; guessed: number; heading: string; note: string; busy: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [string]; send: []; arrived: [] }>();

// The letter's page, in canvas pixels, and where the reader writes on it.
const PW = 1000, PH = 1300;
const BODY = { x: 90, y: 400, w: 820, h: 560 };
const W = 2.0, H = (W * PH) / PW;
const ink = '#1c1916';

const page = document.createElement('canvas'); page.width = PW; page.height = PH;
const back = document.createElement('canvas'); back.width = PW; back.height = PH;
const pageTex = new THREE.CanvasTexture(page); pageTex.colorSpace = THREE.SRGBColorSpace;
const backTex = new THREE.CanvasTexture(back); backTex.colorSpace = THREE.SRGBColorSpace;

function parchment(g: CanvasRenderingContext2D) {
  g.fillStyle = '#e4dccb'; g.fillRect(0, 0, PW, PH);
  let s = 9;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { const v = 170 + r() * 60; g.fillStyle = `rgba(${v},${v - 6},${v - 16},.35)`; g.fillRect(r() * PW, r() * PH, 2 + r() * 8, 1 + r() * 3); }
  // Foxing at the edges, darker toward the corners.
  const edge = g.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PH * 0.78);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(60,50,40,.55)');
  g.fillStyle = edge; g.fillRect(0, 0, PW, PH);
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
// The page: the salutation and the ask are his to read; the body is what is
// written, drawn in only once it is sealed (until then the page is written
// on directly).
function drawPage(withBody: boolean) {
  const g = page.getContext('2d')!;
  parchment(g);
  g.fillStyle = ink; g.textBaseline = 'alphabetic';
  g.font = '64px UnifrakturMaguntia, serif'; g.fillText("To Kael'thos,", 90, 170);
  g.font = 'italic 34px "IM Fell English", serif'; g.fillText('at the event horizon.', 96, 222);
  g.font = '30px "IM Fell English", serif';
  wrap(g, props.heading, 90, 300, 820, 40);
  // Faint ruled lines for the writing.
  g.strokeStyle = 'rgba(40,34,28,.22)'; g.lineWidth = 2;
  for (let y = BODY.y + 44; y < BODY.y + BODY.h; y += 44) { g.beginPath(); g.moveTo(BODY.x, y); g.lineTo(BODY.x + BODY.w, y); g.stroke(); }
  if (withBody) { g.font = '36px "IM Fell English", serif'; wrap(g, props.modelValue, BODY.x, BODY.y + 36, BODY.w, 44); }
  g.font = 'italic 32px "IM Fell English", serif'; g.fillText('Yours, in study,', 560, 1080);
  g.font = '44px UnifrakturMaguntia, serif'; g.fillText('the one you chose', 560, 1140);
  pageTex.needsUpdate = true;
}
function drawBack() {
  const g = back.getContext('2d')!;
  parchment(g);
  // Folded, the back of the upper half is what shows, turned over: the
  // address is written there, upside down on the flat page.
  g.save(); g.translate(PW / 2, PH * 0.09); g.rotate(Math.PI);
  g.fillStyle = ink; g.font = '44px UnifrakturMaguntia, serif'; g.textAlign = 'center';
  g.fillText("Kael'thos", 0, 0);
  g.restore();
  backTex.needsUpdate = true;
}
drawPage(false); drawBack();
document.fonts.ready.then(() => { drawPage(phase.value !== 'write'); drawBack(); });
watch(() => props.heading, () => drawPage(phase.value !== 'write'));

// ---- the scene -----------------------------------------------------------
type Phase = 'write' | 'fold' | 'seal' | 'fly' | 'gone';
const phase = ref<Phase>('write');
const box = ref({ left: 0, top: 0, width: 0, height: 0, font: 20 });
const sealAt = ref({ left: 0, top: 0 });
let started = 0;

// A half of the page: front and back, each showing its own half of its canvas.
function half(top: boolean) {
  const g = new THREE.Group();
  const geo = (flip: boolean) => {
    const pg = new THREE.PlaneGeometry(W, H / 2);
    const uv = pg.attributes.uv!;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, flip ? 1 - u : u, top ? 0.5 + v / 2 : v / 2);
    }
    return pg;
  };
  const front = new THREE.Mesh(geo(false), new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.9 }));
  const rear = new THREE.Mesh(geo(true), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 }));
  rear.rotation.y = Math.PI;
  g.add(front, rear);
  return g;
}

const build = ({ scene, group, camera, canvas }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement }) => {
  const letter = new THREE.Group(); group.add(letter);
  const hinge = new THREE.Group(); letter.add(hinge);
  const upper = half(true); upper.position.y = H / 4; hinge.add(upper);
  const lower = half(false); lower.position.y = -H / 4; letter.add(lower);
  // The seal: dark wax, pressed with his mark.
  const mark = document.createElement('canvas'); mark.width = mark.height = 256;
  const m = mark.getContext('2d')!;
  m.fillStyle = '#3a3531'; m.fillRect(0, 0, 256, 256);
  m.strokeStyle = '#d8d0bf'; m.lineWidth = 7; m.beginPath(); m.arc(128, 128, 96, 0, 7); m.stroke();
  m.beginPath(); for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; m.lineTo(128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80); } m.stroke();
  const markTex = new THREE.CanvasTexture(mark); markTex.colorSpace = THREE.SRGBColorSpace;
  const waxSide = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.4 });
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 28), [waxSide, new THREE.MeshStandardMaterial({ map: markTex, roughness: 0.4 }), waxSide]);
  seal.rotation.x = Math.PI / 2; seal.visible = false; letter.add(seal);
  lights(scene, 1.1, 0.6, 0.55);

  // The corner where he sits, as a point in the letter's plane.
  const corner = () => new THREE.Vector3(-0.9, -0.86, 0.5).unproject(camera).sub(camera.position).normalize();
  const v = new THREE.Vector3();
  const toScreen = (x: number, y: number) => {
    v.set(x, y, 0).applyMatrix4(letter.matrixWorld).project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  };
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  return (t: number) => {
    // Framed to fill the height, whatever the width.
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max((H / 2 + 0.12) / f, (W / 2 + 0.2) / (f * camera.aspect));
    camera.position.set(0, 0, d); camera.lookAt(0, 0, 0);
    const now = performance.now() / 1000, u = now - started, calm = reduced();
    if (phase.value === 'write') {
      letter.position.set(0, calm ? 0 : Math.sin(t * 0.8) * 0.012, 0);
      letter.rotation.set(0, 0, 0); letter.scale.setScalar(1); hinge.rotation.x = 0; seal.visible = false;
      // Where the body is on screen, for the pen.
      group.updateMatrixWorld();
      const a = toScreen(-W / 2 + (BODY.x / PW) * W, H / 2 - (BODY.y / PH) * H);
      const b = toScreen(-W / 2 + ((BODY.x + BODY.w) / PW) * W, H / 2 - ((BODY.y + BODY.h) / PH) * H);
      const s = toScreen(-W / 2 + (720 / PW) * W, H / 2 - (1210 / PH) * H);
      box.value = { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, font: ((b.x - a.x) / BODY.w) * 36 };
      sealAt.value = { left: s.x, top: s.y };
    } else if (phase.value === 'fold') {
      hinge.rotation.x = Math.PI * ease(Math.min(1, u / 0.7));
      hinge.position.z = 0.004 * Math.min(1, u / 0.7);
      if (u >= 0.75) { phase.value = 'seal'; started = now; }
    } else if (phase.value === 'seal') {
      seal.visible = true;
      const k = Math.min(1, u / 0.45);
      seal.position.set(0, -H / 4, 0.03 + (1 - ease(k)) * 1.2);
      seal.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.25);
      if (u >= 0.8) { phase.value = 'fly'; started = now; }
    } else if (phase.value === 'fly') {
      const k = ease(Math.min(1, u / 1.3));
      const dir = corner(), dist = camera.position.z * 0.62;
      const end = camera.position.clone().addScaledVector(dir, dist);
      // An arc up and over, turning as it goes.
      letter.position.set(end.x * k, end.y * k + Math.sin(k * Math.PI) * 0.5, end.z * k);
      letter.rotation.set(-0.5 * Math.sin(k * Math.PI), 0, k * 0.9);
      letter.scale.setScalar(1 - 0.88 * k);
      if (u >= 1.35) { phase.value = 'gone'; letter.visible = false; emit('arrived'); }
    }
  };
};

function send() {
  if (props.busy || props.modelValue.trim().length < 3 || phase.value !== 'write') return;
  drawPage(true);
  emit('send');
  started = performance.now() / 1000;
  phase.value = 'fold';
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); };
onBeforeUnmount(() => { pageTex.dispose(); backTex.dispose(); });
defineExpose({ send });
</script>

<template>
  <div class="letter">
    <div class="desk">
      <Gl :build="build" :active="true" :options="{ px: 1, drift: 0, tilt: 0, yaw: 0, fov: 30 }" label="A letter to Kael'thos, on parchment." hint="" />
      <template v-if="phase === 'write'">
        <textarea class="pen" :value="modelValue" spellcheck="false" autocomplete="off" maxlength="300" aria-label="What the lecture is about"
                  :style="{ left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, fontSize: `${box.font}px`, lineHeight: `${box.font * 44 / 36}px` }"
                  @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @keydown="onKey"></textarea>
        <button class="wax" :style="{ left: `${sealAt.left}px`, top: `${sealAt.top}px` }" :disabled="busy || modelValue.trim().length < 3" title="seal it and send it (ctrl + enter)" @click="send">
          <span>seal &amp;<br>send</span>
        </button>
      </template>
    </div>
    <aside v-if="phase === 'write' && topics.length" class="syllabus">
      <p class="pix">the syllabus, in order</p>
      <ol>
        <li v-for="(t, i) in topics" :key="i">
          <button :class="{ near: i === guessed, now: modelValue.includes(t) }" @click="emit('update:modelValue', t)">{{ t }}</button>
        </li>
      </ol>
      <p class="note">{{ note }}</p>
    </aside>
  </div>
</template>

<style scoped>
.letter { position: absolute; inset: 0; display: flex; }
.desk { position: relative; flex: 1; min-width: 0; display: flex; }
.desk :deep(.gl) { width: 100%; height: 100%; flex: 1; cursor: default; pointer-events: none; }
.desk :deep(.hint) { display: none; }
.pen { position: absolute; background: transparent; border: 0; outline: none; resize: none; padding: 0; margin: 0; overflow: hidden;
  font-family: 'IM Fell English', Georgia, serif; color: #1c1916; caret-color: #1c1916; text-shadow: 0 0 1px rgba(228, 220, 203, .9); }
.pen::selection { background: rgba(28, 25, 22, .25); color: #1c1916; }
.wax { position: absolute; width: 74px; height: 74px; margin: -37px 0 0 -37px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 38% 34%, #4a4540, #2a2623 62%, #1c1a18); color: #d8d0bf; font: 400 9.5px/1.2 var(--pix); text-transform: uppercase; text-align: center;
  box-shadow: 0 3px 10px rgba(0, 0, 0, .55), inset 0 0 0 3px rgba(216, 208, 191, .28), inset 0 0 0 6px #2a2623, inset 0 0 0 7px rgba(216, 208, 191, .2);
  transition: transform .25s var(--out), box-shadow .25s var(--out); }
.wax:hover:not(:disabled) { transform: rotate(-8deg) scale(1.06); }
.wax:active:not(:disabled) { transform: scale(.94); }
.wax:disabled { opacity: .5; cursor: default; }
.syllabus { width: 300px; flex: none; overflow: auto; padding: 22px 18px 120px; border-left: 3px dotted var(--low); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.syllabus ol { margin: 10px 0 14px; padding-left: 22px; display: grid; gap: 4px; color: var(--dim); }
.syllabus button { text-align: left; color: var(--dim); font-family: var(--fell); font-size: 14.5px; line-height: 1.3; transition: color .25s var(--out); }
.syllabus button:hover, .syllabus button.now { color: var(--hi); }
.syllabus button.near { color: var(--phos); text-decoration: underline dotted; text-underline-offset: 3px; }
@media (max-width: 860px) {
  .letter { flex-direction: column; }
  .syllabus { width: auto; max-height: 30%; border-left: 0; border-top: 3px dotted var(--low); padding: 12px 16px 90px; }
}
</style>
