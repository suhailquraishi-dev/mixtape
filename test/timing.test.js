import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_LOAD_REMAINING, FADE_REMAINING, FREEZE_REMAINING, equalPowerGains, fadeDuration, remainingSeconds, secondsUntilAutoLoad } from '../src/timing.js';

test('the load countdown reaches zero at the 15-second preparation point', () => {
  assert.equal(AUTO_LOAD_REMAINING, 15);
  assert.equal(FREEZE_REMAINING, 10);
  assert.equal(FADE_REMAINING, 5);
  assert.equal(secondsUntilAutoLoad(36, 12), 9);
  assert.equal(secondsUntilAutoLoad(36, 21), 0);
  assert.equal(remainingSeconds(36, 31), 5);
  assert.equal(remainingSeconds(0, 0), null);
});

test('the overlap stays within the outgoing and incoming track lengths', () => {
  assert.equal(fadeDuration(8, 40), 5);
  assert.equal(fadeDuration(2, 40), 2);
  assert.equal(fadeDuration(5, 4), 2);
});

test('equal-power gains keep the midpoint balanced', () => {
  const [a, b] = equalPowerGains(0.5);
  assert.ok(Math.abs(a * a + b * b - 1) < 1e-12);
  assert.deepEqual(equalPowerGains(0), [1, 0]);
  assert.ok(Math.abs(equalPowerGains(1)[1] - 1) < 1e-12);
});
