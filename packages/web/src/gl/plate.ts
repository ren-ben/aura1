// Plates: pictures drawn in grey at a coarse grid, then ordered-dithered to
// the console's two inks and scaled up. The same way the device makes its art,
// so a cathedral here and a cathedral there are the same material.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const INK = [197, 188, 171];
const GROUND = [18, 18, 18];

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export function makePlate(canvas: HTMLCanvasElement, draw: Draw, cell = 3) {
  const low = document.createElement('canvas');
  const g = low.getContext('2d', { willReadFrequently: true })!;
  const out = document.createElement('canvas');
  const o = out.getContext('2d')!;
  let w = 0, h = 0;

  function render(t: number) {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    // A plate is drawn in roughly the same number of marks whatever size it is
    // shown at, so a moon is a moon on a phone and on a desk, and the marks
    // simply get bigger. Without this a small plate is all grain.
    w = Math.max(130, Math.round(cw / cell));
    h = Math.max(1, Math.round((w * ch) / cw));
    if (low.width !== w || low.height !== h) { low.width = out.width = w; low.height = out.height = h; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    draw(g, w, h, t);
    const src = g.getImageData(0, 0, w, h);
    const dst = o.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = (src.data[i]! * 0.299 + src.data[i + 1]! * 0.587 + src.data[i + 2]! * 0.114) / 255;
      const on = l > BAYER[(y % 4) * 4 + (x % 4)]!;
      dst.data.set(on ? INK : GROUND, i);
      dst.data[i + 3] = 255;
    }
    o.putImageData(dst, 0, 0);
    canvas.width = cw; canvas.height = ch;
    const c = canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.drawImage(out, 0, 0, cw, ch);
  }
  return render;
}

export const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const grey = (v: number) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;

// Kael'thos from the device's own drawing, turned into a shade map once: his
// body dark, a moonlit rim around it, and his eyes and ear marks bright.
export function catSprite(svg: string, size = 460): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
      x.drawImage(img, 0, 0, size, size);
      const d = x.getImageData(0, 0, size, size);
      const ink = new Uint8Array(size * size);
      for (let i = 0; i < size * size; i++) ink[i] = d.data[i * 4]! < 128 ? 1 : 0;
      // Paper reached from the edge is the sky; paper it cannot reach is his
      // eyes and the white of his ears.
      const outside = new Uint8Array(size * size);
      const stack: number[] = [];
      for (let i = 0; i < size; i++) { stack.push(i, size * (size - 1) + i, i * size, i * size + size - 1); }
      while (stack.length) {
        const p = stack.pop()!;
        if (outside[p] || ink[p]) continue;
        outside[p] = 1;
        const px = p % size, py = (p / size) | 0;
        if (px > 0) stack.push(p - 1);
        if (px < size - 1) stack.push(p + 1);
        if (py > 0) stack.push(p - size);
        if (py < size - 1) stack.push(p + size);
      }
      const shade = x.createImageData(size, size);
      const near = (i: number) => ink[i - 1] || ink[i + 1] || ink[i - size] || ink[i + size] || ink[i - size - 1] || ink[i + size + 1];
      for (let i = 0; i < size * size; i++) {
        let v = -1;
        if (ink[i]) v = near(i) && !(ink[i - 1] && ink[i + 1] && ink[i - size] && ink[i + size]) ? 0.34 : 0.055;
        else if (!outside[i]) v = 0.95;
        if (v < 0) continue;
        const p = i * 4;
        shade.data[p] = shade.data[p + 1] = shade.data[p + 2] = Math.round(v * 255);
        shade.data[p + 3] = 255;
      }
      const s = document.createElement('canvas');
      s.width = s.height = size;
      s.getContext('2d')!.putImageData(shade, 0, 0);
      resolve(s);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

// The ward, built the way a city is: in layers, each one nearer and darker
// than the one behind it, all of it lit from whatever is behind the roofs.
//
// Everything here is drawn as a dark body with a lit edge and lit openings.
// A flat silhouette reads as a cut-out; an edge that catches the light and a
// window that does not reads as a building.

type Ink = { body: string; edge: string; glass: string; dim: string };

