// Mnemosyne's water (docs/superpowers/specs/2026-10-18-mnemosyne-design.md).
// Every group is the sum of soft wells round its topics, cut at a level, so
// it pools where topics are held and draws back from the ones that fade. One
// shader draws all of it, dithered to the two inks like every scene on the
// console; the words and drops go on top, crisp.
import * as THREE from 'three';
import { recallOf, type TopicDto, type TopicGroupDto } from '@aura/shared';
import type { Build } from './gl/engine';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (u: number) => 1 - (1 - clamp(u)) ** 3;
export const CELL = 2;
const MAXT = 512, ROWS = 5;
// Seven pools to give out; the eighth is where loose topics gather.
export const LOOSE = 7;

// What the water shows of a topic now. q is its recall stretched over the
// range that matters (60% to 100%), so 90% sits three quarters up.
export type Look = { r: number; q: number; due: boolean; kind: 'held' | 'fading' | 'slipping' | 'unlearned' | 'hub' };
export function look(t: TopicDto, now: number): Look {
  if (t.hub) return { r: 0, q: 0, due: false, kind: 'hub' };
  if (!t.learned || !t.lastReview) return { r: 0, q: 0, due: false, kind: 'unlearned' };
  const r = recallOf((now - Date.parse(t.lastReview)) / 864e5, t.stability);
  const due = !!t.due && Date.parse(t.due) <= now;
  return { r, q: clamp((r - 0.6) / 0.4), due, kind: !due ? 'held' : r < 0.8 ? 'slipping' : 'fading' };
}
export const withRecall = (l: Look, r: number): Look => ({ ...l, r, q: clamp((r - 0.6) / 0.4) });
// The liquid a topic gives its pool: wide while it is held, a drop once it
// has faded, a bead before it is learned.
export const reach = (t: TopicDto, l: Look) => (t.hub ? 60 : t.learned ? 46 + 74 * l.q * l.q : 42);

// Pools of different groups must never run together. Neighbours get
// different slots; groups far apart may share one.
type Box = { x0: number; y0: number; x1: number; y1: number };
const around = (ts: TopicDto[], pad: number): Box | null => (ts.length ? { x0: Math.min(...ts.map((t) => t.x)) - pad, x1: Math.max(...ts.map((t) => t.x)) + pad, y0: Math.min(...ts.map((t) => t.y)) - pad, y1: Math.max(...ts.map((t) => t.y)) + pad } : null);
function colour(ids: number[], boxes: Map<number, Box | null>, slots: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of ids) {
    const b = boxes.get(id), used = new Set<number>();
    if (b) for (const [o, s] of out) { const c = boxes.get(o); if (c && b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0) used.add(s); }
    let s = 0;
    while (used.has(s) && s < slots - 1) s++;
    out.set(id, s);
  }
  return out;
}
export function slotsFor(groups: TopicGroupDto[], topics: TopicDto[]): Map<number, number> {
  return colour(groups.map((g) => g.id), new Map(groups.map((g) => [g.id, around(topics.filter((t) => t.groupId === g.id), 320)])), LOOSE);
}
// Hubs get membranes of their own, eight to give out; a hub inside another
// always overlaps it, so never shares its slot.
export const HUBS = 8;
export function hubSlotsFor(hubs: number[], members: (id: number) => TopicDto[]): Map<number, number> {
  return colour(hubs, new Map(hubs.map((id) => [id, around(members(id), 260)])), HUBS);
}
// Each group's own tone of water.
const TONES = [0.13, 0.17, 0.2, 0.15, 0.18, 0.12, 0.16, 0.14];
export const toneOf = (groupId: number | null) => (groupId === null ? 0.15 : TONES[groupId % TONES.length]!);

export type Drop = {
  x: number; y: number; reach: number; q: number; learned: boolean; marked: boolean; due: boolean; phase: number;
  // Its pool, and the one it is pouring out of while it changes groups.
  slot: number; from: number; mix: number;
  ground: number; tone: number; cx: number; cy: number;
  // The hubs it lies in (a bit a hub slot) and, if it hangs from one, the
  // hub it hangs from: the membrane runs to it along a tendril.
  within: number; tendril: number; px: number; py: number;
};
export type View = { x: number; y: number; k: number };

