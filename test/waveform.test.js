import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPeaks } from '../src/waveform.js';

test('waveform peaks come from the decoded audio channels', () => {
  const channels = [new Float32Array([0, .2, 0, .8, 0, .4, 0, .1]), new Float32Array([0, .6, 0, .1, 0, .3, 0, .9])];
  const buffer = { length: 8, numberOfChannels: 2, getChannelData: (index) => channels[index] };
  const peaks = extractPeaks(buffer, 4);
  assert.deepEqual([...peaks].map((value) => Number(value.toFixed(1))), [.6, .8, .4, .9]);
});