const inkFor = (depth: number): Ink => ({
  // The body is the dark itself. Distance only takes the light out of the
  // windows, never puts grey into the walls: grey walls dither into scribble.
  body: grey(0),
  edge: grey(depth > 0.6 ? 0 : 0.5 - depth * 0.3),
  glass: grey(0.95 - depth * 0.3),
  dim: grey(0),
});

// A lancet: the pointed window this whole architecture is made of.
function lancet(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: Ink, lit: boolean): void {
  g.fillStyle = lit ? ink.glass : ink.dim;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + w * 0.7);
  g.quadraticCurveTo(x + w / 2, y - w * 0.15, x + w, y + w * 0.7);
  g.lineTo(x + w, y + h);
  g.closePath();
  g.fill();
  if (lit && w > 3) {
    // The mullion down the middle of it.
    g.fillStyle = ink.body;
    g.fillRect(x + w / 2 - 0.5, y + w * 0.2, Math.max(0.6, w * 0.12), h - w * 0.2);
  }
}

// A row of them under an arcade.
function arcade(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number, ink: Ink, r: () => number): void {
  const gap = w / n;
  for (let i = 0; i < n; i++) {
    const ww = gap * 0.56;
    lancet(g, x + i * gap + gap * 0.22, y, ww, h, ink, r() < 0.45);
  }
}

// A rose window: the wheel of tracery over the west door.
function rose(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, ink: Ink): void {
  g.fillStyle = ink.glass;
  g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill();
  g.fillStyle = ink.body;
  g.beginPath(); g.arc(cx, cy, rad * 0.36, 0, 7); g.fill();
  const spokes = rad > 5 ? 8 : 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    g.save();
    g.translate(cx, cy); g.rotate(a);
    g.fillRect(-Math.max(0.5, rad * 0.06), 0, Math.max(1, rad * 0.12), rad);
    g.restore();
  }
  g.strokeStyle = ink.edge; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke();
}

