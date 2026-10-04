// The post's sky. You stand at the middle of it: every letter a star, every
// sender a constellation (post.ts lays them out), Kael'thos drawn in stars
// overhead, an astrolabe's rings turning about you. Unread stars are large and
// turning; read ones small, dimmer the older they are. All the stars are one
// draw, so a few hundred letters cost what one does. A star chosen falls to you
// and breaks into dust that settles where the letter will lie; closed, the dust
// goes home. New mail comes in as a shooting star.
import * as THREE from 'three';
import type { LetterDto } from '@aura/shared';
import type { Figure } from '../post';
import { rng, reduced, type Build } from './engine';
import art from './art.json';

export type SkyHooks = {
  hover: (i: number | null, x: number, y: number) => void;
  choose: (i: number) => void;
  focus: (key: string) => void;
};
export type Rect = { left: number; right: number; top: number; bottom: number };
export type SkyControl = {
  set: (letters: LetterDto[], figures: Figure[], fresh: number[]) => void;
  mark: (i: number | null) => void;
  look: (i: number) => Promise<void>;
  focus: (key: string) => Promise<void>;
  open: (i: number, rect: Rect) => Promise<void>;
  close: (i: number) => Promise<void>;
  hold: (on: boolean) => void;
};

const R = 12, D = Math.PI / 180, DAY = 86400e3;
const onSphere = (az: number, el: number, r = R) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * r, Math.sin(el) * r, -Math.cos(az) * Math.cos(el) * r);
const ease = { out: (u: number) => 1 - (1 - u) ** 3, io: (u: number) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2), in: (u: number) => u ** 3, lin: (u: number) => u };
const tween = (ms: number, f: (u: number, raw: number) => void, e = ease.io) => new Promise<void>((done) => {
  if (reduced()) { f(1, 1); done(); return; }
  let t0: number | null = null;
  const step = (now: number) => { t0 ??= now; const u = Math.min(1, (now - t0) / ms); f(e(u), u); if (u < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
});
const bez = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, u: number) =>
  a.clone().multiplyScalar((1 - u) ** 2).add(c.clone().multiplyScalar(2 * u * (1 - u))).add(b.clone().multiplyScalar(u * u));

// One point a star, drawn by the shader: a soft core, and for the unread four
// spikes that turn and a slow breath.
const STAR_VS = `attribute float size; attribute float lum; attribute float phase; attribute float flare;
uniform float time; varying float vLum; varying float vFlare; varying float vRot;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (1.0 + 0.16 * sin(time * 2.4 + phase) * flare);
  vLum = lum; vFlare = flare; vRot = phase + time * 0.3 * flare;
}`;
const STAR_FS = `varying float vLum; varying float vFlare; varying float vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); p = mat2(c, -s, s, c) * p;
  float core = clamp(1.0 - length(p) * (vFlare > 0.5 ? 6.0 : 2.0), 0.0, 1.0);
  float spikes = vFlare * (max(0.0, 1.0 - abs(p.x) * 16.0) * max(0.0, 1.0 - abs(p.y) * 2.0)
                         + max(0.0, 1.0 - abs(p.y) * 16.0) * max(0.0, 1.0 - abs(p.x) * 2.0));
  float a = max(core, spikes);
  if (a < 0.03) discard;
  gl_FragColor = vec4(vec3(vLum * a), 1.0);
}`;

function flareTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 14); glow.addColorStop(0, '#fff'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(32, 0); g.lineTo(34, 30); g.lineTo(64, 32); g.lineTo(34, 34); g.lineTo(32, 64); g.lineTo(30, 34); g.lineTo(0, 32); g.lineTo(30, 30); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const dots = (n: number, r: number, material: THREE.PointsMaterial) => {
  const p: number[] = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; p.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return new THREE.Points(g, material);
};

export function sky(labels: () => HTMLElement, hooks: SkyHooks, ready: (ctl: SkyControl) => void): Build {
  return ({ scene, camera, turn, canvas }) => {
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1);
    const heavens = new THREE.Group(); scene.add(heavens);
    const r = rng(33);
    const disposables: { dispose(): void }[] = [];
    const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

    // The far stars, and the milky way as dust.
    {
      const p: number[] = [], q: number[] = [];
      for (let k = 0; k < 2600; k++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(40); p.push(v.x, v.y, v.z); }
      for (let k = 0; k < 5200; k++) {
        const a = r() * Math.PI * 2, s = (r() + r() + r() - 1.5) * 0.22;
        const v = new THREE.Vector3(Math.cos(a), s, Math.sin(a)).normalize().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.9).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.5).multiplyScalar(38);
        q.push(v.x, v.y, v.z);
      }
      for (const [pts, color] of [[p, 0xd0d0d0], [q, 0x8a8a8a]] as const) {
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        heavens.add(new THREE.Points(g, keep(new THREE.PointsMaterial({ color, size: 1, sizeAttenuation: false }))));
      }
    }
    // The astrolabe: three rings with their degrees, turning about you.
    const rings = new THREE.Group(); scene.add(rings);
    const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0x707070 }));
    [[0, 0], [1.2, 0.3], [0.4, -1.1]].forEach(([rx, rz], k) => {
      const g = new THREE.Group(); g.rotation.set(rx!, 0, rz!);
      const rad = 14 + k * 1.5;
      g.add(new THREE.Mesh(keep(new THREE.TorusGeometry(rad, 0.012, 4, 240)), ringMat));
      const tick = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.03, 0.35, 0.03)), ringMat, 72);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 72; i++) { const a = i * 5 * D; m.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * rad, Math.sin(a) * rad, 0); tick.setMatrixAt(i, m); }
      g.add(tick); g.userData.spin = (k % 2 ? -1 : 1) * (0.012 + k * 0.006); rings.add(g);
    });
    // Kael'thos overhead, in stars along his outline.
    const cat = new THREE.Points(keep(new THREE.BufferGeometry()), keep(new THREE.PointsMaterial({ color: 0xe0e0e0, size: 2, sizeAttenuation: false })));
    heavens.add(cat);
    {
      const img = new Image();
      img.onload = () => {
        const N = 160, c = document.createElement('canvas'); c.width = c.height = N;
        const g = c.getContext('2d')!; g.drawImage(img, 0, 0, N, N);
        const d = g.getImageData(0, 0, N, N).data, A = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? 0 : d[(y * N + x) * 4 + 3]!);
        const rr = rng(7), p: number[] = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          if (A(x, y) > 128 && (A(x - 1, y) < 128 || A(x + 1, y) < 128 || A(x, y - 1) < 128 || A(x, y + 1) < 128) && rr() < 0.3) {
            const v = onSphere((x / N - 0.5) * 24 * D, (40 - (y / N) * 24) * D); p.push(v.x, v.y, v.z);
          }
        }
        cat.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent((art as Record<string, string>).sitting!.replace('<rect width="400" height="400" fill="#fff"/>', ''))}`;
    }

    // ---- the letters ----
    const starMat = keep(new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, depthWrite: false }));
    let stars = new THREE.Points(new THREE.BufferGeometry(), starMat);
    let lines = new THREE.LineSegments(new THREE.BufferGeometry(), keep(new THREE.LineBasicMaterial({ color: 0xb4b4b4 })));
    heavens.add(stars, lines);
    let letters: LetterDto[] = [], figures: Figure[] = [];
    let vertexOf = new Map<number, number>(), letterAt: number[] = [], home: THREE.Vector3[] = [];
    const hidden = new Set<number>();
    const tags = new Map<string, HTMLButtonElement>();
    const look = (l: LetterDto) => {
      const age = Math.max(0, Date.now() - Date.parse(l.date)) / DAY;
      return l.unread ? { size: 15, lum: 1, flare: 1 } : { size: age < 7 ? 3 : 2, lum: 0.4 + 0.6 * Math.exp(-age / 21), flare: 0 };
    };
    function paint() {
      const g = stars.geometry, size = g.getAttribute('size') as THREE.BufferAttribute, lum = g.getAttribute('lum') as THREE.BufferAttribute, flare = g.getAttribute('flare') as THREE.BufferAttribute;
      if (!size) return;
      letterAt.forEach((i, k) => {
        const s = look(letters[i]!);
        size.setX(k, hidden.has(letters[i]!.uid) ? 0 : s.size * (k === marked ? 1.5 : 1)); lum.setX(k, s.lum); flare.setX(k, s.flare);
      });
      size.needsUpdate = lum.needsUpdate = flare.needsUpdate = true;
    }
    function set(next: LetterDto[], figs: Figure[], fresh: number[]) {
      letters = next; figures = figs;
      for (const u of fresh) hidden.add(u);
      const pos: number[] = [], phase: number[] = [], seg: number[] = [];
      vertexOf = new Map(); letterAt = []; home = [];
      for (const f of figs) {
        const at = f.stars.map((s) => onSphere(s.az, s.el));
        f.stars.forEach((s, k) => {
          vertexOf.set(s.i, letterAt.length); letterAt.push(s.i); home.push(at[k]!);
          pos.push(at[k]!.x, at[k]!.y, at[k]!.z); phase.push((s.i * 2.399) % 6.28);
          if (s.parent >= 0) seg.push(at[s.parent]!.x, at[s.parent]!.y, at[s.parent]!.z, at[k]!.x, at[k]!.y, at[k]!.z);
        });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
      for (const a of ['size', 'lum', 'flare']) g.setAttribute(a, new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1));
      stars.geometry.dispose(); stars.geometry = g;
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      lines.geometry.dispose(); lines.geometry = lg;
      paint();
      // A name under each figure, with what is unread in it.
      for (const [k, t] of tags) if (!figs.some((f) => f.key === k)) { t.remove(); tags.delete(k); }
      for (const f of figs) {
        let t = tags.get(f.key);
        if (!t) { t = document.createElement('button'); t.className = 'constellation'; t.onclick = () => hooks.focus(f.key); labels().appendChild(t); tags.set(f.key, t); }
        t.innerHTML = '';
        t.append(f.label);
        if (f.unread) { const i = document.createElement('i'); i.textContent = String(f.unread); t.append(i); }
      }
      for (const u of fresh) { const i = letters.findIndex((l) => l.uid === u); if (i >= 0) void shoot(i); }
    }
    let marked = -1;
    // The ring about a star looked at.
    const ring = dots(30, 0.55, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false })));
    ring.visible = false; heavens.add(ring);
    function mark(i: number | null) {
      marked = i === null ? -1 : vertexOf.get(i) ?? -1;
      ring.visible = marked >= 0;
      if (marked >= 0) { ring.position.copy(home[marked]!); ring.lookAt(0, 0, 0); }
      paint();
    }

    // ---- turning: by hand, or to a star or a figure ----
    let held = false;
    const wrapTo = (a: number, near: number) => a + Math.PI * 2 * Math.round((near - a) / (Math.PI * 2));
    async function aim(az: number, el: number) {
      const y0 = turn.y, x0 = turn.x, y1 = wrapTo(az, y0), x1 = Math.max(-0.5, Math.min(0.5, -el));
      turn.hold = true;
      await tween(700, (u) => { turn.y = y0 + (y1 - y0) * u; turn.x = x0 + (x1 - x0) * u; });
      turn.hold = held;
    }
    const starAt = (i: number) => figures.flatMap((f) => f.stars).find((s) => s.i === i) ?? null;
    // Only turns when the star is off toward the edge.
    async function lookAt(i: number) {
      const s = starAt(i); if (!s) return;
      const p = world(i), q = p.clone().project(camera);
      if (Math.abs(q.x) < 0.7 && Math.abs(q.y) < 0.7 && q.z < 1) return;
      await aim(s.az, s.el);
    }
    const world = (i: number) => { const k = vertexOf.get(i) ?? 0; return home[k]!.clone().applyMatrix4(heavens.matrixWorld); };

    // ---- the fall, the dust, the shooting star ----
    const flare = keep(flareTexture());
    const comet = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: flare, depthWrite: false, transparent: true })));
    comet.visible = false; scene.add(comet);
    const TN = 40, trailGeo = keep(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TN * 3), 3));
    const trail = new THREE.Points(trailGeo, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false })));
    trail.visible = false; trail.frustumCulled = false; scene.add(trail);
    const trailFill = (v: THREE.Vector3) => { const p = trailGeo.getAttribute('position') as THREE.BufferAttribute; for (let k = 0; k < TN; k++) p.setXYZ(k, v.x, v.y, v.z); p.needsUpdate = true; };
    const trailPush = (v: THREE.Vector3) => {
      const p = trailGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let k = TN - 1; k > 0; k--) p.setXYZ(k, p.getX(k - 1) + (Math.random() - 0.5) * 0.02, p.getY(k - 1) + (Math.random() - 0.5) * 0.02, p.getZ(k - 1));
      p.setXYZ(0, v.x, v.y, v.z); p.needsUpdate = true;
    };
    const DN = 1800, dustGeo = keep(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DN * 3), 3));
    const dustMat = keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false, transparent: true }));
    const dust = new THREE.Points(dustGeo, dustMat); dust.visible = false; dust.frustumCulled = false; scene.add(dust);
    let from: { a: THREE.Vector3; b: THREE.Vector3; d: number }[] = [], to: THREE.Vector3[] = [];
    // A screen rect as a rect on the plane `d` in front of you.
    const plane = (rc: Rect, d: number) => {
      const h = 2 * d * Math.tan((camera.fov / 2) * D), w = h * camera.aspect, W = canvas.clientWidth, H = canvas.clientHeight;
      return { x0: (rc.left / W - 0.5) * w, x1: (rc.right / W - 0.5) * w, y0: (0.5 - rc.bottom / H) * h, y1: (0.5 - rc.top / H) * h };
    };

    async function shoot(i: number) {
      const uid = letters[i]!.uid;
      await new Promise((ok) => requestAnimationFrame(ok));
      const end = world(i), start = end.clone().add(new THREE.Vector3(9, 7, -4));
      comet.visible = trail.visible = true; comet.scale.setScalar(0.6); trailFill(start);
      await tween(1300, (u) => { const v = bez(start, end.clone().add(new THREE.Vector3(4, 5, 0)), end, u); comet.position.copy(v); trailPush(v); });
      for (let k = 0; k < 12; k++) { trailPush(end); await new Promise((ok) => requestAnimationFrame(ok)); }
      comet.visible = trail.visible = false;
      hidden.delete(uid); paint(); flash(i);
    }
    // A ring of dots that opens out from a star.
    const pulse = dots(36, 0.55, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false, transparent: true })));
    pulse.visible = false; heavens.add(pulse);
    function flash(i: number) {
      const k = vertexOf.get(i); if (k === undefined) return;
      pulse.position.copy(home[k]!); pulse.lookAt(0, 0, 0); pulse.visible = true;
      void tween(900, (u) => { pulse.scale.setScalar(0.5 + u * 2.5); (pulse.material as THREE.PointsMaterial).opacity = 1 - u; }, ease.out).then(() => { pulse.visible = false; });
    }

    async function open(i: number, rect: Rect) {
      const uid = letters[i]!.uid;
      await lookAt(i);
      const p0 = world(i), P = new THREE.Vector3((p0.x / -p0.z) * 0.6, (p0.y / -p0.z) * 0.6, -3);
      hidden.add(uid); paint(); ring.visible = false;
      comet.position.copy(p0); comet.visible = true; trail.visible = true; trailFill(p0);
      await tween(240, (u) => { comet.scale.setScalar(0.9 + u * 1.4); });
      await tween(620, (u) => { const v = bez(p0, p0.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, 1, -6)), P, u); comet.position.copy(v); trailPush(v); comet.scale.setScalar(2.3 - u * 2); }, ease.in);
      comet.visible = trail.visible = false;
      const wr = plane(rect, 3), pos = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      const cols = Math.max(1, Math.round(Math.sqrt((DN * (wr.x1 - wr.x0)) / (wr.y1 - wr.y0)))), rows = Math.ceil(DN / cols);
      from = []; to = [];
      for (let k = 0; k < DN; k++) {
        const a = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.2 + Math.random() * 1.1);
        from.push({ a: P.clone(), b: P.clone().add(a), d: Math.random() * 0.35 });
        to.push(new THREE.Vector3(wr.x0 + ((k % cols) + 0.5) / cols * (wr.x1 - wr.x0), wr.y1 - (Math.floor(k / cols) + 0.5) / rows * (wr.y1 - wr.y0), -3));
      }
      dust.visible = true; dustMat.opacity = 1;
      await tween(1100, (_, raw) => {
        for (let k = 0; k < DN; k++) {
          const { a, b, d } = from[k]!, u = Math.max(0, Math.min(1, (raw - d * 0.5) / 0.65));
          const v = u < 0.3 ? a.clone().lerp(b, ease.out(u / 0.3)) : bez(b, b.clone().lerp(to[k]!, 0.3).add(new THREE.Vector3(0, 0.3, 0)), to[k]!, ease.io((u - 0.3) / 0.7));
          pos.setXYZ(k, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
      }, ease.lin);
      void tween(600, (u) => { dustMat.opacity = 1 - u; }).then(() => { dust.visible = false; });
    }
    async function close(i: number) {
      const uid = letters[i]?.uid;
      if (uid === undefined || !to.length) { if (uid !== undefined) hidden.delete(uid); paint(); return; }
      const pos = dustGeo.getAttribute('position') as THREE.BufferAttribute, back = world(i);
      dust.visible = true; dustMat.opacity = 1;
      await tween(850, (_, raw) => {
        for (let k = 0; k < DN; k++) {
          const u = Math.max(0, Math.min(1, (raw - (from[k]?.d ?? 0) * 0.4) / 0.7));
          const v = bez(to[k]!, to[k]!.clone().lerp(back, 0.4).add(new THREE.Vector3(0, 1, 0)), back, ease.io(u));
          pos.setXYZ(k, v.x, v.y, v.z);
        }
        pos.needsUpdate = true; dustMat.opacity = 1 - raw * 0.6;
      }, ease.lin);
      dust.visible = false;
      hidden.delete(uid); paint(); flash(i);
    }

    // ---- the pointer: a star under it is named; a click, not a drag, opens it ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    function pick(e: PointerEvent): number | null {
      const rc = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); ray.params.Points = { threshold: 0.32 };
      const size = stars.geometry.getAttribute('size') as THREE.BufferAttribute | undefined;
      let best: THREE.Intersection | null = null;
      for (const h of ray.intersectObject(stars)) if (size && size.getX(h.index!) > 0 && (!best || h.distanceToRay! < best.distanceToRay!)) best = h;
      return best ? letterAt[best.index!]! : null;
    }
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: PointerEvent) => {
      if (down) { hooks.hover(null, 0, 0); return; }
      const i = pick(e), rc = canvas.getBoundingClientRect();
      canvas.style.cursor = i === null ? '' : 'pointer';
      hooks.hover(i, e.clientX - rc.left, e.clientY - rc.top);
    };
    const onUp = (e: PointerEvent) => {
      const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 99; down = null;
      if (moved < 6) { const i = pick(e); if (i !== null) hooks.choose(i); }
    };
    const onLeave = () => hooks.hover(null, 0, 0);
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('aura:dispose', () => {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerleave', onLeave);
      stars.geometry.dispose(); lines.geometry.dispose(); disposables.forEach((d) => d.dispose());
    });

    ready({
      set, mark,
      look: lookAt,
      focus: async (key) => { const f = figures.find((x) => x.key === key); if (f) await aim(f.az, f.el); },
      open, close,
      hold: (on) => { held = on; turn.hold = on; },
    });

    const v = new THREE.Vector3();
    return (t, dt) => {
      turn.x = Math.max(-0.5, Math.min(0.5, turn.x));
      heavens.rotation.set(turn.x, turn.y, 0, 'YXZ');
      rings.rotation.copy(heavens.rotation);
      rings.children.forEach((g) => { g.rotation.y += g.userData.spin * dt; });
      starMat.uniforms.time!.value = t;
      ring.rotation.z += dt * 0.5;
      // The names follow their figures; behind you, they are put away.
      heavens.updateMatrixWorld();
      for (const f of figures) {
        const tag = tags.get(f.key); if (!tag) continue;
        let low = Infinity, cx = 0;
        for (const s of f.stars) { const e = Math.min(low, s.el); if (e < low) low = e; cx += s.az; }
        v.copy(onSphere(cx / f.stars.length, low - 2.2 * D)).applyMatrix4(heavens.matrixWorld);
        const q = v.project(camera), on = q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1;
        tag.style.opacity = on ? '1' : '0'; tag.style.pointerEvents = on ? 'auto' : 'none';
        tag.style.transform = `translate(${((q.x + 1) / 2) * canvas.clientWidth}px, ${((1 - q.y) / 2) * canvas.clientHeight}px) translate(-50%, 0)`;
      }
    };
  };
}
