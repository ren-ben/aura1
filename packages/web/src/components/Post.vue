<script setup lang="ts">
// The post over the console: the university inbox as a night sky (gl/sky.ts),
// the letters listed beside it, and a letter opened crisp over the sky - the
// star falls, breaks into dust, and the sheet comes through the dither.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LetterDto, OpenedDto } from '@aura/shared';
import Gl from './Gl.vue';
import { sky, type SkyControl } from '../gl/sky';
import { chart, keyOf } from '../post';
import { postApi, refreshMail, state } from '../store';

const emit = defineEmits<{ close: [] }>();
const narrow = matchMedia('(max-width: 860px)').matches;
const mail = computed(() => state.mail);
const letters = computed<LetterDto[]>(() => mail.value?.letters ?? []);
const figures = computed(() => chart(letters.value));

// ---- the sky ----
const labels = ref<HTMLElement | null>(null), stageEl = ref<HTMLElement | null>(null);
let ctl: SkyControl | null = null;
const tip = ref<{ i: number; x: number; y: number } | null>(null);
const markStar = (i: number | null) => ctl?.mark(i);
const build = (ctx: Parameters<ReturnType<typeof sky>>[0]) => sky(() => labels.value!, {
  hover: (i, x, y) => { tip.value = i === null ? null : { i, x, y }; },
  choose: (i) => void choose(i),
  focus: (key) => { focus.value = focus.value === key ? null : key; },
}, (c) => void nextTick(() => {
  ctl = c; c.set(letters.value, figures.value, []);
  // Begin where the most is waiting.
  const first = figures.value.slice().sort((a, b) => b.unread - a.unread)[0];
  if (first) void c.focus(first.key);
}))(ctx);
watch(letters, (now, before) => {
  if (!ctl) return;
  const known = new Set(before?.map((l) => l.uid) ?? []);
  const fresh = before?.length ? now.filter((l) => !known.has(l.uid)).map((l) => l.uid) : [];
  ctl.set(now, figures.value, fresh);
});

// ---- the ledger ----
const only = ref<'unread' | 'all'>((state.mail?.unread ?? 0) > 0 ? 'unread' : 'all');
const focus = ref<string | null>(null);
const focused = computed(() => figures.value.find((f) => f.key === focus.value) ?? null);
const inFigure = computed(() => new Set(focused.value?.stars.map((s) => s.i) ?? []));
const listed = computed(() => letters.value.map((l, i) => ({ l, i }))
  .filter(({ l, i }) => (only.value === 'all' || l.unread) && (!focused.value || inFigure.value.has(i))));
watch(focus, (k) => { if (k) void ctl?.focus(k); });
const day = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
const long = (iso: string) => new Date(iso).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const checked = computed(() => (mail.value?.checkedAt ? new Date(mail.value.checkedAt).toTimeString().slice(0, 5) : '--:--'));
const sender = (l: LetterDto) => (keyOf(l) === 'moodle' ? 'Moodle' : l.from || l.addr);
const checking = ref(false);
async function check() { checking.value = true; try { await postApi.check(); } finally { checking.value = false; } }
async function allRead() {
  const uids = listed.value.filter(({ l }) => l.unread).map(({ l }) => l.uid);
  if (!uids.length || !state.mail) return;
  await postApi.seen(uids, true);
  for (const l of state.mail.letters) if (uids.includes(l.uid)) l.unread = false;
  state.mail.unread = Math.max(0, state.mail.unread - uids.length);
}

