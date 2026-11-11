const $ = (selector) => document.querySelector(selector);

const ui = {
  demoButton: $('#demo-button'), fileInput: $('#file-input'), sourceMessage: $('#source-message'),
  startButton: $('#start-button'), nextButton: $('#next-button'), protectButton: $('#protect-button'),
  volume: $('#volume'), volumeValue: $('#volume-value'), status: $('#player-status'),
  artwork: $('#artwork'), title: $('#player-title'), artist: $('#player-artist'),
  progress: $('#progress-fill'), elapsed: $('#elapsed'), duration: $('#duration'),
  queue: $('#queue-list'), queueCount: $('#queue-count'), queueDuration: $('#queue-duration'),
  notice: $('#notice'), mixNote: $('#mix-note'), playerIndex: $('.player-index'),
};

const palettes = ['lavender', 'lime', 'peach', 'blue'];
const tracks = new Map();
const queue = [];
let current = null;
let state = 'ready';
let pausedFrom = 'playing';
let protectedCurrent = false;
let transition = null;
let transitionPending = false;
let audioContext = null;
let masterGain = null;
let decks = null;
let activeDeck = 0;
let loadedCount = 0;
let playedCount = 0;
const FADE_SECONDS = 5;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function announce(message, isError = false) {
  ui.notice.textContent = message;
  ui.notice.style.color = isError ? '#ffb3a9' : '#c9f26e';
}

function setState(next) {
  state = next;
  render();
}

function createAudioEngine() {
  if (audioContext) return;
  audioContext = new AudioContext();
  masterGain = audioContext.createGain();
  masterGain.gain.value = Number(ui.volume.value) / 100;
  masterGain.connect(audioContext.destination);
  decks = [0, 1].map((index) => {
    const audio = new Audio();
    audio.preload = 'auto';
    const source = audioContext.createMediaElementSource(audio);
    const gain = audioContext.createGain();
    gain.gain.value = index === 0 ? 1 : 0;
    source.connect(gain).connect(masterGain);
    const deck = { audio, gain, trackId: null };
    audio.addEventListener('ended', () => onDeckEnded(index));
    return deck;
  });
}

function loadDeck(index, track) {
  const deck = decks[index];
  if (deck.trackId === track.id) return deck;
  deck.audio.pause();
  deck.audio.src = track.url;
  deck.audio.load();
  deck.trackId = track.id;
  return deck;
}

function clearDeck(index) {
  const deck = decks[index];
  deck.audio.pause();
  deck.audio.removeAttribute('src');
  deck.audio.load();
  deck.trackId = null;
  deck.gain.gain.value = 0;
}

async function startParty() {
  if (queue.length < 2) {
    announce('Add at least two playable tracks before starting.', true);
    return;
  }
  try {
    createAudioEngine();
    await audioContext.resume();
    const first = tracks.get(queue[0]);
    const deck = loadDeck(activeDeck, first);
    deck.gain.gain.value = 1;
    await deck.audio.play();
    current = queue.shift();
    playedCount += 1;
    protectedCurrent = false;
    announce('Party started. The next track will mix in automatically.');
    setState('playing');
  } catch (error) {
    announce(`Could not start playback: ${error.message || 'check your audio output and try again.'}`, true);
    setState('ready');
  }
}

async function pauseParty() {
  if (state !== 'playing' && state !== 'transitioning') return;
  pausedFrom = state;
  if (transition) transition.elapsed = performance.now() - transition.startedAt;
  decks[activeDeck].audio.pause();
  if (transition) decks[1 - activeDeck].audio.pause();
  setState('paused');
}

async function resumeParty() {
  if (state !== 'paused') return;
  try {
    await audioContext.resume();
    await decks[activeDeck].audio.play();
    if (transition) {
      await decks[1 - activeDeck].audio.play();
      transition.startedAt = performance.now() - transition.elapsed;
    }
    setState(pausedFrom);
  } catch (error) {
    announce(`Playback could not resume: ${error.message || 'try again.'}`, true);
  }
}