const FRAG = `
  uniform sampler2D uData; uniform int uN; uniform vec3 uView; uniform vec2 uScreen; uniform float uCell; uniform float uTime;
  uniform vec4 uPulse[4]; uniform vec3 uInk;
  float b2(vec2 a) { a = floor(mod(a, 2.0)); return mod(a.x * 2.0 + a.y * 3.0, 4.0); }
  float bayer(vec2 p) { return (4.0 * b2(p) + b2(floor(p / 2.0))) / 16.0; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    vec2 cell = floor(gl_FragCoord.xy);
    vec2 w = (vec2(gl_FragCoord.x, uScreen.y / uCell - gl_FragCoord.y) * uCell - uView.xy) / uView.z;
    float f[8]; float gs[8]; float tn[8]; vec2 cn[8]; float hf[8];
    for (int g = 0; g < 8; g++) { f[g] = 0.0; gs[g] = 0.0; tn[g] = 0.0; cn[g] = vec2(0.0); hf[g] = 0.0; }
    float glow = 0.0, ripple = 0.0;
    for (int i = 0; i < ${MAXT}; i++) {
      if (i >= uN) break;
      vec4 a = texelFetch(uData, ivec2(i, 0), 0);
      vec2 d = w - a.xy; float d2 = dot(d, d);
      // Most topics are far from most of the screen: nothing of them reaches
      // here, unless a tendril runs past (its reach is then stored negative).
      float rz = abs(a.z);
      if (a.z > 0.0 && d2 > max(rz * rz * 9.5, 25600.0)) continue;
      vec4 b = texelFetch(uData, ivec2(i, 1), 0), m = texelFetch(uData, ivec2(i, 2), 0);
      vec4 c = texelFetch(uData, ivec2(i, 3), 0), h = texelFetch(uData, ivec2(i, 4), 0);
      // A topic gives its liquid to its pool; changing groups, it pours
      // from the old one into the new.
      float e = exp(-d2 / (rz * rz));
      int g = int(b.x + 0.5) - 1, g0 = int(m.x + 0.5) - 1;
      float u = m.y;
      if (g >= 0 && g < 8) { float k = e * u; f[g] += k; gs[g] += k * c.x; tn[g] += k * c.y; cn[g] += k * c.zw; }
      if (g0 >= 0 && g0 < 8 && u < 1.0) { float k = e * (1.0 - u); f[g0] += k; gs[g0] += k * c.x; tn[g0] += k * c.y; cn[g0] += k * c.zw; }
      // A hub's membrane: a wider well round everything it holds, and a
      // tendril, thick at the hub and thin at the topic, from each member to
      // the hub it hangs from.
      int within = int(h.x + 0.5), tendril = int(h.y + 0.5);
      if (within != 0) {
        float ew = exp(-d2 / (rz * rz * 1.7)), ec = 0.0;
        if (tendril != 0) {
          vec2 ab = h.zw - a.xy; float s = clamp(dot(w - a.xy, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
          vec2 o = a.xy + ab * s - w; float r = mix(15.0, 30.0, s);
          ec = exp(-dot(o, o) / (r * r));
        }
        for (int s = 0; s < 8; s++) { int bit = 1 << s; if ((within & bit) != 0) hf[s] += ew; if ((tendril & bit) != 0) hf[s] += ec; }
      }
      float q = a.w;
      // A plain drop glows at its heart; a marked one glows round its disc instead.
      if (b.y > 1.5) glow += (0.12 + 0.3 * q * q) * exp(-pow((sqrt(d2) - 22.0) / 9.0, 2.0));
      else if (b.y > 0.5) { float rg = 7.0 + 11.0 * q; glow += (0.2 + 0.7 * q * q) * exp(-d2 / (rg * rg)); }
      if (b.z > 0.5) {
        float t = fract(uTime / 3.6 + b.w), rr = t * 150.0;
        ripple += exp(-pow((sqrt(d2) - rr) / 4.5, 2.0)) * (1.0 - t) * (1.0 - t) * 0.75;
      }
    }
    float L = 0.0;
    for (int g = 0; g < 8; g++) {
      float v = f[g];
      if (v < 0.04) continue;
      int ground = int(gs[g] / v + 0.5); float tone = tn[g] / v; vec2 cen = cn[g] / v;
      float body = tone;
      if (ground == 1) body = tone * (0.45 + 0.75 * smoothstep(0.5, 2.4, v));
      else if (ground == 2) body = tone * (0.85 + 0.35 * sin(length(w - cen) * 0.06 - uTime * 0.8));
      else if (ground == 3) body = tone * (0.6 + 0.8 * vnoise(w * 0.007 + vec2(uTime * 0.05, -uTime * 0.03)));
      else if (ground == 4) body = tone * (0.55 + 0.9 * vnoise(w * 0.05 + floor(uTime * 0.7)));
      else if (ground == 5) body = tone * 1.6;
      float inside = smoothstep(0.44, 0.56, v), rim = exp(-pow((v - 0.5) / 0.05, 2.0));
      L = max(L, inside * body + rim * 0.26);
    }
    // Membranes: a faint tone inside, and at the edge a dark channel cut
    // through whatever water is there with a fine bright line just inside
    // it, so one membrane inside another reads as a shape inside a shape.
    for (int s = 0; s < 8; s++) {
      float v = hf[s];
      if (v < 0.05) continue;
      L = max(L, smoothstep(0.42, 0.58, v) * 0.055);
      L *= 1.0 - 0.9 * exp(-pow((v - 0.46) / 0.05, 2.0));
      L += exp(-pow((v - 0.6) / 0.05, 2.0)) * 0.24;
    }
    L += glow * 0.85 + ripple * 0.55;
    for (int k = 0; k < 4; k++) {
      vec4 p = uPulse[k];
      if (p.w < 0.5) continue;
      float dd = length(w - p.xy), rr = 40.0 + p.z * 240.0, fade = max(0.0, 1.0 - p.z / 1.8);
      L += exp(-pow((dd - rr) / (10.0 + p.z * 14.0), 2.0)) * fade * 0.85 + exp(-dd * dd / 6400.0) * fade * 0.7;
    }
    gl_FragColor = L > bayer(cell) + 0.012 ? vec4(uInk, 1.0) : vec4(0.0);
  }`;