// ---- a letter ----
const reading = ref<{ i: number; l: LetterDto } | null>(null);
const opened = ref<OpenedDto | null>(null);
const failed = ref('');
const pre = ref(false);
const paper = ref<HTMLElement | null>(null);
let busy = false;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MASKS = Array.from({ length: 17 }, (_, k) => {
  const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d')!; g.fillStyle = '#fff';
  BAYER.forEach((b, i) => { if (b < k) g.fillRect((i % 4) * 4, Math.floor(i / 4) * 4, 4, 4); });
  return `url(${c.toDataURL()})`;
});
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, REDUCE ? 0 : ms));
// The sheet through the dither, a level a frame, in or out.
async function dither(inward: boolean) {
  const el = paper.value; if (!el) return;
  for (let k = 0; k <= 16; k++) {
    el.style.maskImage = el.style.webkitMaskImage = MASKS[inward ? k : 16 - k]!;
    el.style.maskSize = el.style.webkitMaskSize = '8px 8px';
    await wait(inward ? 36 : 20);
  }
  el.style.maskImage = el.style.webkitMaskImage = inward ? '' : MASKS[0]!;
}
async function choose(i: number) {
  const l = letters.value[i];
  if (!l || busy) return;
  if (reading.value) await shut();
  busy = true; tip.value = null;
  reading.value = { i, l }; opened.value = null; failed.value = ''; pre.value = true;
  ctl?.hold(true); ctl?.mark(null);
  const got = postApi.open(l.uid).then((o) => { opened.value = o; }, (e: Error) => { failed.value = e.message; });
  await nextTick();
  const pr = paper.value!.getBoundingClientRect(), sr = stageEl.value!.getBoundingClientRect();
  paper.value!.style.maskImage = paper.value!.style.webkitMaskImage = MASKS[0]!;
  pre.value = false;
  await ctl?.open(i, { left: pr.left - sr.left, right: pr.right - sr.left, top: pr.top - sr.top, bottom: pr.bottom - sr.top });
  if (l.unread && state.mail) { l.unread = false; state.mail.unread = Math.max(0, state.mail.unread - 1); }
  await dither(true);
  await got;
  busy = false;
}
async function shut() {
  if (!reading.value || busy) return;
  busy = true;
  const { i } = reading.value;
  await dither(false);
  reading.value = null; opened.value = null;
  await ctl?.close(i);
  ctl?.hold(false);
  busy = false;
}
async function unread() {
  const r = reading.value; if (!r || !state.mail) return;
  await postApi.seen([r.l.uid], false);
  r.l.unread = true; state.mail.unread++;
  await shut();
}
const att = (uid: number, k: number) => `/api/v1/mail/${uid}/attachments/${k}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// The words, with their links made links.
const body = computed(() => esc(opened.value?.text ?? '').replace(/https?:\/\/[^\s<>"]+/g, (u) => `<a href="${u}" target="_blank" rel="noreferrer">${u}</a>`));

// ---- the seal and the postmark, crisp on the sheet ----
const SEALPIX = ['#.....#', '##...##', '#######', '##.#.##', '#######', '.#####.'];
const sealPath = Array.from({ length: 49 }, (_, k) => { const a = (k / 48) * Math.PI * 2, rr = 17 + 1.4 * Math.sin(a * 9) + 0.6 * Math.sin(a * 4); return `${k ? 'L' : 'M'}${(20 + rr * Math.cos(a)).toFixed(2)} ${(20 + rr * Math.sin(a)).toFixed(2)}`; }).join('') + 'Z';
const sealPx = SEALPIX.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [{ x: 11.6 + x * 2.4, y: 13.5 + y * 2.4 }] : [])));

function key(e: KeyboardEvent) { if (e.key === 'Escape') { if (reading.value) void shut(); else emit('close'); } }
onMounted(() => { addEventListener('keydown', key); void refreshMail(); });
onBeforeUnmount(() => removeEventListener('keydown', key));
</script>

<template>
  <Teleport to="body">
    <div class="post-back" @pointerdown.self="emit('close')">
      <section class="post" role="dialog" aria-modal="true" aria-label="The post: your university mail">
        <div ref="stageEl" class="heavens">
          <Gl :build="build" :active="true" :options="{ px: narrow ? 1 : 2, fov: 55, drift: 0.0004, tilt: 0, yaw: 0 }" label="Your university mail as a night sky: a constellation for each sender, a star for each letter." hint="drag to turn the sky // click a star" />
          <div ref="labels" class="labels"></div>
          <div v-if="tip && letters[tip.i]" class="tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
            <span class="pix">{{ sender(letters[tip.i]!) }} // {{ day(letters[tip.i]!.date) }}</span>
            <b>{{ letters[tip.i]!.subject || '(no subject)' }}</b>
          </div>
          <div class="hud" :class="{ away: reading }">
            <div class="count"><b class="tek">{{ mail?.unread ?? 0 }}</b><span class="pix">unread // checked {{ checked }}</span></div>
            <button class="btn quiet" @click="emit('close')">close</button>
          </div>
          <div v-if="mail && !mail.configured" class="unset">
            <b>The post is not set up.</b>
            <p>Put <code>UNIVIE_MAIL_USER</code> and <code>UNIVIE_MAIL_PASSWORD</code> in the Pi's <code>.env</code>, then <code>docker compose up -d api</code>.</p>
          </div>
          <div v-if="reading" class="reader" @pointerdown.self="shut">
            <article ref="paper" class="sheet" :class="{ pre }">
              <svg class="mark" viewBox="0 0 100 100" aria-hidden="true">
                <defs><path id="pm" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" /><radialGradient id="wx" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#b6493d" /><stop offset=".55" stop-color="#8e2a22" /><stop offset="1" stop-color="#561510" /></radialGradient></defs>
                <g fill="none" stroke="currentColor" stroke-width="1.6" opacity=".62"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="27" /></g>
                <text font-size="9.4" letter-spacing="2.2" fill="currentColor" opacity=".62"><textPath href="#pm">UNIVERSITÄT WIEN · 1365 · POST ·</textPath></text>
                <text x="50" y="47" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">{{ day(reading.l.date) }}</text>
                <text x="50" y="60" text-anchor="middle" font-size="9" fill="currentColor" opacity=".62">{{ reading.l.date.slice(11, 16) }}</text>
                <g transform="translate(58 60) rotate(-12)"><path :d="sealPath" fill="url(#wx)" /><g fill="#e9c9b8" opacity=".85"><rect v-for="(p, k) in sealPx" :key="k" :x="p.x" :y="p.y" width="2.4" height="2.4" /></g></g>
              </svg>
              <div class="lh">
                <span>from</span><b>{{ reading.l.from }} <i>&lt;{{ reading.l.addr }}&gt;</i></b>
                <span>to</span><b>{{ opened?.to || 'you' }}</b>
                <span>date</span><b>{{ long(reading.l.date) }}</b>
              </div>
              <h3>{{ reading.l.subject || '(no subject)' }}</h3>
              <p v-if="failed" class="words">The letter would not come: {{ failed }}</p>
              <!-- eslint-disable-next-line vue/no-v-html -- escaped above; only links are made -->
              <div v-else-if="opened" class="words" v-html="body"></div>
              <p v-else class="words faint">unsealing...</p>
              <div v-if="opened?.attachments.length" class="att">
                <a v-for="(a, k) in opened.attachments" :key="k" :href="att(reading.l.uid, k)" :download="a.name">{{ a.name }}</a>
              </div>
              <footer>
                <button class="dark" @click="unread">mark unread</button>
                <a href="https://webmail.univie.ac.at/" target="_blank" rel="noreferrer">webmail</a>
                <button @click="shut">close</button>
              </footer>
            </article>
          </div>
        </div>
        <aside class="ledger">
          <header>
            <b>Einlauf</b>
            <span class="pix">{{ mail?.unread ?? 0 }} unread of {{ mail?.total ?? 0 }}</span>
          </header>
          <div class="filters">
            <button class="x" :class="{ on: only === 'unread' }" @click="only = 'unread'">unread</button>
            <button class="x" :class="{ on: only === 'all' }" @click="only = 'all'">all</button>
            <button v-if="focused" class="x on" title="every sender again" @click="focus = null">{{ focused.label }} x</button>
            <span class="grow"></span>
            <button class="x" :disabled="checking" @click="check">{{ checking ? 'looking' : 'look now' }}</button>
            <button class="x" title="mark everything listed as read" @click="allRead">all read</button>
          </div>
          <p v-if="mail?.error" class="err pix">the server would not answer: {{ mail.error }}</p>
          <ol>
            <li v-for="{ l, i } in listed" :key="l.uid">
              <button :class="{ un: l.unread, on: reading?.i === i }" @click="choose(i)" @pointerenter="markStar(i)" @pointerleave="markStar(null)">
                <span class="who">{{ sender(l) }}</span><span class="when">{{ day(l.date) }}</span>
                <span class="what">{{ l.subject || '(no subject)' }}</span>
              </button>
            </li>
            <li v-if="!listed.length" class="none">{{ only === 'unread' ? 'Nothing unread.' : 'No letters.' }}</li>
          </ol>
        </aside>
      </section>
    </div>
  </Teleport>
</template>

<style>
.post-back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: po-fade .45s var(--out); }
@keyframes po-fade { from { opacity: 0; } }
.post { --paper: #d3cbba; --ink: #161514; --ink2: #4a463f; --type: 'Special Elite', 'Courier New', monospace;
  position: relative; width: min(98vw, 1600px); height: 94vh; border: 3px dotted var(--low); background: var(--ground); display: grid; grid-template-columns: minmax(0, 1fr) 360px; overflow: hidden; animation: po-open .7s var(--ease); }
@keyframes po-open { from { clip-path: inset(49% 30% 49% 30%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.post .heavens { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.post .heavens .hint { left: 14px; right: auto; }
.post .labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.post .constellation { position: absolute; left: 0; top: 0; white-space: nowrap; font: 400 10px var(--pix); color: var(--phos); text-transform: uppercase; letter-spacing: .06em; padding: 2px 4px; transition: opacity .3s, color .25s; }
.post .constellation:hover { color: var(--hi); }
.post .constellation i { font-style: normal; color: var(--ground); background: var(--hi); padding: 0 4px; margin-left: 6px; }
.post .tip { position: absolute; pointer-events: none; background: var(--ground); border: 2px solid var(--phos); padding: 6px 9px; max-width: 280px; transform: translate(-50%, calc(-100% - 16px)); z-index: 3; animation: po-fade .18s; }
.post .tip b { display: block; font: 400 15px/1.25 var(--fell); color: var(--hi); }
.post .hud { position: absolute; left: 14px; top: 12px; right: 14px; display: flex; justify-content: space-between; align-items: start; pointer-events: none; transition: opacity .3s; }
.post .hud > * { pointer-events: auto; }
.post .hud.away { opacity: 0; }
.post .hud.away > * { pointer-events: none; }
.post .hud .count { display: grid; gap: 2px; }
.post .hud .count b { font-size: 38px; }
.post .unset { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 90%); background: var(--ground); border: 2px solid var(--phos); padding: 18px 20px; display: grid; gap: 8px; }
.post .unset b { font: 400 22px var(--fell); color: var(--hi); }
.post .unset p { margin: 0; color: var(--phos); }
.post .unset code { color: var(--hi); }

.post .reader { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; z-index: 4; }
.post .sheet { position: relative; width: min(620px, 100%); height: min(680px, 88%); overflow-y: auto; scrollbar-width: thin; background: var(--paper); color: var(--ink); padding: 26px 30px 22px; font: 400 16px/1.6 var(--fell); box-shadow: 0 30px 60px rgba(0, 0, 0, .55); display: flex; flex-direction: column; }
.post .sheet.pre { visibility: hidden; }
.post .sheet .mark { position: absolute; right: 18px; top: 14px; width: 92px; height: 92px; color: var(--ink); font-family: var(--type); pointer-events: none; }
.post .sheet .lh { display: grid; grid-template-columns: auto 1fr; gap: 1px 14px; font: 400 12px/1.5 var(--type); padding: 0 92px 12px 0; margin-bottom: 14px; border-bottom: 1.5px solid var(--ink); }
.post .sheet .lh span { color: var(--ink2); text-transform: uppercase; letter-spacing: .14em; font-size: 10px; padding-top: 2px; }
.post .sheet .lh b { font-weight: 400; overflow-wrap: anywhere; }
.post .sheet .lh i { font-style: normal; color: var(--ink2); }
.post .sheet h3 { margin: 0 0 10px; font: 400 24px/1.15 var(--fell); }
.post .sheet .words { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; flex: 1; }
.post .sheet .words a { color: var(--ink); }
.post .sheet .faint { color: var(--ink2); font-style: italic; }
.post .sheet .att { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.post .sheet .att a, .post .sheet footer > * { font: 400 11px var(--type); letter-spacing: .12em; text-transform: uppercase; border: 1.5px solid var(--ink); padding: 6px 10px; color: var(--ink); text-decoration: none; background: none; cursor: pointer; }
.post .sheet footer { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.post .sheet footer .dark { background: var(--ink); color: var(--paper); }

.post .ledger { border-left: 3px dotted var(--low); display: grid; grid-template-rows: auto auto auto 1fr; min-height: 0; }
.post .ledger > header { padding: 12px 14px; border-bottom: 3px dotted var(--low); display: flex; justify-content: space-between; align-items: baseline; }
.post .ledger > header b { font: 400 26px/1 var(--goth); color: var(--hi); }
.post .filters { display: flex; gap: 4px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--faint); flex-wrap: wrap; }
.post .filters .x.on { color: var(--hi); text-decoration: underline; text-underline-offset: 3px; }
.post .filters .grow { flex: 1; }
.post .err { margin: 0; padding: 8px 14px; color: var(--hi); }
.post .ledger ol { list-style: none; margin: 0; padding: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.post .ledger li button { width: 100%; text-align: left; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 2px 10px; padding: 10px 14px; border-bottom: 1px solid var(--faint); transition: background .25s var(--out); }
.post .ledger li button:hover, .post .ledger li button.on { background: var(--faint); }
.post .ledger li button::before { content: ''; grid-row: span 2; width: 8px; height: 8px; margin-top: 5px; border: 2px solid var(--dim); }
.post .ledger li button.un::before { background: var(--hi); border-color: var(--hi); box-shadow: 0 0 8px rgba(230, 224, 212, .5); }
.post .ledger .who { font: 400 10px var(--pix); color: var(--dim); text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.post .ledger .when { font: 400 10px var(--pix); color: var(--dim); }
.post .ledger .what { grid-column: 2 / 4; font: 400 15px/1.25 var(--fell); color: var(--phos); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.post .ledger .un .what { color: var(--hi); }
.post .ledger .none { padding: 18px 14px; color: var(--dim); font: italic 400 16px var(--fell); }

@media (max-width: 860px) {
  .post { width: 100vw; height: 100dvh; border: 0; grid-template-columns: 1fr; grid-template-rows: 52dvh 1fr; }
  .post .ledger { border-left: 0; border-top: 3px dotted var(--low); }
  .post .reader { position: fixed; padding: 12px; background: rgba(12, 11, 10, .88); }
  .post .sheet { height: 100%; padding: 20px 18px; }
  .post .sheet .mark { width: 70px; height: 70px; right: 10px; }
  .post .sheet .lh { padding-right: 70px; }
}
</style>
