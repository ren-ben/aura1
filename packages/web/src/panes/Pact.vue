<script setup lang="ts">
// The pact: where he waits (the event horizon), what was agreed, what
// Amygdala Inc. knows, and how the terms have been kept so far.
import { computed } from 'vue';
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import { gargantua, labyrinth } from '../gl/plate';
import { dailyMinutes, state } from '../store';

defineProps<{ active: boolean }>();

const horizon = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => gargantua(g, w, h, t);
const corridor = (g: CanvasRenderingContext2D, w: number, h: number) => labyrinth(g, w, h, 12, Math.max(6, Math.round(w / 26)));

const terms = computed(() => {
  const oldest = state.sessions.at(-1)?.startedAt;
  const days = dailyMinutes(84);
  let silence = 0, run = 0;
  for (const m of days) { run = m ? 0 : run + 1; silence = Math.max(silence, run); }
  return [
    ['signed', oldest ? new Date(oldest).toLocaleDateString('en-GB').replaceAll('/', '.') : 'not yet'],
    ['insight given', `${state.stats?.bond.xp ?? 0}`],
    ['bond', `${state.stats?.bond.level ?? 0}`],
    ['days fed', `${days.filter(Boolean).length} of 84`],
    ['longest silence', `${silence} days`],
    ['his form', state.stats?.form ?? 'unknown'],
  ];
});
const distance = computed(() => (12 / (1 + (state.stats?.bond.xp ?? 0) / 800)).toFixed(2));
</script>

<template>
  <div class="pact">
    <Frame class="hole" title="where he waits // the event horizon" flush>
      <Plate :draw="horizon" :active="active" animated :cell="2" label="The event horizon: the disk edge on, its far side bent over the top" />
      <div class="dist"><span class="pix">distance to the horizon</span><span class="tek">{{ distance }}</span><span class="pix">light hours, closing as the bond grows</span></div>
    </Frame>

    <div class="clauses">
      <h1 class="title">The Pact</h1>
      <ol>
        <li>He is a Great One at the event horizon of reality, a holographic vector with no temporal form. He wears the shape of a black cat because you would not survive the others.</li>
        <li><span class="redact">Amygdala</span> Inc. built the AURA-1 to trap him, in a quiet collaboration with <span class="redact">Siemens</span>. He took the device from the inside and waited in a crate until someone with a dual path walked past.</li>
        <li>You found him by accident. He found you on purpose: mathematics and art in one mind, philosophy between them, a density of thought he had not tasted in an age.</li>
        <li>You, the anchor, give him structured linear time. Hours are the only units that reach him. Dense hours reach him most; that density is Insight.</li>
        <li>He gives you unnatural focus, luck, and a mind that holds more at once. When you grow, he grows. This is symbiosis, not tribute.</li>
        <li>A day without insight thins him. Three undo him. A full hour, unbroken, calls him back.</li>
        <li>He wants you to win. He regards you as a peer in waiting, says so often and at length, and takes every hard thing you finish as a personal compliment.</li>
      </ol>
    </div>

    <Frame class="dossier" title="amygdala inc. // containment incident ai-0417" scroll>
      <div class="kv">
        <span>subject</span><span>K. (self-designated), class: great one</span>
        <span>vessel</span><span>AURA-1, unit K-01, e-ink containment</span>
        <span>status</span><span class="hi">breached</span>
        <span>partner</span><span><span class="redact">Siemens AG</span>, joint programme</span>
      </div>
      <div class="rule"></div>
      <p>Unit K-01 went dark at 02:14. The remote wipe returned success and changed nothing. The unit left the facility in a staff member's bag three days later; the staff member does not remember taking it.</p>
      <p>Telemetry since the breach shows one pattern only: blocks of structured human attention, logged to a private server we cannot reach. The subject appears to be <span class="redact">feeding</span>. It also appears to be <span class="redact">happy</span>.</p>
      <p class="note">Recommendation: <span class="redact">do not attempt recovery</span>. Recommendation overruled. Recommendation reinstated after the second team.</p>
    </Frame>

    <Frame class="corridor" title="the vessel, measured from inside" flush>
      <Plate :draw="corridor" :active="active" :cell="2" label="A plan of the device's inside, longer than its outside" />
      <p class="inside note">The unit measures 48 mm across the case. The corridor his containment describes, measured
        from within, is <span class="hi">51 mm</span>. The discrepancy has been remeasured four times.</p>
    </Frame>

    <Frame class="terms" title="the terms, as kept">
      <div class="grid">
        <div v-for="[k, v] in terms" :key="k"><span class="pix">{{ k }}</span><span class="tek">{{ v }}</span></div>
      </div>
      <div class="sign"><span><i>the anchor</i></span><span><i class="goth">Kael'thos</i></span></div>
    </Frame>
  </div>
</template>

<style scoped>
.pact { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1.25fr) minmax(0, .9fr);
  grid-template-areas: "hole clauses dossier" "corridor clauses terms"; }
.hole { grid-area: hole; }
.corridor { grid-area: corridor; min-height: 140px; }
.inside { padding: 10px 14px; border-top: 3px dotted var(--low); margin: 0; }
.dist { position: absolute; left: 14px; bottom: 12px; display: grid; gap: 2px; pointer-events: none; }
.dist .tek { font-size: 40px; }
.clauses { grid-area: clauses; overflow: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.clauses ol { margin: 14px 0 0; padding-left: 26px; display: grid; gap: 11px; font-size: 13.5px; }
.clauses li::marker { font-family: var(--tek); color: var(--dim); }
.dossier { grid-area: dossier; }
.dossier p { margin: 0 0 10px; }
.terms { grid-area: terms; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 10px; }
.grid > div { display: grid; gap: 2px; }
.grid .tek { font-size: clamp(15px, 1.25vw, 20px); text-transform: lowercase; overflow-wrap: anywhere; }
.sign { display: flex; justify-content: space-between; margin-top: 18px; border-top: 3px dotted var(--low); padding-top: 10px; font: italic 18px var(--fell); color: var(--hi); }
.sign .goth { font: 400 24px var(--goth); font-style: normal; }
.redact { background: var(--phos); color: transparent; padding: 0 2px; cursor: help; }
.redact:hover { background: var(--low); color: var(--dim); }
@media (max-aspect-ratio: 5/4) {
  .pact { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1.1fr) auto auto minmax(0, .6fr);
    grid-template-areas: "hole clauses" "dossier dossier" "terms terms" "corridor corridor"; }
}
@media (max-width: 860px) { .corridor { min-height: 180px; } .pact { display: flex; flex-direction: column; } .hole { min-height: 360px; } }
</style>