export function water(canvas: HTMLCanvasElement) {
  // Premultiplied, as the browser wants it: anything else is a slow path in Safari.
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const data = new Float32Array(MAXT * ROWS * 4);
  const tex = new THREE.DataTexture(data, MAXT, ROWS, THREE.RGBAFormat, THREE.FloatType);
  const U = {
    uData: { value: tex }, uN: { value: 0 }, uView: { value: new THREE.Vector3() }, uScreen: { value: new THREE.Vector2(1, 1) },
    uCell: { value: CELL }, uTime: { value: 0 }, uPulse: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    // Written straight to the glass, so given as the hex says.
    uInk: { value: new THREE.Vector3(197 / 255, 188 / 255, 171 / 255) },
  };
  const material = new THREE.ShaderMaterial({ uniforms: U, transparent: true, vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG });
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(plane, material));
  return {
    // How many screen pixels one dither cell covers; three on a screen that cannot keep up with two.
    cell: CELL,
    size(w: number, h: number) { renderer.setPixelRatio(1 / this.cell); renderer.setSize(w, h, false); U.uScreen.value.set(w, h); U.uCell.value = this.cell; },
    draw(view: View, t: number, drops: Drop[], pulses: { x: number; y: number; age: number }[]) {
      const n = Math.min(MAXT, drops.length);
      for (let i = 0; i < n; i++) {
        const d = drops[i]!;
        data.set([d.x, d.y, d.tendril ? -d.reach : d.reach, d.q], i * 4);
        data.set([d.slot + 1, d.learned ? (d.marked ? 2 : 1) : 0, d.due ? 1 : 0, d.phase], (MAXT + i) * 4);
        data.set([d.from + 1, d.mix, 0, 0], (2 * MAXT + i) * 4);
        data.set([d.ground, d.tone, d.cx, d.cy], (3 * MAXT + i) * 4);
        data.set([d.within, d.tendril, d.px, d.py], (4 * MAXT + i) * 4);
      }
      tex.needsUpdate = true;
      U.uN.value = n; U.uView.value.set(view.x, view.y, view.k); U.uTime.value = t;
      for (let k = 0; k < 4; k++) { const p = pulses[k]; U.uPulse.value[k]!.set(p?.x ?? 0, p?.y ?? 0, p?.age ?? 0, p ? 1 : 0); }
      renderer.render(scene, camera);
    },
    dispose() { renderer.dispose(); tex.dispose(); material.dispose(); plane.dispose(); },
  };
}

// An hourglass of five minutes, for the writing: sand runs from the upper
// bulb to the lower as the time since `since` goes by.
export const hourglass = (since: () => number): Build => ({ scene, group, camera }) => {
  camera.position.set(0, 0.35, 6.4); camera.lookAt(0, 0, 0);
  const brass = new THREE.MeshStandardMaterial({ color: 0xf0e6d0, roughness: 0.35, metalness: 0.5, emissive: 0x3a3428 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.6, metalness: 0.1 });
  for (const y of [-1.27, 1.27]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.16, 48), wood); disc.position.y = y; group.add(disc);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.06, 10, 48), brass); lip.rotation.x = Math.PI / 2; lip.position.y = y + (y > 0 ? -0.08 : 0.08); group.add(lip);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2, post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 12), brass);
    post.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82); group.add(post);
  }
  const profile = Array.from({ length: 49 }, (_, i) => { const y = -1.19 + (i / 48) * 2.38, u = Math.abs(y) / 1.19; return new THREE.Vector2(0.07 + 0.6 * Math.sin(Math.PI * u * 0.86) ** 0.85, y); });
  group.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 48), new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, shininess: 140, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false })));
  const sand = new THREE.MeshLambertMaterial({ color: 0xe8dfcb, emissive: 0x222018 });
  const topGeo = new THREE.ConeGeometry(0.52, 0.78, 40); topGeo.rotateX(Math.PI); topGeo.translate(0, 0.39, 0);
  const top = new THREE.Mesh(topGeo, sand); top.position.y = 0.07; group.add(top);
  const botGeo = new THREE.ConeGeometry(0.58, 0.62, 40); botGeo.translate(0, 0.31, 0);
  const bottom = new THREE.Mesh(botGeo, sand); bottom.position.y = -1.18; group.add(bottom);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 6), sand); group.add(stream);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2.5, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(3, 1, -2); scene.add(rim);
  return () => {
    const p = clamp((performance.now() - since()) / 300_000);
    const a = Math.cbrt(1 - p) || 1e-4, b = Math.cbrt(p) || 1e-4;
    top.scale.setScalar(a); bottom.scale.setScalar(b);
    const s0 = 0.07, s1 = -1.18 + 0.62 * b;
    stream.visible = p < 1; stream.scale.y = s0 - s1; stream.position.y = (s0 + s1) / 2;
  };
};
