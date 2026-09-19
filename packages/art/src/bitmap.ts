// 1-bit bitmaps in GxEPD2's drawBitmap layout: rows top to bottom, each row
// padded to whole bytes, most significant bit first, 1 = ink.
export function packBits(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const stride = Math.ceil(width / 8);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Transparent counts as paper; otherwise luminance below half is ink.
      const lum = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114) / 1000;
      if (rgba[i + 3]! >= 128 && lum < 128) out[y * stride + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return out;
}

export function cArray(name: string, width: number, height: number, bits: Uint8Array): string {
  const rows: string[] = [];
  for (let i = 0; i < bits.length; i += 16) {
    rows.push('  ' + [...bits.slice(i, i + 16)].map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ') + ',');
  }
  return [
    `constexpr int ${name}_W = ${width};`,
    `constexpr int ${name}_H = ${height};`,
    `const uint8_t ${name}[] PROGMEM = {`,
    ...rows,
    '};',
  ].join('\n');
}