// A street lamp: the iron post, the lantern, and the pool of light it throws.
function lamp(g: CanvasRenderingContext2D, x: number, base: number, h: number, ink: Ink): void {
  g.fillStyle = ink.body;
  g.fillRect(x - 0.5, base - h, Math.max(1, h * 0.05), h);
  g.fillStyle = ink.edge;
  g.fillRect(x - 0.5, base - h, Math.max(0.6, h * 0.025), h);
  const lx = x, ly = base - h - h * 0.06;
  const halo = g.createRadialGradient(lx, ly, 0, lx, ly, h * 0.55);
  halo.addColorStop(0, 'rgba(255,255,255,.5)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(lx, ly, h * 0.55, 0, 7); g.fill();
  g.fillStyle = grey(0.95);
  g.beginPath(); g.moveTo(lx - h * 0.07, ly + h * 0.09); g.lineTo(lx, ly - h * 0.07); g.lineTo(lx + h * 0.07, ly + h * 0.09); g.closePath(); g.fill();
}

// One house of the ward: tall, narrow, steep-roofed, its windows in storeys,
// with chimneys and the odd shutter hanging open.
function house(g: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, ink: Ink, r: () => number): void {
  g.fillStyle = ink.body;
  g.fillRect(x, base - h, w, h);
  // The lit edge, on the side the moon is.
  g.fillStyle = ink.edge;
  g.fillRect(x, base - h, 1, h);
  g.fillRect(x, base - h, w, 1);

  // The roof: steep, and hipped over the front.
  const rh = h * (0.16 + r() * 0.16);
  g.fillStyle = ink.body;
  g.beginPath();
  g.moveTo(x - w * 0.09, base - h);
  g.lineTo(x + w * (0.3 + r() * 0.4), base - h - rh);
  g.lineTo(x + w * 1.09, base - h);
  g.closePath();
  g.fill();
  g.strokeStyle = ink.edge; g.lineWidth = 1; g.stroke();

  // Chimneys on the ridge.
  for (let k = 0, n = r() < 0.55 ? 2 : 1; k < n; k++) {
    const cw = Math.max(1, w * 0.12), cx = x + w * (0.2 + r() * 0.6);
    const ch = rh * (0.6 + r() * 0.9);
    g.fillStyle = ink.body; g.fillRect(cx, base - h - ch, cw, ch);
    g.fillStyle = ink.edge; g.fillRect(cx, base - h - ch, cw, 1);
  }

  // The storeys. Every house is lit differently; some are dark all the way up.
  const storeys = Math.max(1, Math.floor(h / (w * 0.85)));
  const dark = r() < 0.3;
  for (let s = 0; s < storeys; s++) {
    const y = base - h + h * 0.1 + s * (h * 0.82 / storeys);
    const wh = Math.min(h * 0.5 / storeys, w * 0.5);
    if (w > 7) arcade(g, x + w * 0.12, y, w * 0.76, wh, w > 14 ? 3 : 2, ink, dark ? () => 1 : r);
    else lancet(g, x + w * 0.3, y, w * 0.4, wh, ink, !dark && r() < 0.5);
  }
  // A shutter, hanging off one of them.
  if (r() < 0.25 && w > 9) {
    const y = base - h + h * (0.2 + r() * 0.5);
    g.fillStyle = ink.body;
    g.save(); g.translate(x + w * 0.1, y); g.rotate(-0.4 + r() * 0.3);
    g.fillRect(0, 0, Math.max(1, w * 0.1), Math.max(2, h * 0.09));
    g.restore();
  }
}

// The cathedral: the thing the ward is built around. Nave, aisle roofs,
// buttresses, a rose over the door, and the tower with its spire.
export function church(g: CanvasRenderingContext2D, cx: number, base: number, scale: number, seed = 5): void {
  const r = rand(seed), s = scale;
  const ink = inkFor(0.1);
  const navW = 58 * s, navH = 46 * s, navX = cx - navW * 0.36;

  // Buttresses first: they stand in front of the wall.
  for (let x = navX + 6 * s; x < navX + navW; x += 15 * s) {
    g.fillStyle = ink.body;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x, base - navH * 0.66);
    g.lineTo(x + 5 * s, base - navH * 0.52);
    g.lineTo(x + 5 * s, base);
    g.closePath(); g.fill();
    g.strokeStyle = ink.edge; g.lineWidth = 1; g.stroke();
  }

  g.fillStyle = ink.body; g.fillRect(navX, base - navH, navW, navH);
  g.fillStyle = ink.edge; g.fillRect(navX, base - navH, navW, 1); g.fillRect(navX, base - navH, 1, navH);

  // The roof of the nave, and the lower aisle roofs either side.
  g.fillStyle = ink.body;
  g.beginPath();
  g.moveTo(navX - 4 * s, base - navH);
  g.lineTo(navX + navW * 0.44, base - navH - 17 * s);
  g.lineTo(navX + navW + 4 * s, base - navH);
  g.closePath(); g.fill();
  g.strokeStyle = ink.edge; g.stroke();

  // The great window, and the arcade under it.
  rose(g, navX + navW * 0.44, base - navH * 0.66, 6.5 * s, ink);
  arcade(g, navX + navW * 0.12, base - navH * 0.4, navW * 0.76, navH * 0.3, 5, ink, r);

  // The tower: square, stepped, with a belfry and a spire on top.
  const twW = 21 * s, twH = 96 * s, twX = navX - twW * 0.75;
  g.fillStyle = ink.body; g.fillRect(twX, base - twH, twW, twH);
  g.fillStyle = ink.edge; g.fillRect(twX, base - twH, twW, 1); g.fillRect(twX, base - twH, 1, twH);
  // The string courses that break it into stages.
  for (let k = 1; k < 4; k++) {
    g.fillStyle = ink.edge;
    g.fillRect(twX - 1.5 * s, base - twH + (twH / 4) * k, twW + 3 * s, Math.max(1, 1.2 * s));
  }
  lancet(g, twX + twW * 0.3, base - twH + 10 * s, twW * 0.4, 13 * s, ink, true);
  lancet(g, twX + twW * 0.3, base - twH * 0.55, twW * 0.4, 11 * s, ink, false);
  // The spire, with a finial and a cross bar.
  g.fillStyle = ink.body;
  g.beginPath();
  g.moveTo(twX - 4 * s, base - twH);
  g.lineTo(twX + twW / 2, base - twH - 46 * s);
  g.lineTo(twX + twW + 4 * s, base - twH);
  g.closePath(); g.fill();
  g.strokeStyle = ink.edge; g.stroke();
  g.fillStyle = ink.edge;
  g.fillRect(twX + twW / 2 - 3 * s, base - twH - 50 * s, 6 * s, Math.max(1, s));
  g.fillRect(twX + twW / 2 - 0.5 * s, base - twH - 56 * s, Math.max(1, s), 8 * s);
}

