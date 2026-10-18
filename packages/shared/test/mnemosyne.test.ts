import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recallOf } from '../src/index.ts';

test('recall is whole at the review, 90% at its stability, and keeps falling', () => {
  assert.equal(recallOf(0, 4), 1);
  assert.ok(Math.abs(recallOf(4, 4) - 0.9) < 1e-9);
  assert.ok(recallOf(8, 4) < recallOf(4, 4));
  assert.equal(recallOf(3, 0), 0);
});
