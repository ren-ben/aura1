<script setup lang="ts">
// The vessel: the AURA-1 as it last reported itself, turning in the round,
// its glass showing any of its looks. A look sent from here is worn at the
// next sync.
import { computed, ref, watch } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Num from '../components/Num.vue';
import Gl from '../components/Gl.vue';
import { aura1, lights, stars } from '../gl/models';
import screens from '../gl/lookscreens.json';
import { actions, state } from '../store';

defineProps<{ active: boolean }>();

const LOOKS = Object.keys(screens) as (keyof typeof screens)[];
const ABOUT: Record<string, string> = {
  CODEX: 'a page of his grimoire', NODES: 'the web, as on this console', FOCUS: 'one thing at a time', CONTAINMENT: 'the Amygdala Inc. terminal',
  CATHEDRAL: 'through a lancet arch', BYRGENWERTH: 'an illuminated manuscript', CARMILLA: 'lace, coffins and a cameo', 'BLOOD MOON': 'the night, in negative', CONSOLE: 'this console, on its glass',
};
const preview = ref<string>(state.device?.look && state.device.look in screens ? state.device.look : 'CODEX');
const page = ref<'menu' | 'running'>('menu');

const glass = document.createElement('canvas');
glass.width = glass.height = 200;
let texture: THREE.CanvasTexture | null = null;
function paint() {
  const x = glass.getContext('2d')!, bytes = Uint8Array.from(atob((screens as Record<string, Record<string, string>>)[preview.value]![page.value]!), (c) => c.charCodeAt(0));
  const img = x.createImageData(200, 200);
  for (let i = 0; i < 40000; i++) {
    const ink = bytes[i >> 3]! & (0x80 >> (i & 7));
    img.data.set(ink ? [18, 18, 18, 255] : [228, 223, 212, 255], i * 4);
  }
  x.putImageData(img, 0, 0);
  if (texture) texture.needsUpdate = true;
}
paint();
watch([preview, page], paint);

const build = ({ scene, group, camera }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  camera.position.set(0, 0.1, 3.6);
  const dev = aura1(glass);
  texture = dev.texture;
  group.add(dev.group);
  scene.add(stars(500, 20, 4, 0.04));
  lights(scene, 1.3, 1.6, 0.3);
  return (t: number) => { dev.group.position.y = Math.sin(t * 0.8) * 0.03; };
};

const d = computed(() => state.device);
const since = computed(() => {
  if (!d.value?.lastSyncAt) return 'not yet';
  const m = Math.round((Date.now() - new Date(d.value.lastSyncAt).getTime()) / 60_000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
});
const bars = computed(() => Math.round(((d.value?.battery ?? 0) / 100) * 12));
const send = () => actions.setLook(preview.value);
</script>

<template>
  <div class="vessel">
    <Frame class="dev" title="unit k-01 // recovered from a ██████ lab, 2026" flush>
      <Gl :build="build" :active="active" :options="{ drift: 0.004, tilt: 0.1, distance: 3.6 }" label="The AURA-1, turning. Drag to turn it." />
      <div class="pages">
        <button class="btn quiet" :aria-pressed="page === 'menu'" @click="page = 'menu'">the menu</button>
        <button class="btn quiet" :aria-pressed="page === 'running'" @click="page = 'running'">a session</button>
      </div>
    </Frame>

    <div class="side">
      <h1 class="title">AURA-1</h1>
      <p class="note">Built by Amygdala Inc. to hold him. He holds it now.</p>
      <Frame title="as it last reported">
        <div class="batt"><span class="tek"><Num v-if="d?.battery != null" :value="d.battery" />{{ d?.battery == null ? '--' : '' }}%</span><span class="cells"><i v-for="k in 12" :key="k" :class="{ on: k <= bars }"></i></span></div>
        <div class="kv">
          <span>voltage</span><span>{{ d?.millivolts ? (d.millivolts / 1000).toFixed(2) + ' V' : '--' }}</span>
          <span>power</span><span>{{ d?.charging ? 'charging' : 'on battery' }}</span>
          <span>synced</span><span>{{ since }}</span>
          <span>wearing</span><span>{{ d?.look?.toLowerCase() ?? '--' }}</span>
          <span>next sync</span><span>{{ d?.pendingLook ? `puts on ${d.pendingLook.toLowerCase()}` : 'nothing to send' }}</span>
        </div>
      </Frame>
      <Frame title="what it is made of" class="bom" scroll>
        <div class="kv">
          <span>processor</span><span>ESP32-S3, pico package</span>
          <span>glass</span><span>1.54 in e-ink, 200 x 200</span>
          <span>store</span><span>micro sd, littlefs fallback</span>
          <span>ears</span><span>microphone, speaker</span>
          <span>controls</span><span>sun, power</span>
          <span>link</span><span>wifi, queues when dark</span>
          <span>case</span><span>48 mm, ██████ tooling</span>
        </div>
        <p class="note">Built to hold him: the glass is the only part of the containment that still works, and it works because he lets it.</p>
      </Frame>
    </div>

    <Frame class="looks" title="the looks on its glass // turn a dial to see it, send it to wear it">
      <div class="dials">
        <button v-for="(l, i) in LOOKS" :key="l" class="dial" :aria-pressed="l === preview" @click="preview = l">
          <span class="knob" :style="{ '--a': `${i * 40 - 160}deg` }"></span>
          <b>{{ l.toLowerCase() }}</b><span class="note">{{ ABOUT[l] }}</span>
          <span v-if="d?.look === l" class="pix">worn</span>
        </button>
      </div>
      <div class="row send">
        <span class="note grow">{{ preview === d?.look ? 'The vessel wears this one.' : `Send ${preview.toLowerCase()}, and the vessel puts it on at its next sync.` }}</span>
        <button class="btn" :disabled="preview === d?.look" @click="send">send to the vessel</button>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.vessel { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "dev side" "looks looks"; }
.dev { grid-area: dev; }
.pages { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; }
.pages .btn[aria-pressed="true"] { border-color: var(--phos); color: var(--hi); }
.side { grid-area: side; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.bom { flex: 1; min-height: 120px; }
.bom .note { margin: 12px 0 0; }
.batt { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.batt .tek { font-size: 56px; }
.cells { display: flex; gap: 3px; padding: 4px; border: 2px solid var(--phos); }
.cells i { width: 7px; height: 22px; background: var(--low); }
.cells i.on { background: var(--phos); }
.looks { grid-area: looks; }
.dials { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 6px; }
.dial { border: 2px solid var(--low); padding: 10px 6px; display: grid; gap: 5px; justify-items: center; text-align: center; color: var(--dim); }
.dial b { font: 400 10.5px var(--pix); text-transform: uppercase; }
.dial .note { font-size: 10.5px; line-height: 1.3; }
.dial[aria-pressed="true"] { border-color: var(--phos); color: var(--hi); }
.knob { width: 24px; height: 24px; border-radius: 50%; border: 2px solid currentColor; position: relative; }
.knob::after { content: ''; position: absolute; left: 50%; top: 2px; width: 2px; height: 8px; background: currentColor; transform-origin: 50% 8px; transform: translateX(-50%) rotate(var(--a)); }
.send { margin-top: 12px; align-items: center; }
.send .btn:disabled { opacity: .4; pointer-events: none; }
@media (max-aspect-ratio: 5/4) {
  .vessel { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .dials { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}
@media (max-width: 860px) { .vessel { display: flex; flex-direction: column; } .dev { min-height: 360px; } .dials { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