// A street of the ward, in one layer of depth. depth 0 is nearest.
export function street(g: CanvasRenderingContext2D, w: number, base: number, seed: number, scale: number, depth: number): void {
  const r = rand(seed);
  const ink = inkFor(depth);
  let x = -6 * scale;
  while (x < w + 6 * scale) {
    const hw = (7 + r() * 13) * scale;
    const hh = (26 + r() * 46) * scale * (0.75 + 0.35 * Math.sin((x / w) * Math.PI * 1.3 + seed));
    house(g, x, base, hw, hh, ink, r);
    x += hw + r() * 2.5 * scale;
  }
}

// The railing along the ledge: iron, with its spear heads.
export function railing(g: CanvasRenderingContext2D, w: number, y: number, scale: number): void {
  const ink = inkFor(0);
  const step = Math.max(4, 7 * scale);
  g.fillStyle = ink.edge;
  g.fillRect(0, y, w, Math.max(1, scale * 0.7));
  g.fillStyle = ink.body;
  for (let x = 0; x < w; x += step) {
    g.fillRect(x, y, Math.max(1, scale * 0.6), 9 * scale);
    g.beginPath();
    g.moveTo(x - scale * 0.9, y);
    g.lineTo(x + scale * 0.3, y - 3.2 * scale);
    g.lineTo(x + scale * 1.5, y);
    g.closePath(); g.fill();
  }
}

export { lamp };

export function starfield(g: CanvasRenderingContext2D, w: number, h: number, count: number, seed: number, dx = 0, dy = 0): void {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const x = (r() * w + dx * 0.4 + w) % w, y = (r() * h * 0.8 + dy * 0.4 + h) % h;
    g.fillStyle = grey(0.35 + r() * 0.6);
    g.fillRect(x, y, r() < 0.12 ? 2 : 1, 1);
  }
}

export function moonDisc(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed = 7): void {
  const grad = g.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, grey(1)); grad.addColorStop(0.7, grey(0.85)); grad.addColorStop(1, grey(0.6));
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  const rr = rand(seed);
  for (let i = 0; i < 14; i++) {
    const a = rr() * 7, d = Math.sqrt(rr()) * r * 0.82;
    g.fillStyle = grey(0.55 + rr() * 0.2);
    g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.04 + rr() * 0.09), 0, 7); g.fill();
  }
  // The halo around it.
  const halo = g.createRadialGradient(cx, cy, r, cx, cy, r * 2.1);
  halo.addColorStop(0, 'rgba(255,255,255,.16)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, r * 2.1, 0, 7); g.fill();
}

export function bats(g: CanvasRenderingContext2D, w: number, h: number, t: number, count: number, seed: number): void {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const speed = 6 + r() * 14, phase = r() * 100, size = 3 + r() * 5;
    const x = ((t * speed + phase * 9) % (w + 60)) - 30;
    const y = h * (0.1 + r() * 0.5) + Math.sin(t * (1 + r()) + phase) * 8;
    const flap = Math.sin(t * 7 + phase) * 0.5 + 0.5;
    g.fillStyle = grey(0.02);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x - size, y - size * flap, x - size * 2, y + size * 0.2);
    g.quadraticCurveTo(x - size, y + size * 0.4, x, y + size * 0.5);
    g.quadraticCurveTo(x + size, y + size * 0.4, x + size * 2, y + size * 0.2);
    g.quadraticCurveTo(x + size, y - size * flap, x, y);
    g.fill();
  }
}

// Naked trees in the wind: every branch leans with the gust, the thin ones
// most. Nothing on them - it is always the cold end of the year here.
export function trees(g: CanvasRenderingContext2D, w: number, base: number, t: number, count: number, seed: number, scale = 1): void {
  const r = rand(seed);
  const gust = Math.sin(t * 0.7) * 0.06 + Math.sin(t * 1.9 + 1.3) * 0.03;
  for (let i = 0; i < count; i++) {
    const x = r() * w, height = (26 + r() * 40) * scale, lean = (r() - 0.5) * 0.3;
    const shade = 0.02 + r() * 0.05;
    g.strokeStyle = grey(shade); g.lineCap = 'round';
    const limb = (x0: number, y0: number, len: number, ang: number, width: number, depth: number) => {
      const sway = gust * (4 - depth) * (1.6 / Math.max(0.6, width));
      const a = ang + sway;
      const x1 = x0 + Math.sin(a) * len, y1 = y0 - Math.cos(a) * len;
      g.lineWidth = Math.max(0.7, width);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      if (depth >= 4 || len < 3) return;
      const n = depth === 0 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        limb(x1, y1, len * (0.58 + r() * 0.2), a + (k - (n - 1) / 2) * (0.5 + r() * 0.35), width * 0.55, depth + 1);
      }
    };
    limb(x, base, height * 0.45, lean, Math.max(1, height * 0.055), 0);
  }
}