async function beginTransition(manual = false) {
  if (transitionPending || state !== 'playing' || queue.length === 0) return;
  transitionPending = true;
  const nextId = queue[0];
  const nextTrack = tracks.get(nextId);
  const incomingIndex = 1 - activeDeck;
  try {
    const incoming = loadDeck(incomingIndex, nextTrack);
    incoming.audio.currentTime = 0;
    incoming.gain.gain.value = 0;
    await incoming.audio.play();
    if (state !== 'playing' || queue[0] !== nextId) {
      incoming.audio.pause();
      return;
    }
    const outgoing = decks[activeDeck].audio;
    const outgoingRemaining = Number.isFinite(outgoing.duration) ? outgoing.duration - outgoing.currentTime : FADE_SECONDS;
    const incomingDuration = Number.isFinite(incoming.audio.duration) ? incoming.audio.duration : nextTrack.duration;
    const duration = Math.max(.25, Math.min(FADE_SECONDS, outgoingRemaining, incomingDuration / 2));
    transition = { incomingIndex, nextId, duration, startedAt: performance.now(), elapsed: 0 };
    announce(manual ? `Mixing into ${nextTrack.title}.` : `Automatic mix into ${nextTrack.title}.`);
    setState('transitioning');
  } catch (error) {
    clearDeck(incomingIndex);
    queue.shift();
    announce(`Skipped ${nextTrack.title}: this file could not play. ${queue.length ? 'Trying the next track.' : 'No more tracks are queued.'}`, true);
    render();
    if (decks[activeDeck].audio.ended) await playAfterEnd();
  } finally {
    transitionPending = false;
  }
}

function updateFade() {
  if (!transition || state !== 'transitioning') return;
  const progress = Math.min(1, (performance.now() - transition.startedAt) / (transition.duration * 1000));
  decks[activeDeck].gain.gain.value = Math.cos(progress * Math.PI / 2);
  decks[transition.incomingIndex].gain.gain.value = Math.sin(progress * Math.PI / 2);
  if (progress >= 1 || decks[activeDeck].audio.ended) finishTransition();
}

function finishTransition() {
  if (!transition) return;
  const outgoingIndex = activeDeck;
  activeDeck = transition.incomingIndex;
  current = transition.nextId;
  queue.shift();
  playedCount += 1;
  transition = null;
  protectedCurrent = false;
  clearDeck(outgoingIndex);
  decks[activeDeck].gain.gain.value = 1;
  setState('playing');
}

async function playAfterEnd() {
  if (!current || state === 'paused' || state === 'ended') return;
  if (transition) {
    finishTransition();
    return;
  }
  if (queue.length === 0) {
    current = null;
    protectedCurrent = false;
    setState('ended');
    announce('The queue finished. Add more music to start another set.');
    return;
  }
  const nextId = queue[0];
  try {
    const deck = loadDeck(activeDeck, tracks.get(nextId));
    deck.gain.gain.value = 1;
    await deck.audio.play();
    current = queue.shift();
    playedCount += 1;
    protectedCurrent = false;
    setState('playing');
  } catch (error) {
    queue.shift();
    announce(`Skipped ${tracks.get(nextId).title}: this file could not play.`, true);
    await playAfterEnd();
  }
}

function onDeckEnded(index) {
  if (index === activeDeck && state !== 'paused') void playAfterEnd();
  if (transition && index === transition.incomingIndex) {
    finishTransition();
    void playAfterEnd();
  }
}

function tick() {
  if (decks && current) {
    const audio = decks[activeDeck].audio;
    ui.elapsed.textContent = formatTime(audio.currentTime);
    ui.duration.textContent = formatTime(audio.duration || tracks.get(current)?.duration);
    ui.progress.style.width = `${audio.duration ? Math.min(100, audio.currentTime / audio.duration * 100) : 0}%`;
    if (state === 'playing' && !protectedCurrent && !transitionPending && queue.length && Number.isFinite(audio.duration)) {
      const remaining = audio.duration - audio.currentTime;
      if (remaining <= FADE_SECONDS && remaining > 0) void beginTransition();
    }
    updateFade();
  }
  requestAnimationFrame(tick);
}

