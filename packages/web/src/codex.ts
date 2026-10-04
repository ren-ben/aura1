// The Exploded Codex: one tome as an assembly drawing, drawn 1-bit. The book
// lies flat and lifts apart into its chapters, a slab each as thick as its
// pages; chapters are named down the left, what hangs off each down the
// right, the chosen one slid out with its first page lifted. Text is HTML
// over the canvas, so it stays crisp; only the drawing is dithered.
import type { Chapter } from '@aura/shared';
import type { Plate } from './folios';

const INK = { g: [18, 18, 18], p: [197, 188, 171], h: [230, 224, 212] } as const;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const PX = 2, W = 1.55, D = 1.08, BOOK = 0.86, GAP = 0.27;
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type V3 = [number, number, number];
type P = [number, number, number, number];
const SVG = 'http://www.w3.org/2000/svg';

export type CodexTome = { chapters: Chapter[]; plates: Plate[] };

export class Codex {
  private view = document.createElement('canvas');
  private off = document.createElement('canvas');
  private ctx = this.off.getContext('2d', { willReadFrequently: true })!;
  private vctx = this.view.getContext('2d')!;
  private svg = document.createElementNS(SVG, 'svg');
  private labels = document.createElement('div');
  private cam = { yaw: 0.58, pitch: 0.34, dist: 6.6, f: 1.3, ox: -0.06, oy: -0.01 };
  private W = 0; private H = 0;
  private tome: CodexTome = { chapters: [], plates: [] };
  private calls: HTMLElement[] = []; private lines: SVGPathElement[] = [];
  private groups: { ch: number; el: HTMLElement; line: SVGPathElement; link: SVGPathElement }[] = [];
  private axis = document.createElementNS(SVG, 'path');
  private slide: number[] = []; private spread: number[] = [];
  private sel = -1; private hover = -1; private open = true; private t0 = performance.now(); private sway = 0;
  private mouse: { x: number; y: number } | null = null;
  private raf = 0; private ro: ResizeObserver;
  private still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private host: HTMLElement, private onPick: (i: number) => void) {
    this.view.className = 'cx-view';
    this.svg.setAttribute('class', 'cx-lines');
    this.labels.className = 'cx-labels';
    host.append(this.view, this.svg, this.labels);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    let drag: { x: number; y: number; moved: number } | null = null;
    this.view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; this.view.setPointerCapture(e.pointerId); });
    this.view.addEventListener('pointermove', (e) => {
      const r = this.view.getBoundingClientRect();
      this.mouse = { x: (e.clientX - r.left) / PX, y: (e.clientY - r.top) / PX };
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.cam.yaw += dx * 0.008;
      this.cam.pitch = Math.max(0.05, Math.min(1.1, this.cam.pitch + dy * 0.005));
      drag.x = e.clientX; drag.y = e.clientY;
    });
    this.view.addEventListener('pointerup', () => { if (drag && drag.moved < 6) this.onPick(this.hover >= 0 ? this.hover : this.sel); drag = null; });
    this.view.addEventListener('pointerleave', () => { this.mouse = null; });
    this.resize();
    const loop = (now: number) => { this.frame(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.host.replaceChildren(); }

  set(tome: CodexTome) {
    this.tome = tome;
    this.labels.replaceChildren(); this.svg.replaceChildren();
    this.axis.setAttribute('class', 'dash'); this.svg.append(this.axis);
    const path = (cls = '') => { const p = document.createElementNS(SVG, 'path'); if (cls) p.setAttribute('class', cls); this.svg.append(p); return p; };
    const hoverable = (el: HTMLElement, ch: number) => {
      el.addEventListener('pointerenter', () => { this.hover = ch; });
      el.addEventListener('pointerleave', () => { this.hover = -1; });
      el.addEventListener('click', () => this.onPick(ch));
    };
    this.calls = tome.chapters.map((c, i) => {
      const el = document.createElement('button');
      el.className = 'cx-call';
      const n = c.to - c.from + 1;
      el.innerHTML = `<b></b><span>p ${c.from}-${c.to} // ${n} ${n === 1 ? 'page' : 'pages'}</span>`;
      el.querySelector('b')!.textContent = `${String(i + 1).padStart(2, '0')}  ${c.title.replace(/^\d+(\.\d+)*\s+/, '')}`;
      hoverable(el, i); this.labels.append(el); return el;
    });
    this.lines = tome.chapters.map(() => path());
    this.groups = [...new Set(tome.plates.map((p) => p.ch))].map((ch) => {
      const el = document.createElement('button');
      el.className = 'cx-call side';
      for (const p of tome.plates.filter((q) => q.ch === ch)) {
        const b = document.createElement('b'), s = document.createElement('span');
        b.textContent = p.name; if (p.isNew) b.className = 'new';
        s.textContent = p.note; el.append(b, s);
      }
      hoverable(el, ch); this.labels.append(el);
      return { ch, el, line: path('dash'), link: path('dash') };
    });
    this.slide = tome.chapters.map(() => 0); this.spread = tome.chapters.map(() => 0);
    this.t0 = performance.now(); this.sel = -1; this.hover = -1;
  }
  pick(i: number) { this.sel = i; }
  explode(on: boolean) { this.open = on; if (on) this.t0 = performance.now() - 300; }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.W = Math.max(80, Math.round(r.width / PX)); this.H = Math.max(60, Math.round(r.height / PX));
    for (const c of [this.view, this.off]) { c.width = this.W; c.height = this.H; }
  }
  private rot([x, y, z]: V3): V3 {
    const c = this.cam, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    [x, z] = [x * cy - z * sy, x * sy + z * cy];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    return [x, y, z];
  }
  private project(p: V3): P {
    const [x, y, z0] = this.rot(p), z = z0 + this.cam.dist, s = (this.cam.f * Math.min(this.W, this.H * 1.25)) / z;
    return [this.W / 2 + this.cam.ox * this.W + x * s, this.H / 2 + this.cam.oy * this.H + y * s, z, s];
  }
  private poly(pts: P[] | [number, number][], fill: string | null, stroke: string | null) {
    const c = this.ctx;
    c.beginPath(); pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.stroke(); }
  }
  // A slab: the faces turned toward the eye, the standing ones ruled with
  // page edges.
  private slab(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, lift: number) {
    const faces: { n: V3; q: V3[]; a: number; ruled?: boolean }[] = [
      { n: [0, -1, 0], q: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], a: 0.07 },
      { n: [0, 1, 0], q: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], a: 0.05 },
      { n: [0, 0, -1], q: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], a: 0.16, ruled: true },
      { n: [0, 0, 1], q: [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], a: 0.16, ruled: true },
      { n: [-1, 0, 0], q: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], a: 0.34 },
      { n: [1, 0, 0], q: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], a: 0.12, ruled: true },
    ];
    for (const f of faces) {
      const mid = f.q.reduce<V3>((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      const n = this.rot(f.n), pc = this.rot(mid);
      if (n[0] * pc[0] + n[1] * pc[1] + n[2] * (pc[2] + this.cam.dist) >= 0) continue;
      this.poly(f.q.map((p) => this.project(p)), `rgba(255,255,255,${f.a + lift})`, 'rgba(255,255,255,.95)');
      if (!f.ruled) continue;
      const m = Math.max(1, Math.round((y1 - y0) / 0.024));
      this.ctx.strokeStyle = `rgba(255,255,255,${lift ? 0.4 : 0.2})`;
      for (let j = 1; j < m; j++) {
        const yy = y0 + ((y1 - y0) * j) / m, a = f.q[0]!, b = f.q[3]!;
        const p0 = this.project([a[0], yy, a[2]]), p1 = this.project([b[0], yy, b[2]]);
        this.ctx.beginPath(); this.ctx.moveTo(p0[0], p0[1]); this.ctx.lineTo(p1[0], p1[1]); this.ctx.stroke();
      }
    }
  }
  private present() {
    const img = this.ctx.getImageData(0, 0, this.W, this.H), d = img.data;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const i = (y * this.W + x) * 4, L = d[i]! / 255, t = BAYER[(y & 3) * 4 + (x & 3)]!;
      const c = L > 0.88 ? INK.h : L > t * 0.96 + 0.025 ? INK.p : INK.g;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    this.vctx.putImageData(img, 0, 0);
  }

  private frame(now: number) {
    const { chapters, plates } = this.tome, c = this.ctx, el = (now - this.t0) / 1000, n = chapters.length;
    const s2 = this.still ? 0 : Math.sin(now / 4200) * 0.1; this.cam.yaw += s2 - this.sway; this.sway = s2;
    c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, this.W, this.H); c.lineWidth = 1;
    if (!n) { this.present(); return; }
    const N = chapters[n - 1]!.to, gap = GAP * Math.min(1, 10 / n);
    // The whole stack in view, however many chapters it has.
    this.cam.f = 1.3 * Math.min(1, 3.6 / (BOOK + gap * (n - 1) + 0.6));
    // Closed it is one book; opened, the chapters part, the first first.
    let y = 0;
    const slabs = chapters.map((ch, k) => {
      const th = Math.max(0.04, ((ch.to - ch.from + 1) / N) * BOOK);
      const target = this.open ? (this.still ? 1 : ease((el - 0.35 - k * 0.07) / 1.1)) : 0;
      this.spread[k]! += (target - this.spread[k]!) * (this.still ? 1 : 0.12);
      this.slide[k]! += ((k === this.sel ? 1 : k === this.hover ? 0.3 : 0) - this.slide[k]!) * (this.still ? 1 : 0.14);
      const s = { k, th, y0: y + k * gap * this.spread[k]!, y1: 0, dz: -0.62 * this.slide[k]!, dx: -0.08 * this.slide[k]!, depth: 0 };
      y += th; return s;
    });
    const mid = (slabs[n - 1]!.y0 + slabs[n - 1]!.th) / 2;
    for (const s of slabs) { s.y0 -= mid; s.y1 = s.y0 + s.th; s.depth = this.rot([s.dx, (s.y0 + s.y1) / 2, s.dz])[2]; }
    for (const s of [...slabs].sort((a, b) => b.depth - a.depth)) {
      this.slab(-W / 2 + s.dx, W / 2 + s.dx, s.y0, s.y1, -D / 2 + s.dz, D / 2 + s.dz, (s.k === this.hover ? 0.08 : 0) + (s.k === this.sel ? 0.12 : 0));
      if (s.k !== this.sel || this.slide[s.k]! < 0.3) continue;
      // its first page lifted open on the spine
      const phi = 0.62 * ease((this.slide[s.k]! - 0.3) / 0.7), x0 = -W / 2 + s.dx, z0 = -D / 2 + s.dz, z1 = D / 2 + s.dz;
      const at = (u: number, v: number) => this.project([x0 + u * W * Math.cos(phi), s.y0 - 0.004 - u * W * Math.sin(phi), lerp(z0, z1, v)]);
      this.poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)], 'rgba(255,255,255,.2)', '#fff');
      c.strokeStyle = 'rgba(255,255,255,.8)';
      for (let row = 0; row < 15; row++) {
        if (row === 6 || row === 7) continue;
        const v = 0.12 + row * 0.055, len = row === 0 ? 0.42 : row % 4 === 3 ? 0.45 : 0.72 + ((row * 37 + s.k * 11) % 13) / 100;
        const p0 = at(0.1, v), p1 = at(0.1 + len * 0.8, v);
        c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
      }
      this.poly([at(0.28, 0.44), at(0.72, 0.44), at(0.72, 0.52), at(0.28, 0.52)], null, '#fff');
    }
    // What hangs off a chapter, toward the right of the screen however the
    // book is turned; a new arrival flies in and docks.
    const rx = Math.cos(this.cam.yaw), rz = -Math.sin(this.cam.yaw), dockT = this.still ? 1 : ease((el - 2.2) / 1.8);
    const placed = plates.filter((p) => p.ch >= 0 && p.ch < n).map((p) => {
      const s = slabs[p.ch]!, k = plates.filter((q) => q.ch === p.ch && plates.indexOf(q) < plates.indexOf(p)).length;
      const out = W * 0.62 + 0.42 + k * 0.4;
      let pos: V3 = [s.dx + rx * out, (s.y0 + s.y1) / 2, s.dz + rz * out];
      const alpha = p.isNew ? dockT : 1;
      if (p.isNew) pos = [lerp(3.4, pos[0], dockT), lerp(-2.4, pos[1], dockT), lerp(-1.6, pos[2], dockT)];
      const w = 0.14, h = 0.19, bob = this.still ? 0 : Math.sin(el * 1.2 + k + p.ch) * 0.012;
      const pts = ([[-w, -h], [w, -h], [w, h], [-w, h]] as const).map(([u, v]) => this.project([pos[0] + rx * u, pos[1] + v + bob, pos[2] + rz * u]));
      for (let d = p.kind === 'deck' ? 2 : 0; d >= 0; d--) this.poly(pts.map(([x, yy]) => [x + d * 2, yy - d * 2] as [number, number]), `rgba(255,255,255,${(d ? 0.02 : 0.06) * alpha})`, `rgba(255,255,255,${0.95 * alpha})`);
      const m = this.project([pos[0], pos[1] + bob, pos[2]]);
      if (p.kind === 'deck') { c.strokeStyle = `rgba(255,255,255,${alpha})`; c.beginPath(); c.arc(m[0], m[1], 2.5, 0, Math.PI * 2); c.stroke(); }
      else { c.fillStyle = `rgba(255,255,255,${0.8 * alpha})`; for (let r = 0; r < 4; r++) c.fillRect(m[0] - 3, m[1] - 4 + r * 2.5, r === 3 ? 4 : 6, 1); }
      if (p.isNew && dockT > 0.98 && el < 6 && !this.still) { const rr = (el - 4) * 36; if (rr > 0) { c.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - rr / 50)})`; c.beginPath(); c.arc(m[0], m[1], rr, 0, Math.PI * 2); c.stroke(); } }
      return {
        ch: p.ch, alpha,
        right: this.project([pos[0] + rx * (w + 0.02), pos[1], pos[2] + rz * (w + 0.02)]),
        left: this.project([pos[0] - rx * w, pos[1], pos[2] - rz * w]),
        from: this.project([s.dx + rx * W * 0.5, (s.y0 + s.y1) / 2, s.dz + rz * W * 0.5]),
      };
    });
    this.present();
    this.place(slabs, placed, el);
  }

  // The labels: chapters down the left, aligned to their slabs; what hangs
  // off them down the right, one label a chapter.
  private place(slabs: { k: number; y0: number; y1: number; dx: number; dz: number }[], placed: { ch: number; alpha: number; right: P; left: P; from: P }[], el: number) {
    const shown = this.open && (this.still || el > 1.1), Wpx = this.W * PX;
    const a0 = this.project([0, slabs[0]!.y0 - 0.35, 0]), a1 = this.project([0, slabs[slabs.length - 1]!.y1 + 0.35, 0]);
    this.axis.setAttribute('d', `M${a0[0] * PX},${a0[1] * PX} L${a1[0] * PX},${a1[1] * PX}`);
    let last = 34;
    for (const s of slabs) {
      const a = this.project([-W / 2 + s.dx, (s.y0 + s.y1) / 2, s.dz]), call = this.calls[s.k]!, line = this.lines[s.k]!, w = call.offsetWidth;
      const yy = Math.max(a[1] * PX, last + 40); last = yy;
      const hot = s.k === this.sel || s.k === this.hover;
      call.style.transform = `translate(14px, ${yy}px) translateY(-50%)`; call.style.opacity = shown ? '1' : '0';
      call.classList.toggle('hot', hot);
      const ex = 14 + w, elbow = Math.max(ex + 8, Math.min(a[0] * PX - 18, ex + 30));
      line.setAttribute('d', `M${ex},${yy} L${elbow},${yy} L${a[0] * PX},${a[1] * PX}`);
      line.setAttribute('class', hot ? 'hot' : ''); line.style.opacity = shown ? '1' : '0';
    }
    last = 34;
    for (const g of this.groups) {
      const row = placed.filter((p) => p.ch === g.ch);
      if (!row.length) continue;
      const end = row.reduce((a, p) => (p.right[0] > a.right[0] ? p : a)), first = row.reduce((a, p) => (p.left[0] < a.left[0] ? p : a));
      const h = g.el.offsetHeight, w = g.el.offsetWidth, docked = row.every((p) => p.alpha > 0.95), vis = shown && docked;
      const yy = Math.max(end.right[1] * PX, last + h / 2 + 12); last = yy + h / 2;
      const lx = Wpx - 14 - w;
      g.el.style.transform = `translate(${lx}px, ${yy}px) translateY(-50%)`; g.el.style.opacity = vis ? '1' : '0';
      g.el.classList.toggle('hot', g.ch === this.sel || g.ch === this.hover);
      g.line.setAttribute('d', `M${lx},${yy} L${Math.max(end.right[0] * PX + 12, lx - 22)},${yy} L${end.right[0] * PX},${end.right[1] * PX}`);
      g.link.setAttribute('d', `M${first.left[0] * PX},${first.left[1] * PX} L${first.from[0] * PX},${first.from[1] * PX}`);
      g.line.style.opacity = vis ? '1' : '0'; g.link.style.opacity = docked ? '1' : '0';
    }
    // The slab under the pointer, when the pointer is on the drawing.
    if (this.mouse && !this.labels.matches(':hover')) {
      let best = -1, bd = Infinity;
      for (const s of slabs) { const a = this.project([s.dx, (s.y0 + s.y1) / 2, s.dz]); const d = Math.hypot(a[0] - this.mouse.x, (a[1] - this.mouse.y) * 2.2); if (d < bd) { bd = d; best = s.k; } }
      this.hover = bd < (W * this.project([0, 0, 0])[3]) / 1.6 ? best : -1;
    } else if (!this.mouse && !this.labels.matches(':hover')) this.hover = -1;
  }
}