// Rain or ash on the wind: short strokes, all leaning the same way.
export function drift(g: CanvasRenderingContext2D, w: number, h: number, t: number, count: number, seed: number): void {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const speed = 18 + r() * 26, phase = r() * 90;
    const x = ((r() * w + t * speed * 0.6 + phase) % (w + 40)) - 20;
    const y = ((r() * h + t * speed + phase * 3) % (h + 20)) - 10;
    g.fillStyle = grey(0.3 + r() * 0.35);
    g.fillRect(x, y, 1, 1 + (r() < 0.3 ? 1 : 0));
  }
}

// The event horizon: the disk edge on, its far side bent over the top and
// under the bottom, a thin photon ring, and nothing at all in the middle.
export function gargantua(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.17;
  const r = rand(4);
  starfield(g, w, h, Math.round(w * h / 140), 4);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const tilt = 0.12;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - cx) / R, dy = (y - cy) / R;
    const rad = Math.hypot(dx, dy);
    let v = 0;
    if (rad < 1) { v = -1; }  // the horizon itself: nothing
    else {
      // The flat disk, seen almost edge on: thin near the middle, bright inside.
      const plane = dy - dx * tilt;
      const thick = 0.055 + Math.abs(dx) * 0.05;
      const inDisk = Math.abs(plane) < thick && Math.abs(dx) > 1.02;
      if (inDisk) {
        const fall = Math.min(1, 1.35 / Math.abs(dx));
        const doppler = dx < 0 ? 1.25 : 0.62;  // the side coming toward you is brighter
        const swirl = 0.72 + 0.28 * Math.sin(dx * 7 - t * 2.2 + Math.sin(dx * 3));
        v = Math.max(v, fall * doppler * swirl * (1 - Math.abs(plane) / thick) * 1.35);
      }
      // Its far side, lensed over the top and under the bottom.
      const ring = Math.abs(rad - 1.42) < 0.2 + 0.1 * Math.abs(dy / Math.max(0.2, rad));
      if (ring && Math.abs(dy) > 0.12) {
        const lift = Math.min(1, Math.abs(dy) / rad);
        const doppler = dx < 0 ? 1.2 : 0.7;
        v = Math.max(v, lift * doppler * (1 - Math.abs(rad - 1.42) / 0.3) * 1.15);
      }
      // The photon ring.
      if (Math.abs(rad - 1.06) < 0.035) v = Math.max(v, 1.25);
    }
    const i = (y * w + x) * 4;
    if (v < 0) { d[i] = d[i + 1] = d[i + 2] = 0; continue; }
    if (v === 0) continue;
    const g0 = d[i]! / 255;
    const lit = Math.min(1, g0 + v * (0.85 + 0.3 * r()));
    d[i] = d[i + 1] = d[i + 2] = Math.round(lit * 255);
  }
  g.putImageData(img, 0, 0);
}

// A labyrinth that does not quite close: the house is bigger inside.
export function labyrinth(g: CanvasRenderingContext2D, w: number, h: number, seed: number, step = 9): void {
  const r = rand(seed);
  g.strokeStyle = grey(0.4);
  g.lineWidth = 1;
  for (let y = step; y < h - step; y += step) for (let x = step; x < w - step; x += step) {
    if (r() < 0.5) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + step, y); g.stroke(); }
    if (r() < 0.5) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + step); g.stroke(); }
  }
  // The corridor that is longer than the house.
  g.strokeStyle = grey(0.9);
  g.lineWidth = 2;
  g.beginPath();
  let x = step * 2, y = h / 2;
  g.moveTo(x, y);
  while (x < w - step * 2) {
    const dy = (r() < 0.5 ? -1 : 1) * step * (1 + Math.floor(r() * 3));
    g.lineTo(x, Math.min(h - step, Math.max(step, y + dy))); y = Math.min(h - step, Math.max(step, y + dy));
    x += step * (1 + Math.floor(r() * 2));
    g.lineTo(x, y);
  }
  g.stroke();
}

