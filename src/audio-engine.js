import { AUTO_LOAD_REMAINING, FREEZE_REMAINING, FADE_REMAINING, fadeDuration, equalPowerGains, remainingSeconds } from './timing.js';

function waitForPlayable(audio, timeoutMs = 8000) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('The track did not become ready in time.')), timeoutMs);
    function finish(error) {
      clearTimeout(timeout);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onError);
      error ? reject(error) : resolve();
    }
    const onReady = () => finish();
    const onError = () => finish(new Error('The audio file could not play.'));
    audio.addEventListener('canplay', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
  });
}

export class AudioEngine {
  constructor() {
    this.tracks = new Map();
    this.queue = [];
    this.listeners = new Set();
    this.state = 'ready';
    this.autoMix = true;
    this.protectCurrent = false;
    this.activeDeck = 0;
    this.currentId = null;
    this.preparedId = null;
    this.preparedBy = null;
    this.preparedState = 'empty';
    this.preStartNextId = null;
    this.frozen = false;
    this.transition = null;
    this.transitionPending = false;
    this.endAdvancePending = false;
    this.prepareToken = 0;
    this.playedCount = 0;
    this.volume = 0.7;
    this.notice = '';
    this.noticeIsError = false;
    this.context = null;
    this.masterGain = null;
    this.decks = [0, 1].map((index) => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('ended', () => void this.onDeckEnded(index));
      return { audio, trackId: null, gain: null, analyser: null, level: 0 };
    });
    this.clock = setInterval(() => this.pulse(), 100);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  say(message, isError = false) {
    this.notice = message;
    this.noticeIsError = isError;
    this.emit();
  }

  snapshot() {
    const active = this.decks[this.activeDeck];
    const current = this.tracks.get(this.currentId) || null;
    const duration = current?.duration || 0;
    const elapsed = current ? active.audio.currentTime : 0;
    const remaining = current ? remainingSeconds(duration, elapsed) : null;
    const next = this.tracks.get(this.queue[0]) || null;
    const deckInfo = this.decks.map((deck, index) => {
      let track = this.tracks.get(deck.trackId) || null;
      let status = 'empty';
      if (!this.currentId && (this.state === 'ready' || this.state === 'ended')) {
        track = this.tracks.get(this.queue[index]) || null;
        if (track) status = 'queued';
      } else if (index === this.activeDeck && current) {
        track = current;
        status = this.state === 'paused' ? 'paused' : 'on air';
      } else if (this.preparedId && deck.trackId === this.preparedId) {
        status = this.transition ? 'mixing' : this.preparedState;
      } else if (index !== this.activeDeck && next) {
        track = next;
        status = 'queued';
      }
      return { track, status, elapsed: deck.audio.currentTime, level: deck.level, isActive: index === this.activeDeck && !!current };
    });
    return {
      state: this.state, autoMix: this.autoMix, protectCurrent: this.protectCurrent,
      activeDeck: this.activeDeck, current, next, queue: this.queue.map((id) => this.tracks.get(id)).filter(Boolean),
      library: [...this.tracks.values()], decks: deckInfo, preparedId: this.preparedId,
      preparedState: this.preparedState, preparedBy: this.preparedBy,
      frozen: this.frozen, transitioning: !!this.transition,
      crossfader: this.transition ? Math.round((this.activeDeck === 0 ? this.transition.progress : 1 - this.transition.progress) * 100) : this.activeDeck * 100,
      elapsed, duration, remaining, playedCount: this.playedCount, volume: this.volume,
      notice: this.notice, noticeIsError: this.noticeIsError,
    };
  }

  addTrack(track) {
    this.tracks.set(track.id, { ...track, unavailable: false });
    this.queue.push(track.id);
    this.emit();
  }

