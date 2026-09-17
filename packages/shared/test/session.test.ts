import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionMinutes, isRunaway, syncRequestSchema } from '../src/index.ts';

test('sessionMinutes returns whole minutes between two instants', () => {
  assert.equal(
    sessionMinutes('2026-09-17T10:00:00.000Z', '2026-09-17T11:47:00.000Z'),
    107,
  );
});

test('sessionMinutes floors partial minutes', () => {
  assert.equal(
    sessionMinutes('2026-09-17T10:00:00.000Z', '2026-09-17T10:00:59.000Z'),
    0,
  );
});

test('sessionMinutes returns 0 when end precedes start', () => {
  assert.equal(
    sessionMinutes('2026-09-17T11:00:00.000Z', '2026-09-17T10:00:00.000Z'),
    0,
  );
});

test('isRunaway is true above six hours only', () => {
  assert.equal(isRunaway(360), false);
  assert.equal(isRunaway(361), true);
});

test('syncRequestSchema rejects a malformed uuid', () => {
  const result = syncRequestSchema.safeParse({
    deviceId: 'aura-1',
    configVersion: 1,
    events: [{
      uuid: 'not-a-uuid',
      activityId: 1,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:00:00.000Z',
      clockSynced: true,
    }],
  });
  assert.equal(result.success, false);
});

test('syncRequestSchema accepts a well formed batch', () => {
  const result = syncRequestSchema.safeParse({
    deviceId: 'aura-1',
    configVersion: 0,
    events: [{
      uuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
      activityId: 3,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:00:00.000Z',
      clockSynced: true,
    }],
  });
  assert.equal(result.success, true);
});
