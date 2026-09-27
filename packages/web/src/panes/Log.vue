<script setup lang="ts">
// The record: every session by day, the long ones waiting to be confirmed,
// a session written in by hand, the last two weeks at a glance, and him on
// the summit of Mount Yeezus above it all.
import { computed, ref } from 'vue';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import { yeezus } from '../gl/yeezus';
import { actions, clock, dailyMinutes, daysAgo, duration, localDate, state, type Session } from '../store';

defineProps<{ active: boolean }>();

const days = computed(() => {
  const grouped = new Map<string, Session[]>();
  for (const s of state.sessions) {
    const d = localDate(new Date(s.startedAt));
    grouped.set(d, [...(grouped.get(d) ?? []), s]);
  }
  return [...grouped.entries()].slice(0, 30);
});
const review = computed(() => state.sessions.filter((s) => s.needsReview));
const dayName = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '');
const hm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

const choices = computed(() => state.folders.filter((f) => !f.archived)
  .flatMap((f) => f.activities.filter((a) => !a.archived).map((a) => ({ id: a.id, label: `${f.name.toLowerCase()} / ${a.name}` }))));
const form = ref({ activityId: 0, date: localDate(), start: '09:00', end: '10:00' });
const problem = ref('');
async function add() {
  const { activityId, date, start, end } = form.value;
  const s = new Date(`${date}T${start}`), e = new Date(`${date}T${end}`);
  if (e <= s) e.setDate(e.getDate() + 1);  // ran past midnight
  problem.value = '';
  if (!activityId) { problem.value = 'Choose the path it was for.'; return; }
  if (e.getTime() - s.getTime() < 10 * 60_000) { problem.value = 'Under ten minutes is a mistaken start, never logged.'; return; }
  await actions.addSession(activityId, s, e);
}
async function remove(s: Session) {
  if (window.confirm(`Delete ${s.activity}, ${duration(s.minutes)}?`)) await actions.removeSession(s);
}

const fortnight = computed(() => dailyMinutes(14).map((m, i) => ({ m, d: daysAgo(13 - i) })));
const maxDay = computed(() => Math.max(60, ...fortnight.value.map((x) => x.m)));
const week = computed(() => fortnight.value.slice(7).reduce((a, x) => a + x.m, 0));
</script>

<template>
  <div class="log">
    <Frame class="days" :title="`the record // ${state.sessions.length} sessions in twelve weeks`" scroll>
      <div v-if="review.length" class="review">
        <div class="pix">awaiting your word // over six hours, no insight until confirmed</div>
        <div v-for="s in review" :key="s.id" class="sess">
          <span class="note">{{ dayName(localDate(new Date(s.startedAt))) }}</span><span>{{ s.activity }}</span><span class="tek">{{ duration(s.minutes) }}</span>
          <span><button class="x" @click="actions.confirmSession(s)">it was real</button><button class="x" @click="remove(s)">del</button></span>
        </div>
      </div>
      <div v-for="[d, list] in days" :key="d" class="day">
        <div class="dhead"><span class="pix">{{ dayName(d) }}</span><span class="pix">{{ duration(list.reduce((a, s) => a + s.minutes, 0)) }}</span></div>
        <div v-for="s in list" :key="s.id" class="sess">
          <span class="note">{{ hm(s.startedAt) }}-{{ hm(s.endedAt) }}</span>
          <span>{{ s.activity }} <span class="pix">{{ s.folder }}</span></span>
          <span class="tek">{{ clock(s.minutes) }}</span>
          <span><span class="pix src">{{ s.source === 'manual' ? 'by hand' : 'device' }}</span><button class="x" :aria-label="`Delete ${s.activity}`" @click="remove(s)">del</button></span>
        </div>
      </div>
    </Frame>

    <Frame class="stage" title="mount yeezus // he takes the tip" flush>
      <Gl :build="yeezus" :active="active" :options="{ px: 1, drift: 0, tilt: 0, yaw: 0 }"
        label="Kael'thos in the jewelled mask on the raised tip of Mount Yeezus, a hard shaft of light on him, the pyramid and a tilted white disc behind, the crowd below. Click the tip to lower or raise it; drag to look round." hint="click the tip // drag to look round" />
    </Frame>

    <Frame class="write" title="write one in by hand">
      <form class="grid" @submit.prevent="add">
        <label class="lab span"><span>the path</span>
          <select v-model="form.activityId" class="field"><option :value="0" disabled>choose</option><option v-for="c in choices" :key="c.id" :value="c.id">{{ c.label }}</option></select>
        </label>
        <label class="lab span"><span>day</span><input v-model="form.date" type="date" class="field"></label>
        <label class="lab"><span>from</span><input v-model="form.start" type="time" class="field"></label>
        <label class="lab"><span>to</span><input v-model="form.end" type="time" class="field"></label>
        <p class="note span">Written by hand, a session feeds him half. He was not there to see it.</p>
        <p v-if="problem" class="span hi">{{ problem }}</p>
        <button class="btn span" type="submit">log it</button>
      </form>
    </Frame>

    <Frame class="fort" :title="`the last fourteen days // this week ${duration(week)}`">
      <div class="cols">
        <div v-for="x in fortnight" :key="x.d.getTime()" class="col">
          <span class="stack"><i v-for="k in 14" :key="k" :class="{ on: k / 14 <= x.m / maxDay }"></i></span>
          <span class="pix">{{ x.d.toLocaleDateString('en-GB', { weekday: 'narrow' }) }}</span>
        </div>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.log { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); grid-template-rows: minmax(240px, 1fr) auto auto; grid-template-areas: "days stage" "days write" "days fort"; }
.days { grid-area: days; }
.stage { grid-area: stage; }
.stage :deep(.gl) { flex: 1; min-height: 0; width: 100%; }
.write { grid-area: write; }
.fort { grid-area: fort; }
.review { border: 3px dotted var(--dim); padding: 10px; margin-bottom: 14px; }
.day { margin-bottom: 12px; }
.dhead { display: flex; justify-content: space-between; border-bottom: 3px dotted var(--low); padding-bottom: 4px; }
.sess { display: grid; grid-template-columns: 96px 1fr 64px auto; gap: 12px; align-items: baseline; padding: 6px 0; border-bottom: 3px dotted var(--faint); }
.sess .tek { font-size: 17px; text-align: right; }
.sess .src { margin-right: 8px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.grid .span { grid-column: 1 / -1; margin: 0; }
.cols { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 6px; height: 100%; align-items: end; }
.col { display: grid; gap: 6px; justify-items: center; }
.stack { display: flex; flex-direction: column-reverse; gap: 3px; }
.stack i { width: 10px; height: 6px; background: var(--low); }
.stack i.on { background: var(--phos); box-shadow: 0 0 4px rgba(197, 188, 171, .35); }
@media (max-aspect-ratio: 5/4) {
  .log { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "days stage" "write fort"; }
}
@media (max-width: 860px) { .log { display: flex; flex-direction: column; } .days { min-height: 420px; } .stage { min-height: 360px; } }
</style>
