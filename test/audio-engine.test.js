import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio-engine.js';

test('queue edits keep the selected next song and reverse fader position coherent', () => {
  const originalAudio = globalThis.Audio;
  globalThis.Audio = class { addEventListener() {} pause() {} removeAttribute() {} load() {} currentTime = 0; };
  const engine = new AudioEngine();
  try {
    for (const id of ['a', 'b', 'c']) engine.addTrack({ id, title: id, duration: 30, url: `blob:${id}` });
    assert.deepEqual(engine.queue, ['a', 'b', 'c']);
    assert.equal(engine.moveQueueTo('c', 'a'), true);
    assert.deepEqual(engine.queue, ['c', 'a', 'b']);
    assert.equal(engine.moveQueue('b', -1), true);
    assert.deepEqual(engine.queue, ['c', 'b', 'a']);
    engine.currentId = 'b';
    assert.equal(engine.removeTrack('b'), false);
    engine.activeDeck = 1;
    engine.transition = { progress: .25, incomingIndex: 0, id: 'c' };
    assert.equal(engine.snapshot().crossfader, 75);
  } finally {
    clearInterval(engine.clock);
    globalThis.Audio = originalAudio;
  }
});
