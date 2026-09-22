// The pages test_looks drew (.pio/looks/<look>-<page>.pbm), as one PNG: a row
// per look, at 2x. Run the firmware tests first.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const dir = resolve(import.meta.dirname, '../packages/firmware/.pio/looks');
const out = process.argv[2] ?? resolve(dir, 'looks.png');
const files = readdirSync(dir).filter((f) => f.endsWith('.pbm')).sort();
const looks = [...new Set(files.map((f) => f.split('-')[0]))].sort((a, b) => a - b);
const pages = [...new Set(files.map((f) => f.slice(f.indexOf('-') + 1, -4)))].sort();

const S = 2, PAD = 12, CELL = 200 * S;
const W = PAD + pages.length * (CELL + PAD), H = PAD + looks.length * (CELL + PAD);
const img = Buffer.alloc(W * H * 3, 0xe8);
for (const [r, look] of looks.entries()) {
  for (const [c, page] of pages.entries()) {
    let pbm;
    try { pbm = readFileSync(resolve(dir, `${look}-${page}.pbm`)); } catch { continue; }
    const bits = pbm.subarray(pbm.length - 5000);
    const x0 = PAD + c * (CELL + PAD), y0 = PAD + r * (CELL + PAD);
    for (let y = 0; y < 200 * S; y++) for (let x = 0; x < 200 * S; x++) {
      const px = x / S | 0, py = y / S | 0;
      const ink = bits[py * 25 + (px >> 3)] & (0x80 >> (px & 7));
      img.fill(ink ? 0x1c : 0xfa, ((y0 + y) * W + x0 + x) * 3, ((y0 + y) * W + x0 + x) * 3 + 3);
    }
  }
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) img.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${looks.length} looks x ${pages.length} pages -> ${out}`);