// The drawing of him, read back as points: everywhere his ink is, with how
// bright that ink was. Used to take him apart and put him back together.
export function sampleSprite(sprite: HTMLCanvasElement, step = 3): { x: number; y: number; v: number }[] {
  const n = sprite.width;
  const d = sprite.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, n, n).data;
  const out: { x: number; y: number; v: number }[] = [];
  for (let y = 0; y < n; y += step) for (let x = 0; x < n; x += step) {
    const i = (y * n + x) * 4;
    if (!d[i + 3]) continue;
    out.push({ x: x / n - 0.5, y: y / n - 0.5, v: d[i]! / 255 });
  }
  return out;
}

// What he is when he is not being a cat.
//
// A dark body with nothing coming back out of it, a corona of arms reaching
// off it - each one branching once and tapering to nothing, the way a root
// does - filaments carried round by whatever it is falling into, and eyes
// open in the mass of it. Every point of his drawing is given a place here,
// so he can come apart into it and go back.
export function greatOne(count: number, seed = 9): { x: number; y: number; z: number; v: number }[] {
  const r = rand(seed);
  const out: { x: number; y: number; z: number; v: number }[] = [];
  const ARMS = 14;

  // The arms are laid out first, so their roots sit on the body evenly.
  const arms = Array.from({ length: ARMS }, (_, i) => {
    const a = (i / ARMS) * Math.PI * 2 + r() * 0.3;
    const lift = (r() - 0.5) * 2.6;
    return { a, lift, len: 0.42 + r() * 0.46, curl: (r() - 0.5) * 2.2, fat: 0.5 + r() * 0.7 };
  });

  for (let i = 0; i < count; i++) {
    const pick = r();

    if (pick < 0.2) {
      // The body: a shell, thickest where it is turned away from us.
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const rad = 0.2 + r() * 0.05;
      const s2 = Math.sqrt(1 - u * u);
      out.push({ x: Math.cos(a) * s2 * rad, y: u * rad * 0.8, z: Math.sin(a) * s2 * rad, v: 0.12 + r() * 0.3 });

    } else if (pick < 0.72) {
      // An arm: out from the body, curling, thinning, and branching once.
      const arm = arms[Math.floor(r() * ARMS)]!;
      const u = Math.pow(r(), 0.7);
      const branch = r() < 0.4 && u > 0.45;
      const off = branch ? (r() - 0.5) * 0.9 * (u - 0.45) : 0;
      const a = arm.a + arm.curl * u * u * 0.45 + off;
      const lift = arm.lift * u * u * 0.75 + (branch ? off * 0.7 : 0);
      const rad = 0.2 + u * arm.len;
      // The arm has thickness, and it frays as it goes.
      const fray = (0.055 * arm.fat) * (1 - u * 0.75);
      const wob = Math.sin(u * 13 + arm.a * 3) * 0.02 * u;
      out.push({
        x: Math.cos(a) * rad + (r() - 0.5) * fray + wob,
        y: lift + (r() - 0.5) * fray * 0.8,
        z: Math.sin(a) * rad + (r() - 0.5) * fray,
        v: (0.35 + (1 - u) * 0.5) * (branch ? 0.7 : 1),
      });

    } else if (pick < 0.93) {
      // Filaments: whatever is left, drawn round the body in long threads.
      const thread = Math.floor(r() * 9), u = r();
      const a = (thread / 9) * Math.PI * 2 + u * 3.4;
      const rad = 0.3 + u * 0.72;
      const flat = 0.1 + (1 - u) * 0.12;
      out.push({
        x: Math.cos(a) * rad,
        y: (r() - 0.5) * flat * 0.5 + Math.sin(a * 2) * 0.03,
        z: Math.sin(a) * rad,
        v: 0.18 + (1 - u) * 0.4,
      });

    } else {
      // Eyes, open in the body and along the first reach of the arms.
      const eye = Math.floor(r() * 9);
      const arm = arms[eye % ARMS]!;
      const along = 0.05 + (eye % 4) * 0.12;
      const a = arm.a + arm.curl * along * along * 0.45;
      const rad = 0.2 + along;
      const cx = Math.cos(a) * rad, cy = arm.lift * along * 0.5, cz = Math.sin(a) * rad;
      const ea = r() * Math.PI * 2, er = Math.sqrt(r()) * 0.05;
      const open = er < 0.014;
      out.push({
        x: cx + Math.cos(ea) * er,
        y: cy + Math.sin(ea) * er * 0.7,
        z: cz + Math.cos(ea) * er * 0.4,
        v: open ? 1 : 0.06,
      });
    }
  }
  return out;
}