function render() {
  const track = tracks.get(current) || (queue.length ? tracks.get(queue[0]) : null);
  ui.title.textContent = tracks.get(current)?.title || (track ? 'Ready when you are' : 'Your music goes here');
  ui.artist.textContent = tracks.get(current)?.artist || (track ? `${queue.length} tracks loaded · Press Start party` : 'Add tracks to get started');
  ui.artwork.className = `artwork ${track ? '' : 'artwork-empty'}`;
  if (track) ui.artwork.dataset.palette = track.palette;
  else delete ui.artwork.dataset.palette;
  const labels = { ready: 'READY TO START', playing: 'AUTO MIX ON', transitioning: 'MIXING NEXT', paused: 'PAUSED', ended: 'SET FINISHED' };
  ui.status.innerHTML = `<span class="status-light"></span> ${labels[state]}`;
  ui.status.classList.toggle('is-active', state === 'playing' || state === 'transitioning');
  ui.playerIndex.textContent = current ? `TRACK / ${String(playedCount).padStart(2, '0')}` : 'A / 01';
  ui.startButton.disabled = (state === 'ready' || state === 'ended') && queue.length < 2;
  ui.startButton.textContent = state === 'playing' || state === 'transitioning' ? '❚❚' : '▶';
  ui.startButton.setAttribute('aria-label', state === 'playing' || state === 'transitioning' ? 'Pause party' : state === 'paused' ? 'Resume party' : 'Start party');
  ui.nextButton.disabled = state !== 'playing' || queue.length === 0 || transitionPending;
  ui.protectButton.disabled = !(state === 'playing' || state === 'paused');
  ui.protectButton.setAttribute('aria-pressed', String(protectedCurrent));
  ui.protectButton.title = protectedCurrent ? 'Allow automatic transition' : 'Let this song finish';
  ui.protectButton.setAttribute('aria-label', ui.protectButton.title);
  ui.mixNote.textContent = protectedCurrent ? 'Current song will play to its end' : 'Transitions: up to 5-second equal-power fade';
  ui.sourceMessage.textContent = loadedCount === 0 ? 'Add at least two playable tracks to begin.' : `${loadedCount} playable track${loadedCount === 1 ? '' : 's'} loaded${loadedCount < 2 ? ' · add one more to start' : ' · ready to play'}.`;
  renderQueue();
}

function renderQueue() {
  ui.queue.replaceChildren();
  ui.queueCount.textContent = String(queue.length);
  const seconds = queue.reduce((sum, id) => sum + (tracks.get(id)?.duration || 0), 0);
  ui.queueDuration.textContent = `${Math.ceil(seconds / 60)} min queued`;
  if (queue.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'queue-empty';
    empty.textContent = current ? 'Nothing else queued. Add more music to keep going.' : 'Your next songs will appear here.';
    ui.queue.append(empty);
    return;
  }
  queue.forEach((id, index) => {
    const track = tracks.get(id);
    const row = document.createElement('li');
    row.className = `queue-item ${index === 0 && current ? 'next-up' : ''}`;
    const art = document.createElement('span');
    art.className = `queue-art ${track.palette}`;
    art.setAttribute('aria-hidden', 'true');
    art.textContent = '✳';
    const detail = document.createElement('div');
    detail.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'queue-name';
    name.textContent = track.title;
    const meta = document.createElement('div');
    meta.className = 'queue-meta';
    meta.textContent = `${index === 0 && current ? 'UP NEXT · ' : ''}${track.artist} · ${formatTime(track.duration)}`;
    detail.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    const up = makeQueueButton('↑', `Move ${track.title} up`, () => moveTrack(index, -1));
    up.disabled = index === 0 || state === 'transitioning';
    const down = makeQueueButton('↓', `Move ${track.title} down`, () => moveTrack(index, 1));
    down.disabled = index === queue.length - 1 || state === 'transitioning';
    const remove = makeQueueButton('×', `Remove ${track.title}`, () => removeTrack(index));
    remove.disabled = state === 'transitioning';
    actions.append(up, down, remove);
    row.append(art, detail, actions);
    ui.queue.append(row);
  });
}

