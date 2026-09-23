// Bakes TTF fonts into Adafruit GFX fonts (1-bit glyphs, ASCII 0x20-0x7E) for
// the device's looks: packages/firmware/include/fonts/<name>.h.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../firmware/include/fonts');

// name: the C identifier; px: the em size in pixels; ink: the grey level that
// still counts as ink, higher thickens hairline serifs.
export const FONTS: { name: string; file: string; px: number; ink?: number }[] = [
  { name: 'Fraktur14', file: 'UnifrakturMaguntia-Book.ttf', px: 14 },
  { name: 'Fraktur20', file: 'UnifrakturMaguntia-Book.ttf', px: 20 },
  { name: 'Pirata13', file: 'PirataOne-Regular.ttf', px: 13 },
  { name: 'Pirata18', file: 'PirataOne-Regular.ttf', px: 18 },
  { name: 'Pirata24', file: 'PirataOne-Regular.ttf', px: 24 },
  { name: 'Cinzel11', file: 'Cinzel.ttf', px: 11, ink: 235 },
  { name: 'Cinzel14', file: 'Cinzel.ttf', px: 14, ink: 225 },
  { name: 'Fell13', file: 'IMFellEnglish.ttf', px: 13 },
  { name: 'Grenze13', file: 'GrenzeGotisch.ttf', px: 13 },
  { name: 'Grenze18', file: 'GrenzeGotisch.ttf', px: 18 },
  // The console's own two: the pixel face its labels are set in, and the
  // technical face its numbers are. Same fonts the dashboard uses.
  { name: 'Silk8', file: 'Silkscreen.ttf', px: 8 },
  { name: 'Silk11', file: 'Silkscreen.ttf', px: 11 },
  { name: 'Tek12', file: 'Tektur.ttf', px: 12, ink: 200 },
  { name: 'Tek16', file: 'Tektur.ttf', px: 16, ink: 200 },
  { name: 'Tek24', file: 'Tektur.ttf', px: 24, ink: 200 },
];

export function bakeFont(file: string, px: number, name: string, inkLevel = 128): string {
  const buf = readFileSync(resolve(here, '../fonts', file));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const scale = px / font.unitsPerEm;
  const bits: number[] = [];
  const glyphs: string[] = [];
  let acc = 0, n = 0;
  const push = (on: boolean) => { acc = (acc << 1) | (on ? 1 : 0); if (++n === 8) { bits.push(acc); acc = n = 0; } };
  const box = px * 3, ox = px, base = px * 2;
  for (let code = 0x20; code <= 0x7e; code++) {
    const ch = String.fromCharCode(code);
    const g = font.charToGlyph(ch);
    const adv = Math.round((g.advanceWidth ?? 0) * scale);
    const d = g.getPath(ox, base, px).toPathData(2);
    let x0 = box, y0 = box, x1 = -1, y1 = -1;
    let ink: (x: number, y: number) => boolean = () => false;
    if (d) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
      const img = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
      ink = (x, y) => img.pixels[(y * box + x) * 4]! < inkLevel;
      for (let y = 0; y < box; y++) for (let x = 0; x < box; x++) if (ink(x, y)) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const offset = bits.length;
    if (x1 < 0) { glyphs.push(`  {${offset}, 0, 0, ${adv}, 0, 0}`); continue; }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) push(ink(x, y));
    if (n) { while (n) push(false); }
    glyphs.push(`  {${offset}, ${x1 - x0 + 1}, ${y1 - y0 + 1}, ${adv}, ${x0 - ox}, ${y0 - base}}`);
  }
  const yAdv = Math.round((font.ascender - font.descender) * scale);
  const rows: string[] = [];
  for (let i = 0; i < bits.length; i += 16) rows.push('  ' + bits.slice(i, i + 16).map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ') + ',');
  return [
    `// ${file} at ${px} px, baked by packages/art/src/fonts.ts. SIL Open Font License.`,
    '#pragma once',
    '#include <Adafruit_GFX.h>',
    '',
    `const uint8_t ${name}Bitmaps[] PROGMEM = {`, ...rows, '};',
    '',
    `const GFXglyph ${name}Glyphs[] PROGMEM = {`, glyphs.join(',\n'), '};',
    '',
    `const GFXfont ${name} PROGMEM = {(uint8_t *)${name}Bitmaps, (GFXglyph *)${name}Glyphs, 0x20, 0x7E, ${yAdv}};`,
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('fonts.ts')) {
  mkdirSync(OUT, { recursive: true });
  for (const f of FONTS) writeFileSync(resolve(OUT, `${f.name}.h`), bakeFont(f.file, f.px, f.name, f.ink));
  console.log(`${FONTS.length} fonts -> ${OUT}`);
}