// The long walk. Whatever keeps the paths does not walk them as a person: a
// tall crooked column of cloth leaning into the weather, the hem torn and
// dragging behind it, two long arms hanging where arms would be, and a head
// that is a hole with quills swept back off it.
//
// The quills are the whole trick and the whole danger: evenly spaced, of one
// length, they make a windmill. So they grow only out of the back and top of
// the head, in clumps, at every length, each one curved the way the wind is
// going.
export function pilgrim(g: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const r = rand(5);
  const slant = 0.42;  // the weather comes in at this angle

  g.fillStyle = grey(0.02);
  g.fillRect(0, 0, w, h);

  const ground = h * 0.96;

  // The rain.
  const drops = Math.round((w * h) / 70);
  for (let i = 0; i < drops; i++) {
    const speed = 55 + r() * 85, len = 3 + r() * 9, near = r();
    const x = (r() * (w + h) + t * speed * slant) % (w + h) - h * slant;
    const y = (r() * h + t * speed) % (h + 20) - 10;
    g.strokeStyle = grey(0.26 + near * 0.6);
    g.lineWidth = near > 0.86 ? 1.6 : 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len * slant, y + len);
    g.stroke();
  }
  for (let i = 0; i < Math.round(w * 1.3); i++) {
    const y = ground + Math.pow(r(), 0.6) * Math.max(1, h - ground);
    const lit = 0.3 + ((y - ground) / Math.max(1, h - ground)) * 0.6;
    g.fillStyle = grey(lit * (0.5 + r() * 0.5));
    g.fillRect(r() * w, y, 1, 1);
  }

  const tall = h * 0.64;
  const cx = w * 0.5;
  const foot = ground;
  const crownY = foot - tall;
  const sway = Math.sin(t * 0.33) * tall * 0.008;
  const lean = tall * 0.07;    // it leans into the weather, not away from it

  // Light behind it, so the shape has something to be a shape against.
  const behind = g.createRadialGradient(cx, crownY + tall * 0.3, tall * 0.05, cx, crownY + tall * 0.3, tall * 0.62);
  behind.addColorStop(0, 'rgba(255,255,255,.13)');
  behind.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = behind;
  g.fillRect(0, 0, w, h);

  // The cloth: narrow at the shoulders, crooked down its length, dragging a
  // long tail of hem away behind it.
  const neck = crownY + tall * 0.1;
  const shoulder = tall * 0.075, hip = tall * 0.13;
  const cloth = new Path2D();
  cloth.moveTo(cx - shoulder + lean + sway, neck);
  cloth.bezierCurveTo(cx - shoulder * 2.1 + lean, neck + tall * 0.3,
                      cx - hip * 1.1, foot - tall * 0.3,
                      cx - hip * 1.5, foot - tall * 0.02);
  // The hem drags back along the ground, away from the weather.
  cloth.quadraticCurveTo(cx - hip * 2.6, foot + tall * 0.004, cx - hip * 3.4, foot - tall * 0.008);
  cloth.quadraticCurveTo(cx - hip * 1.4, foot + tall * 0.02, cx + hip * 0.2, foot);
  cloth.quadraticCurveTo(cx + hip * 1.3, foot - tall * 0.01, cx + hip * 1.15, foot - tall * 0.06);
  cloth.bezierCurveTo(cx + hip * 0.9, foot - tall * 0.4,
                      cx + shoulder * 1.9 + lean, neck + tall * 0.28,
                      cx + shoulder + lean + sway, neck);
  cloth.closePath();

  g.fillStyle = grey(0.44);
  g.fill(cloth);
  g.strokeStyle = grey(1);
  g.lineWidth = Math.max(1.2, tall * 0.008);
  g.stroke(cloth);

  // Folds: long, uneven, following the crook of it.
  g.save();
  g.clip(cloth);
  for (let k = 0; k < 8; k++) {
    const u = (k + 0.5) / 8;
    const topX = cx + (u - 0.5) * shoulder * 1.8 + lean;
    const lowX = cx + (u - 0.5) * hip * 2.6 - hip * 0.2;
    g.strokeStyle = grey(k % 3 === 0 ? 0.03 : 0.6);
    g.lineWidth = Math.max(0.6, tall * 0.0035);
    g.beginPath();
    g.moveTo(topX, neck + tall * 0.02);
    g.bezierCurveTo(topX - tall * 0.02, neck + tall * 0.4, lowX + tall * 0.01, foot - tall * 0.25, lowX, foot);
    g.stroke();
  }
  g.restore();

  // Two arms, too long, hanging with the cloth over them.
  for (const side of [-1, 1] as const) {
    const sx = cx + side * shoulder * 1.3 + lean, sy = neck + tall * 0.07;
    const drop = tall * (side < 0 ? 0.46 : 0.4);
    const outward = side * tall * (side < 0 ? 0.1 : 0.07);
    g.strokeStyle = grey(0.06);
    g.lineWidth = Math.max(1.4, tall * 0.02);
    g.beginPath();
    g.moveTo(sx, sy);
    g.quadraticCurveTo(sx + outward * 1.4, sy + drop * 0.6, sx + outward, sy + drop);
    g.stroke();
    g.strokeStyle = grey(0.8);
    g.lineWidth = Math.max(0.7, tall * 0.005);
    g.stroke();
    // What passes for a hand: a few long fingers, not a fist.
    for (let f = 0; f < 4; f++) {
      const a = Math.PI / 2 + (f - 1.5) * 0.24 + side * 0.1;
      const len = tall * (0.03 + r() * 0.035);
      g.strokeStyle = grey(0.72);
      g.lineWidth = Math.max(0.6, tall * 0.004);
      g.beginPath();
      g.moveTo(sx + outward, sy + drop);
      g.quadraticCurveTo(sx + outward + Math.cos(a) * len * 0.6, sy + drop + Math.sin(a) * len * 0.7,
                         sx + outward + Math.cos(a + 0.3) * len, sy + drop + Math.sin(a) * len);
      g.stroke();
    }
  }

  // The head: a hole, with quills off the back of it. Clumped, every length,
  // all swept the same way - never a wheel of even spokes.
  const hx = cx + lean * 1.4 + sway, hy = crownY;
  const hr = tall * 0.062;
  const clumps = 4;
  for (let c = 0; c < clumps; c++) {
    // Only the arc away from the weather carries them.
    const root = -2.5 + (c / (clumps - 1)) * 2.0 + (r() - 0.5) * 0.25;
    const quills = 3 + Math.floor(r() * 3);
    const clumpLong = tall * (0.1 + Math.pow(r(), 1.3) * 0.26);
    for (let i = 0; i < quills; i++) {
      const a = root + (i / quills - 0.5) * 0.5 + (r() - 0.5) * 0.12;
      const long = clumpLong * (0.35 + Math.pow(r(), 1.4) * 1.5);
      const curve = -0.5 - r() * 0.7;   // all of them bend the same way
      const wide = Math.max(0.9, tall * 0.007 * (0.6 + r()));
      const x0 = hx + Math.cos(a) * hr * 0.9, y0 = hy + Math.sin(a) * hr * 0.75;
      const x1 = hx + Math.cos(a + curve * 0.35) * (hr + long);
      const y1 = hy + Math.sin(a + curve * 0.35) * (hr + long) - long * 0.15;
      g.strokeStyle = grey(0.06);
      g.lineWidth = wide * 2.2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(hx + Math.cos(a + curve * 0.15) * (hr + long * 0.55),
                         hy + Math.sin(a + curve * 0.15) * (hr + long * 0.55), x1, y1);
      g.stroke();
      g.strokeStyle = grey(0.8 + r() * 0.2);
      g.lineWidth = wide;
      g.stroke();
    }
  }
  // And the hole itself.
  g.fillStyle = grey(0);
  g.beginPath();
  g.ellipse(hx, hy, hr, hr * 1.15, 0.2, 0, 7);
  g.fill();
}