function makeQueueButton(text, label, callback) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', callback);
  return button;
}

function moveTrack(index, direction) {
  if (state === 'transitioning') return;
  const target = index + direction;
  if (target < 0 || target >= queue.length) return;
  [queue[index], queue[target]] = [queue[target], queue[index]];
  render();
}

function removeTrack(index) {
  if (state === 'transitioning') return;
  const [id] = queue.splice(index, 1);
  loadedCount -= 1;
  if (!queue.includes(id) && current !== id) {
    URL.revokeObjectURL(tracks.get(id).url);
    tracks.delete(id);
  }
  render();
}

function addTrack(track) {
  tracks.set(track.id, track);
  queue.push(track.id);
  loadedCount += 1;
  render();
}

function probeDuration(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let done = false;
    const timeout = setTimeout(() => settle(new Error('Timed out reading audio metadata.')), 10000);
    function settle(error, duration) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      audio.removeAttribute('src');
      audio.load();
      error ? reject(error) : resolve(duration);
    }
    audio.addEventListener('loadedmetadata', () => Number.isFinite(audio.duration) && audio.duration > 0 ? settle(null, audio.duration) : settle(new Error('Audio duration is unavailable.')), { once: true });
    audio.addEventListener('error', () => settle(new Error('This file could not be decoded.')), { once: true });
    audio.preload = 'metadata';
    audio.src = url;
  });
}

async function addLocalFiles(files) {
  const candidates = [...files];
  if (!candidates.length) return;
  ui.sourceMessage.textContent = `Checking ${candidates.length} local file${candidates.length === 1 ? '' : 's'}…`;
  let failed = 0;
  for (const file of candidates) {
    if (!/\.(mp3|wav)$/i.test(file.name)) { failed += 1; continue; }
    const url = URL.createObjectURL(file);
    try {
      const duration = await probeDuration(url);
      const title = file.name.replace(/\.(mp3|wav)$/i, '');
      addTrack({ id: crypto.randomUUID(), title, artist: 'Local file', duration, url, palette: palettes[loadedCount % palettes.length] });
    } catch {
      URL.revokeObjectURL(url);
      failed += 1;
    }
  }
  if (failed) announce(`${failed} file${failed === 1 ? '' : 's'} could not be loaded. Use playable MP3 or PCM WAV files.`, true);
  else announce(`${candidates.length} local file${candidates.length === 1 ? '' : 's'} added. Audio stays on this device.`);
  render();
  ui.fileInput.value = '';
}

const demoSets = [
  { title: 'Soft Arrival', artist: 'AutoMix Demo · 92 BPM', bpm: 92, roots: [48, 55, 52, 57], wave: 'soft', duration: 34 },
  { title: 'City Lights', artist: 'AutoMix Demo · 108 BPM', bpm: 108, roots: [50, 57, 53, 60], wave: 'bright', duration: 36 },
  { title: 'After Hours', artist: 'AutoMix Demo · 118 BPM', bpm: 118, roots: [45, 52, 48, 55], wave: 'warm', duration: 38 },
  { title: 'One More Song', artist: 'AutoMix Demo · 102 BPM', bpm: 102, roots: [53, 60, 57, 64], wave: 'round', duration: 35 },
];

const frequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const fract = (value) => value - Math.floor(value);

