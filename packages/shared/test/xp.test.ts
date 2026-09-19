import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionXp, levelForXp, xpForLevel, formState } from '../src/index.ts';

test('sessionXp pays one XP per device minute below 45 minutes', () => {
  assert.equal(sessionXp(30, 'device', false), 30);
});

test('sessionXp rewards density at 45 and above 90 minutes', () => {
  assert.equal(sessionXp(44, 'device', false), 44);
  assert.equal(sessionXp(45, 'device', false), 56);
  assert.equal(sessionXp(90, 'device', false), 112);
  assert.equal(sessionXp(91, 'device', false), 136);
});

test('sessionXp halves manual backfill', () => {
  assert.equal(sessionXp(60, 'manual', false), 37);
});

test('sessionXp pays nothing for an unconfirmed session over 6 hours', () => {
  assert.equal(sessionXp(361, 'device', false), 0);
  assert.equal(sessionXp(361, 'device', true), 541);
  assert.equal(sessionXp(360, 'device', false), 540);
});

test('levelForXp follows 30 * L^2', () => {
  assert.equal(levelForXp(0), 0);
  assert.equal(levelForXp(29), 0);
  assert.equal(levelForXp(30), 1);
  assert.equal(levelForXp(119), 1);
  assert.equal(levelForXp(120), 2);
  assert.equal(xpForLevel(3), 270);
});

test('formState decays by hours since the last session', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');
  assert.equal(formState('2026-09-20T00:00:00.000Z', now), 'stable');
  assert.equal(formState('2026-09-19T12:00:00.000Z', now), 'thinning');
  assert.equal(formState('2026-09-18T12:00:00.000Z', now), 'fragmenting');
  assert.equal(formState('2026-09-17T12:00:00.000Z', now), 'dormant');
  assert.equal(formState(null, now), 'dormant');
});

import { formFromSessions } from '../src/index.ts';

const at = (h: number) => new Date(Date.UTC(2026, 8, 1) + h * 3_600_000).toISOString();
const session = (startH: number, minutes: number, activityId = 1, source: 'device' | 'manual' = 'device') =>
  ({ startedAt: at(startH), endedAt: at(startH + minutes / 60), activityId, source });

test('formFromSessions decays by the last session when he never died', () => {
  assert.equal(formFromSessions([session(0, 60)], 99, new Date(at(10))), 'stable');
  assert.equal(formFromSessions([session(0, 60)], 99, new Date(at(30))), 'thinning');
  assert.equal(formFromSessions([], 99, new Date(at(0))), 'dormant');
});

test('after 72 hours away an ordinary session does not wake him', () => {
  const sessions = [session(0, 60), session(100, 30)];
  assert.equal(formFromSessions(sessions, 99, new Date(at(101))), 'dormant');
});

test('the ritual wakes him, but only a full hour of it', () => {
  assert.equal(formFromSessions([session(0, 60), session(100, 59, 99)], 99, new Date(at(102))), 'dormant');
  assert.equal(formFromSessions([session(0, 60), session(100, 60, 99)], 99, new Date(at(102))), 'stable');
});

test('an honest backfill wakes him too', () => {
  assert.equal(formFromSessions([session(0, 60), session(90, 45, 1, 'manual')], 99, new Date(at(100))), 'stable');
});
