import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packBits, cArray } from '../src/bitmap.ts';

const px = (...lums: number[]) => new Uint8Array(lums.flatMap((l) => [l, l, l, 255]));

test('packBits sets a 1 for ink, most significant bit first', () => {
  const bits = packBits(px(0, 255, 255, 255, 255, 255, 255, 0), 8, 1);
  assert.deepEqual([...bits], [0b10000001]);
});

test('packBits pads each row to whole bytes', () => {
  const bits = packBits(px(0, 255, 255, 0, 0, 255, 255, 255, 255, 0), 5, 2);
  assert.deepEqual([...bits], [0b10011000, 0b00001000]);
});

test('packBits treats transparent pixels as paper', () => {
  const bits = packBits(new Uint8Array([0, 0, 0, 0]), 1, 1);
  assert.deepEqual([...bits], [0]);
});

test('cArray emits dimensions and bytes', () => {
  const text = cArray('FACE', 8, 1, new Uint8Array([0xa5]));
  assert.match(text, /constexpr int FACE_W = 8;/);
  assert.match(text, /0xa5,/);
});