function makeDemoWav(spec) {
  const sampleRate = 22050;
  const count = Math.floor(spec.duration * sampleRate);
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const str = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, count * 2, true);
  const beatLength = 60 / spec.bpm;
  const chordLength = beatLength * 8;
  const harmonics = spec.wave === 'bright' ? [1, .35, .18] : spec.wave === 'soft' ? [1, .13, .04] : [1, .25, .08];
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const root = spec.roots[Math.floor(t / chordLength) % spec.roots.length];
    const beat = t / beatLength;
    const beatPhase = fract(beat);
    const beatIndex = Math.floor(beat) % 4;
    const barFade = Math.min(1, t / 1.2, (spec.duration - t) / 1.1);
    const chordNotes = [root, root + 7, root + 12];
    let chord = 0;
    for (const note of chordNotes) {
      const p = 2 * Math.PI * frequency(note) * t;
      chord += (Math.sin(p) * harmonics[0] + Math.sin(2 * p) * harmonics[1] + Math.sin(3 * p) * harmonics[2]) / 3;
    }
    const arpeggioIndex = Math.floor(beat * 2) % 8;
    const arpNote = root + [12, 19, 24, 19, 12, 16, 19, 16][arpeggioIndex];
    const arpPhase = fract(beat * 2);
    const arp = Math.sin(2 * Math.PI * frequency(arpNote) * t) * Math.exp(-arpPhase * 4.5) * .12;
    const bass = Math.sin(2 * Math.PI * frequency(root - 12) * t) * Math.exp(-beatPhase * 3) * .18;
    const kick = Math.sin(2 * Math.PI * (58 * beatPhase * beatLength + 28 * (1 - Math.exp(-beatPhase * 28)))) * Math.exp(-beatPhase * 18) * .35;
    const noise = fract(Math.sin(i * 12.9898 + spec.bpm * 78.233) * 43758.5453) * 2 - 1;
    const snare = beatIndex === 1 || beatIndex === 3 ? noise * Math.exp(-beatPhase * 25) * .13 : 0;
    const hat = noise * Math.exp(-fract(beat * 2) * 38) * .035;
    const value = Math.max(-1, Math.min(1, (chord * .25 + arp + bass + kick + snare + hat) * Math.max(0, barFade)));
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

async function loadDemo() {
  ui.demoButton.disabled = true;
  ui.demoButton.textContent = 'Generating sounds…';
  try {
    for (let i = 0; i < demoSets.length; i++) {
      const spec = demoSets[i];
      ui.sourceMessage.textContent = `Creating original demo sound ${i + 1} of ${demoSets.length}…`;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blob = makeDemoWav(spec);
      addTrack({ id: crypto.randomUUID(), title: spec.title, artist: spec.artist, duration: spec.duration, url: URL.createObjectURL(blob), palette: palettes[loadedCount % palettes.length] });
    }
    announce('Four original demo sounds loaded. Press Start party to hear the mix.');
  } catch (error) {
    announce(`Could not generate demo sounds: ${error.message}`, true);
    ui.demoButton.disabled = false;
  }
  ui.demoButton.textContent = 'Demo sounds loaded';
  render();
}

ui.demoButton.addEventListener('click', loadDemo);
ui.fileInput.addEventListener('change', (event) => void addLocalFiles(event.target.files));
ui.startButton.addEventListener('click', () => {
  if (state === 'ready' || state === 'ended') void startParty();
  else if (state === 'paused') void resumeParty();
  else void pauseParty();
});
ui.nextButton.addEventListener('click', () => void beginTransition(true));
ui.protectButton.addEventListener('click', () => {
  protectedCurrent = !protectedCurrent;
  announce(protectedCurrent ? 'This song will finish before the next starts.' : 'Automatic transitions are on again.');
  render();
});
ui.volume.addEventListener('input', () => {
  const value = Number(ui.volume.value) / 100;
  ui.volumeValue.textContent = `${Math.round(value * 100)}%`;
  if (masterGain) masterGain.gain.value = value;
});
window.addEventListener('pagehide', () => {
  for (const track of tracks.values()) URL.revokeObjectURL(track.url);
});

render();
requestAnimationFrame(tick);