  moveQueue(id, direction) {
    if (this.transition || this.frozen) return false;
    const index = this.queue.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.queue.length) return false;
    [this.queue[index], this.queue[target]] = [this.queue[target], this.queue[index]];
    if (this.preparedId && this.queue[0] !== this.preparedId) this.unloadNext();
    this.preStartNextId = null;
    this.emit();
    return true;
  }

  moveQueueTo(id, beforeId) {
    if (this.transition || this.frozen || id === beforeId) return false;
    const from = this.queue.indexOf(id);
    const target = this.queue.indexOf(beforeId);
    if (from < 0 || target < 0) return false;
    this.queue.splice(from, 1);
    this.queue.splice(this.queue.indexOf(beforeId), 0, id);
    if (this.preparedId && this.queue[0] !== this.preparedId) this.unloadNext();
    this.preStartNextId = null;
    this.emit();
    return true;
  }

  removeFromQueue(id) {
    if (this.transition || this.frozen) return false;
    const index = this.queue.indexOf(id);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    if (this.preparedId === id) this.unloadNext();
    if (this.preStartNextId === id) this.preStartNextId = null;
    this.emit();
    return true;
  }

  enqueue(id) {
    const track = this.tracks.get(id);
    if (!track || track.unavailable || id === this.currentId || this.queue.includes(id)) return false;
    this.queue.push(id);
    this.emit();
    return true;
  }

  removeTrack(id) {
    const track = this.tracks.get(id);
    if (!track || id === this.currentId || this.transition?.id === id) return false;
    this.queue = this.queue.filter((item) => item !== id);
    if (this.preparedId === id) this.unloadNext();
    if (this.preStartNextId === id) this.preStartNextId = null;
    this.tracks.delete(id);
    URL.revokeObjectURL(track.url);
    this.emit();
    return true;
  }

  selectForDeck(id, index) {
    const track = this.tracks.get(id);
    if (!track || track.unavailable || (this.currentId === id)) return false;
    if (this.state === 'ready' || this.state === 'ended') {
      const oldIndex = this.queue.indexOf(id);
      if (oldIndex >= 0) this.queue.splice(oldIndex, 1);
      const position = index === 0 ? 0 : Math.min(1, this.queue.length);
      this.queue.splice(position, 0, id);
      if (index === 1) this.preStartNextId = id;
      this.emit();
      return true;
    }
    if (index === this.activeDeck || this.transition || this.frozen) return false;
    void this.selectNext(id);
    return true;
  }

  async selectNext(id) {
    if (this.state === 'ready' || this.state === 'ended') return this.selectForDeck(id, 1);
    if (this.transition || this.frozen || id === this.currentId || !this.tracks.has(id)) return false;
    const index = this.queue.indexOf(id);
    if (index >= 0) this.queue.splice(index, 1);
    this.queue.unshift(id);
    this.emit();
    return this.prepareNext(id, 'manual');
  }

  createGraph() {
    if (this.context) return;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.context.destination);
    this.decks.forEach((deck, index) => {
      const source = this.context.createMediaElementSource(deck.audio);
      deck.gain = this.context.createGain();
      deck.gain.gain.value = index === this.activeDeck ? 1 : 0;
      deck.analyser = this.context.createAnalyser();
      deck.analyser.fftSize = 256;
      source.connect(deck.gain).connect(deck.analyser).connect(this.masterGain);
    });
  }

  loadDeck(index, track) {
    const deck = this.decks[index];
    if (deck.trackId === track.id) return deck;
    deck.audio.pause();
    deck.audio.src = track.url;
    deck.audio.load();
    deck.trackId = track.id;
    return deck;
  }

  clearDeck(index) {
    const deck = this.decks[index];
    deck.audio.pause();
    deck.audio.removeAttribute('src');
    deck.audio.load();
    deck.trackId = null;
    deck.level = 0;
    if (deck.gain) deck.gain.gain.value = 0;
  }

  unloadNext() {
    this.prepareToken += 1;
    this.clearDeck(1 - this.activeDeck);
    this.preparedId = null;
    this.preparedBy = null;
    this.preparedState = 'empty';
    this.emit();
  }

  async prepareNext(id, by = 'auto') {
    const track = this.tracks.get(id);
    if (!track || track.unavailable || this.transition || (this.frozen && this.preparedId !== id)) return false;
    if (this.preparedId === id && this.preparedState === 'ready') return true;
    const token = ++this.prepareToken;
    const index = 1 - this.activeDeck;
    this.preparedId = id;
    this.preparedBy = by;
    this.preparedState = 'loading';
    const deck = this.loadDeck(index, track);
    if (deck.gain) deck.gain.gain.value = 0;
    this.emit();
    try {
      await waitForPlayable(deck.audio);
      if (token !== this.prepareToken || this.preparedId !== id) return false;
      this.preparedState = 'ready';
      this.emit();
      return true;
    } catch {
      if (token !== this.prepareToken) return false;
      track.unavailable = true;
      this.queue = this.queue.filter((item) => item !== id);
      this.clearDeck(index);
      this.preparedId = null;
      this.preparedBy = null;
      this.preparedState = 'empty';
      this.frozen = false;
      this.say(`${track.title} could not be prepared. ${this.queue.length ? 'Trying the next track.' : 'Add more music.'}`, true);
      if (this.autoMix && this.currentId && this.queue.length) void this.prepareNext(this.queue[0], 'auto');
      return false;
    }
  }

  async start() {
    if (this.state !== 'ready' && this.state !== 'ended') return false;
    if (!this.queue.length) {
      this.say('Add a playable track to start.', true);
      return false;
    }
    try {
      this.createGraph();
      await this.context.resume();
      const id = this.queue[0];
      const deck = this.loadDeck(this.activeDeck, this.tracks.get(id));
      deck.gain.gain.value = 1;
      await deck.audio.play();
      this.currentId = this.queue.shift();
      this.playedCount += 1;
      this.protectCurrent = false;
      this.frozen = false;
      this.state = 'playing';
      this.say('AutoMix is ready. Your music stays on this device.');
      if (this.preStartNextId && this.queue.includes(this.preStartNextId)) {
        const next = this.preStartNextId;
        this.preStartNextId = null;
        void this.prepareNext(next, 'manual');
      }
      return true;
    } catch (error) {
      this.state = 'ready';
      this.say(`Playback could not start: ${error.message || 'check your audio output.'}`, true);
      return false;
    }
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'transitioning') return;
    this.pausedFrom = this.state;
    this.pausedAt = performance.now();
    this.decks[this.activeDeck].audio.pause();
    if (this.transition) this.decks[this.transition.incomingIndex].audio.pause();
    this.state = 'paused';
    this.emit();
  }

  async resume() {
    if (this.state !== 'paused') return;
    try {
      await this.context.resume();
      await this.decks[this.activeDeck].audio.play();
      if (this.transition) {
        await this.decks[this.transition.incomingIndex].audio.play();
        this.transition.startedAt += performance.now() - this.pausedAt;
      }
      this.state = this.pausedFrom;
      this.emit();
    } catch (error) {
      this.say(`Playback could not resume: ${error.message || 'try again.'}`, true);
    }
  }

  setAutoMix(enabled) {
    this.autoMix = Boolean(enabled);
    if (!this.autoMix) this.frozen = false;
    this.say(this.autoMix ? 'AutoMix is on.' : 'AutoMix is off. The current track will end unless you mix next.');
    this.pulse();
  }

  setProtected(enabled) {
    this.protectCurrent = Boolean(enabled);
    this.say(this.protectCurrent ? 'This song will play to its end.' : 'Automatic fades are on again.');
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
    this.emit();
  }

  async mixNext() {
    if (this.state !== 'playing' || !this.queue.length || this.transitionPending) return false;
    return this.beginTransition(true);
  }

  async skipNext() {
    if (this.state !== 'playing' || !this.queue.length || this.transitionPending) return false;
    return this.beginTransition(true, 0.35);
  }

  async beginTransition(manual = false, requestedDuration = null) {
    if (this.transition || this.transitionPending || this.state !== 'playing' || !this.queue.length) return false;
    this.transitionPending = true;
    const id = this.queue[0];
    try {
      if (this.preparedId !== id || this.preparedState !== 'ready') {
        const ready = await this.prepareNext(id, manual ? 'manual' : 'auto');
        if (!ready) return false;
      }
      if (this.state !== 'playing' || this.queue[0] !== id) return false;
      const incomingIndex = 1 - this.activeDeck;
      const incoming = this.decks[incomingIndex];
      incoming.audio.currentTime = 0;
      incoming.gain.gain.value = 0;
      await incoming.audio.play();
      if (this.state !== 'playing' || this.queue[0] !== id) {
        incoming.audio.pause();
        return false;
      }
      const outgoing = this.decks[this.activeDeck].audio;
      const remaining = Math.max(.25, outgoing.duration - outgoing.currentTime);
      const duration = requestedDuration === null ? fadeDuration(remaining, incoming.audio.duration || this.tracks.get(id).duration) : Math.max(.25, Math.min(requestedDuration, remaining));
      this.transition = { incomingIndex, id, duration, startedAt: performance.now(), progress: 0, fromProgress: 0, manualControl: false };
      this.frozen = true;
      this.state = 'transitioning';
      this.say(`${manual ? 'Mixing now' : 'Automatic mix'}: ${this.tracks.get(id).title}.`);
      return true;
    } catch {
      const failed = this.tracks.get(id);
      failed.unavailable = true;
      this.queue = this.queue.filter((item) => item !== id);
      this.unloadNext();
      this.frozen = false;
      this.say(`${failed.title} could not play. ${this.queue.length ? 'Trying the next track.' : 'Add more music.'}`, true);
      return false;
    } finally {
      this.transitionPending = false;
    }
  }

  setCrossfader(value) {
    if (this.state !== 'transitioning' || !this.transition) return;
    this.transition.manualControl = true;
    const position = Math.max(0, Math.min(1, value / 100));
    this.transition.progress = this.activeDeck === 0 ? position : 1 - position;
    this.applyFade(this.transition.progress);
    if (this.transition.progress >= 1) this.finishTransition();
    else this.emit();
  }

  releaseCrossfader() {
    if (this.state !== 'transitioning' || !this.transition || !this.transition.manualControl) return;
    const outgoing = this.decks[this.activeDeck].audio;
    this.transition.manualControl = false;
    this.transition.fromProgress = this.transition.progress;
    this.transition.startedAt = performance.now();
    this.transition.duration = Math.max(.25, Math.min(FADE_REMAINING, outgoing.duration - outgoing.currentTime));
  }

  applyFade(progress) {
    const [outgoingGain, incomingGain] = equalPowerGains(progress);
    this.decks[this.activeDeck].gain.gain.value = outgoingGain;
    this.decks[this.transition.incomingIndex].gain.gain.value = incomingGain;
  }

  updateFade() {
    if (!this.transition || this.state !== 'transitioning') return;
    const fade = this.transition;
    if (!fade.manualControl) {
      const fraction = Math.min(1, (performance.now() - fade.startedAt) / (fade.duration * 1000));
      fade.progress = fade.fromProgress + (1 - fade.fromProgress) * fraction;
      this.applyFade(fade.progress);
    }
    if (fade.progress >= 1 || this.decks[this.activeDeck].audio.ended) this.finishTransition();
  }

  finishTransition() {
    if (!this.transition) return;
    const outgoing = this.activeDeck;
    this.activeDeck = this.transition.incomingIndex;
    this.currentId = this.transition.id;
    this.queue = this.queue.filter((id, index) => !(index === 0 && id === this.currentId));
    this.playedCount += 1;
    this.transition = null;
    this.preparedId = null;
    this.preparedBy = null;
    this.preparedState = 'empty';
    this.protectCurrent = false;
    this.frozen = false;
    this.clearDeck(outgoing);
    this.decks[this.activeDeck].gain.gain.value = 1;
    this.state = 'playing';
    this.emit();
  }

  async onDeckEnded(index) {
    if (this.transition && index === this.transition.incomingIndex) {
      this.finishTransition();
      void this.onDeckEnded(this.activeDeck);
      return;
    }
    if (index !== this.activeDeck || this.state === 'paused' || !this.currentId) return;
    if (this.transition) {
      this.finishTransition();
      return;
    }
    if (this.endAdvancePending) return;
    this.endAdvancePending = true;
    try {
      if (!this.autoMix) {
        this.endSet('AutoMix is off. Press Start to play the next queued track.');
        return;
      }
      while (this.queue.length) {
        const id = this.queue[0];
        const ready = this.preparedId === id && this.preparedState === 'ready' ? true : await this.prepareNext(id, 'auto');
        if (!ready) continue;
        const incomingIndex = 1 - this.activeDeck;
        const incoming = this.decks[incomingIndex];
        try {
          incoming.audio.currentTime = 0;
          incoming.gain.gain.value = 1;
          await incoming.audio.play();
          this.clearDeck(this.activeDeck);
          this.activeDeck = incomingIndex;
          this.currentId = this.queue.shift();
          this.playedCount += 1;
          this.preparedId = null;
          this.preparedState = 'empty';
          this.preparedBy = null;
          this.frozen = false;
          this.protectCurrent = false;
          this.state = 'playing';
          this.emit();
          return;
        } catch {
          const failed = this.tracks.get(id);
          failed.unavailable = true;
          this.queue.shift();
          this.unloadNext();
          this.say(`${failed.title} could not play. Trying the next track.`, true);
        }
      }
      this.endSet('The set finished. Add more music to keep going.');
    } finally {
      this.endAdvancePending = false;
    }
  }

  endSet(message) {
    this.decks.forEach((_, index) => this.clearDeck(index));
    this.activeDeck = 0;
    this.currentId = null;
    this.preparedId = null;
    this.preparedBy = null;
    this.preparedState = 'empty';
    this.prepareToken += 1;
    this.frozen = false;
    this.state = 'ended';
    this.say(message);
  }

  updateMeters() {
    for (const deck of this.decks) {
      if (!deck.analyser || deck.audio.paused) { deck.level = 0; continue; }
      const samples = new Uint8Array(deck.analyser.fftSize);
      deck.analyser.getByteTimeDomainData(samples);
      let power = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        power += value * value;
      }
      deck.level = Math.min(1, Math.sqrt(power / samples.length) * 3.5);
    }
  }

  pulse() {
    this.updateMeters();
    if (this.currentId && this.state === 'playing' && !this.endAdvancePending) {
      const active = this.decks[this.activeDeck].audio;
      const remaining = remainingSeconds(active.duration || this.tracks.get(this.currentId).duration, active.currentTime);
      if (this.autoMix && remaining !== null && remaining > 0) {
        if (this.queue.length && remaining <= AUTO_LOAD_REMAINING && this.preparedState === 'empty' && !this.transitionPending) {
          void this.prepareNext(this.queue[0], 'auto');
        }
        if (this.preparedState === 'ready' && remaining <= FREEZE_REMAINING) this.frozen = true;
        if (!this.protectCurrent && this.preparedState === 'ready' && remaining <= FADE_REMAINING && !this.transitionPending) {
          void this.beginTransition(false);
        }
      }
    }
    this.updateFade();
    this.emit();
  }

  dispose() {
    clearInterval(this.clock);
    this.decks.forEach((_, index) => this.clearDeck(index));
    for (const track of this.tracks.values()) URL.revokeObjectURL(track.url);
    if (this.context) void this.context.close();
  }
}
