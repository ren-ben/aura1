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
    w = Math.max(1, Math.round(cw / cell)); h = Math.max(1, Math.round(ch / cell));
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
        if (ink[i]) v = near(i) && !(ink[i - 1] && ink[i + 1] && ink[i - size] && ink[i + size]) ? 0.62 : 0.055;
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

// A gothic city at the horizon: towers, spires, rooftops, lit lancets.
export function skyline(g: CanvasRenderingContext2D, w: number, h: number, base: number, seed: number, scale = 1): void {
  const r = rand(seed);
  let x = -10;
  while (x < w + 10) {
    const bw = (10 + r() * 26) * scale, bh = (18 + r() * 60) * scale * (0.6 + 0.6 * Math.sin(x / w * Math.PI));
    const top = base - bh;
    g.fillStyle = grey(0.03);
    g.fillRect(x, top, bw, bh);
    if (r() < 0.5) {
      // A spire.
      g.beginPath(); g.moveTo(x + bw / 2, top - bh * (0.3 + r() * 0.5)); g.lineTo(x, top); g.lineTo(x + bw, top); g.closePath(); g.fill();
    } else if (r() < 0.5) {
      // A rose window, faintly lit.
      g.fillStyle = grey(0.5); g.beginPath(); g.arc(x + bw / 2, top + bh * 0.3, Math.max(1, bw * 0.16), 0, 7); g.fill();
    }
    // Lancet windows.
    g.fillStyle = grey(0.42);
    for (let k = 0; k < Math.floor(bh / (7 * scale)); k++) {
      if (r() > 0.4) continue;
      g.fillRect(x + bw * 0.25 + (r() < 0.5 ? 0 : bw * 0.4), top + 6 * scale + k * 7 * scale, Math.max(1, bw * 0.12), Math.max(1, 3 * scale));
    }
    x += bw + r() * 6 * scale;
  }
}

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
  const halo = g.createRadialGradient(cx, cy, r, cx, cy, r * 3.4);
  halo.addColorStop(0, 'rgba(255,255,255,.22)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, r * 3.4, 0, 7); g.fill();
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

// A church seen from the ward: nave, buttresses, a tower with a lit lancet,
// the spire above everything. Drawn as a silhouette against the sky.
export function church(g: CanvasRenderingContext2D, cx: number, base: number, scale: number, seed = 5): void {
  const r = rand(seed), s = scale;
  const dark = grey(0.02);
  g.fillStyle = dark;
  // Nave, with a pitched roof.
  const nw = 54 * s, nh = 40 * s, nx = cx - nw * 0.34;
  g.fillRect(nx, base - nh, nw, nh);
  g.beginPath(); g.moveTo(nx - 3 * s, base - nh); g.lineTo(nx + nw * 0.45, base - nh - 15 * s); g.lineTo(nx + nw + 3 * s, base - nh); g.closePath(); g.fill();
  // Tower and spire.
  const tw = 20 * s, th = 92 * s, tx = cx - nw * 0.34 - tw * 0.7;
  g.fillRect(tx, base - th, tw, th);
  g.beginPath(); g.moveTo(tx - 4 * s, base - th); g.lineTo(tx + tw / 2, base - th - 42 * s); g.lineTo(tx + tw + 4 * s, base - th); g.closePath(); g.fill();
  // Buttresses along the nave.
  for (let x = nx + 10 * s; x < nx + nw; x += 16 * s) {
    g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - nh * 0.7); g.lineTo(x + 7 * s, base); g.closePath(); g.fill();
  }
  // What is lit inside: the rose window, the belfry, a lancet or two.
  g.fillStyle = grey(0.62);
  g.beginPath(); g.arc(nx + nw * 0.45, base - nh * 0.62, 5.5 * s, 0, 7); g.fill();
  g.fillStyle = grey(0.5);
  g.fillRect(tx + tw * 0.3, base - th + 9 * s, tw * 0.4, 9 * s);
  for (let k = 0; k < 4; k++) {
    if (r() < 0.45) continue;
    g.fillRect(nx + 8 * s + k * 13 * s, base - nh * 0.45, 3.5 * s, 11 * s);
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
