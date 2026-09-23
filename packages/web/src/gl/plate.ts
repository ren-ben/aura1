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

// A gothic city at the horizon: narrow houses under steep roofs, chimneys and
// iron finials, arcades of lit lancets, a spire or two over all of it. Drawn
// dark with a lit edge, the way a city looks with the moon behind it.
export function skyline(g: CanvasRenderingContext2D, w: number, h: number, base: number, seed: number, scale = 1): void {
  const r = rand(seed);
  const dark = grey(0.03), edge = grey(0.6), lit = grey(0.52);
  let x = -10;
  while (x < w + 10) {
    const bw = (9 + r() * 20) * scale;
    const bh = (22 + r() * 54) * scale * (0.6 + 0.6 * Math.sin((x / w) * Math.PI));
    const top = base - bh;
    g.fillStyle = dark; g.fillRect(x, top, bw, bh);
    g.fillStyle = edge; g.fillRect(x, top, bw, 1); g.fillRect(x, top, 1, bh);

    const kind = r();
    if (kind < 0.42) {
      // A steep roof, and often a finial on its ridge.
      const rh = bh * (0.22 + r() * 0.3);
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(x - scale, top); g.lineTo(x + bw / 2, top - rh); g.lineTo(x + bw + scale, top); g.closePath(); g.fill();
      g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
      if (r() < 0.6) g.fillRect(x + bw / 2, top - rh - 4 * scale, Math.max(1, scale * 0.8), 4 * scale);
    } else if (kind < 0.62) {
      // A spire: the tall thin kind, with a cross bar near the top.
      const sh = bh * (0.5 + r() * 0.7), sw = bw * 0.42, sx = x + bw / 2 - sw / 2;
      g.fillStyle = dark; g.fillRect(sx, top - sh, sw, sh);
      g.fillStyle = edge; g.fillRect(sx, top - sh, sw, 1); g.fillRect(sx, top - sh, 1, sh);
      g.fillStyle = dark;
      g.beginPath(); g.moveTo(sx - scale, top - sh); g.lineTo(sx + sw / 2, top - sh - bh * 0.4); g.lineTo(sx + sw + scale, top - sh); g.closePath();
      g.fill(); g.strokeStyle = edge; g.stroke();
      g.fillStyle = edge; g.fillRect(sx - scale, top - sh - bh * 0.14, sw + 2 * scale, Math.max(1, scale * 0.6));
    } else if (kind < 0.78) {
      // A rose window over an arcade.
      g.fillStyle = lit;
      g.beginPath(); g.arc(x + bw / 2, top + bh * 0.26, Math.max(1.2, bw * 0.17), 0, 7); g.fill();
      g.fillStyle = dark;
      g.beginPath(); g.arc(x + bw / 2, top + bh * 0.26, Math.max(0.6, bw * 0.07), 0, 7); g.fill();
    }
    // Chimneys, in ones and twos, leaning where the roof is steep.
    for (let k = 0; k < (r() < 0.5 ? 2 : 1); k++) {
      if (r() > 0.55) continue;
      const cwd = Math.max(1, 2.4 * scale), cx = x + bw * (0.18 + r() * 0.6);
      const chh = (5 + r() * 7) * scale;
      g.fillStyle = dark; g.fillRect(cx, top - chh, cwd, chh);
      g.fillStyle = edge; g.fillRect(cx, top - chh, cwd, 1);
    }
    // Lancets, in rows, a few of them lit from inside.
    const rows = Math.max(1, Math.floor(bh / (9 * scale)));
    for (let row = 0; row < rows; row++) {
      const y = top + 7 * scale + row * 9 * scale;
      if (y > base - 3 * scale) break;
      for (let k = 0; k < 2; k++) {
        if (r() > 0.45) continue;
        g.fillStyle = r() < 0.3 ? lit : grey(0.2);
        g.fillRect(x + bw * (0.22 + k * 0.42), y, Math.max(1, bw * 0.13), Math.max(1, 3.4 * scale));
      }
    }
    x += bw + r() * 4 * scale;
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

// A church seen from the ward: nave, buttresses, a tower with a lit lancet,
// the spire above everything. Drawn as a silhouette against the sky.
export function church(g: CanvasRenderingContext2D, cx: number, base: number, scale: number, seed = 5): void {
  const r = rand(seed), s = scale;
  const dark = grey(0.02), edge = grey(0.72);
  const lit = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = dark; g.fillRect(x, y, w, h);
    g.fillStyle = edge; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
    g.fillStyle = dark;
  };
  g.fillStyle = dark;
  // Nave, with a pitched roof.
  const nw = 54 * s, nh = 40 * s, nx = cx - nw * 0.34;
  lit(nx, base - nh, nw, nh);
  g.beginPath(); g.moveTo(nx - 3 * s, base - nh); g.lineTo(nx + nw * 0.45, base - nh - 15 * s); g.lineTo(nx + nw + 3 * s, base - nh); g.closePath();
  g.fill(); g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
  // Tower and spire.
  const tw = 20 * s, th = 92 * s, tx = cx - nw * 0.34 - tw * 0.7;
  lit(tx, base - th, tw, th);
  g.beginPath(); g.moveTo(tx - 4 * s, base - th); g.lineTo(tx + tw / 2, base - th - 42 * s); g.lineTo(tx + tw + 4 * s, base - th); g.closePath();
  g.fillStyle = dark; g.fill(); g.strokeStyle = edge; g.stroke();
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

// What he is when he is not being a cat: a horizon seen at a slant, arms
// curling off it, and eyes open along its rim. Every point of the drawing is
// given a place here, so he can come apart into it and go back.
export function greatOne(count: number, seed = 9): { x: number; y: number; z: number; v: number }[] {
  const r = rand(seed), out = [];
  const EYES = 7;
  for (let i = 0; i < count; i++) {
    const pick = r();
    if (pick < 0.5) {
      // The rim itself: a narrow band, brightest of everything.
      const a = r() * Math.PI * 2;
      const rad = 0.43 + (r() - 0.5) * 0.045;
      out.push({ x: Math.cos(a) * rad, y: (r() - 0.5) * 0.035, z: Math.sin(a) * rad, v: 0.82 + r() * 0.18 });
    } else if (pick < 0.78) {
      // Arms: they leave the rim, curl, and come back down towards it.
      const arm = Math.floor(r() * 5), u = r();
      const a = (arm / 5) * Math.PI * 2 + u * 1.9;
      const rad = 0.43 + Math.sin(u * Math.PI) * 0.24;
      const rise = Math.sin(u * Math.PI * 0.9) * 0.3;
      out.push({ x: Math.cos(a) * rad, y: -rise + Math.sin(u * 11 + arm) * 0.018, z: Math.sin(a) * rad, v: 0.3 + (1 - u) * 0.4 });
    } else {
      // Eyes along the rim: a dark iris with a lit pupil in it.
      const eye = Math.floor(r() * EYES);
      const ea = (eye / EYES) * Math.PI * 2 + 0.4;
      const er = 0.43, lift = -0.06 - (eye % 3) * 0.05;
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.055;
      const open = rr < 0.016;
      out.push({
        x: Math.cos(ea) * er + Math.cos(a) * rr * 1.5,
        y: lift + Math.sin(a) * rr,
        z: Math.sin(ea) * er + Math.cos(a) * rr * 0.4,
        v: open ? 1 : 0.1,
      });
    }
  }
  return out;
}
