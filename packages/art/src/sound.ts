// The Vigil's sounds, synthesised: 16 kHz, 16-bit mono WAVs for the card
// (/sound/<name>.wav), played by the board's speaker. Nothing sweet: no bell
// that rings true.
//   open   a soft knock, as on a wooden door, and the room going quiet.
//   bell   between stages: a faint glassy tone beating against itself.
//   close  a low tone a little out of tune with itself swells out of
//          nothing, and is cut off by the knock.
// The speaker is small: nothing much below 150 Hz would be heard.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RATE = 16000;

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const tone = (f: number, t: number) => Math.sin(2 * Math.PI * f * t);

// A knock: a damped low thud with a short burst of noise on it.
function knock(out: Float32Array, at: number, gain: number, seed = 7) {
  let s = seed;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const start = Math.round(at * RATE);
  for (let i = 0; i < RATE * 0.35 && start + i < out.length; i++) {
    const t = i / RATE;
    const body = tone(180 - 60 * t, t) * Math.exp(-t * 18) + tone(310, t) * Math.exp(-t * 30) * 0.5;
    out[start + i]! += gain * (body + noise() * Math.exp(-t * 90) * 0.35);
  }
}

function open(): Float32Array {
  const out = new Float32Array(RATE * 1.2);
  knock(out, 0.02, 0.8);
  return out;
}

function bell(): Float32Array {
  const out = new Float32Array(RATE * 2.6);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.6);
    out[i] = 0.32 * env * (tone(1244, t) + 0.8 * tone(1251, t) + 0.35 * tone(1873, t) * Math.exp(-t * 2));
  }
  return out;
}

function close(): Float32Array {
  const swell = 3.4, len = swell + 1.4;
  const out = new Float32Array(Math.round(RATE * len));
  for (let i = 0; i < Math.round(RATE * swell); i++) {
    const t = i / RATE;
    const env = Math.pow(t / swell, 2.2);
    // A fifth that is not quite one, and the root beating against itself.
    const v = tone(196, t) + 0.9 * tone(199.3, t) + 0.45 * tone(292.1, t) + 0.25 * tone(523.7, t) * (0.5 + 0.5 * tone(0.7, t));
    out[i] = 0.26 * env * v;
  }
  knock(out, swell, 0.9, 13);
  return out;
}

export function writeSounds(dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const [name, make] of [['open', open], ['bell', bell], ['close', close]] as const) {
    writeFileSync(resolve(dir, `${name}.wav`), wav(make()));
  }
}
