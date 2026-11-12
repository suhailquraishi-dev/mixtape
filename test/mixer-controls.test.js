import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio-engine.js';

test('mixer commands update the shared audio graph and manual crossfader', () => {
  const originalAudio = globalThis.Audio;
  const originalContext = globalThis.AudioContext;
  class Node {
    gain = { value: 0, setTargetAtTime(value) { this.value = value; } };
    frequency = { value: 0, setTargetAtTime(value) { this.value = value; } };
    Q = { value: 0 };
    connect(next) { return next; }
  }
  globalThis.Audio = class { paused = true; currentTime = 0; addEventListener() {} pause() {} removeAttribute() {} load() {} };
  globalThis.AudioContext = class {
    currentTime = 0;
    destination = new Node();
    createGain() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createMediaElementSource() { return new Node(); }
    createAnalyser() { return new Node(); }
    close() {}
  };
  const engine = new AudioEngine();
  try {
    engine.createGraph();
    engine.setChannelGain(0, .42);
    engine.setEq(1, 'low', -8);
    engine.setFilter(0, .5);
    engine.setAutoMix(false);
    engine.setCrossfader(35);
    const snapshot = engine.snapshot();
    assert.equal(engine.decks[0].channelGain.gain.value, .42);
    assert.equal(engine.decks[1].filters.low.gain.value, -8);
    assert.ok(engine.decks[0].filters.filter.frequency.value < 20000);
    assert.equal(snapshot.crossfader, 35);
    assert.ok(engine.decks[0].gain.gain.value > 0 && engine.decks[1].gain.gain.value > 0);
  } finally {
    engine.dispose();
    globalThis.Audio = originalAudio;
    globalThis.AudioContext = originalContext;
  }
});
