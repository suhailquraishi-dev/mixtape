import { AudioEngine } from './audio-engine.js';
import { demoSets, makeDemoWav } from './demo-audio.js';
import { AUTO_LOAD_REMAINING, FADE_REMAINING, secondsUntilAutoLoad } from './timing.js';

const $ = (selector) => document.querySelector(selector);
const engine = new AudioEngine();
const palettes = ['blue', 'lime', 'peach', 'lavender'];
const ui = {
  sessionStatus: $('#session-status'), trackCount: $('#track-count'), topCenter: $('.topbar-center'),
  demoButton: $('#demo-button'), fileButton: $('#file-button'), fileInput: $('#file-input'),
  libraryButton: $('#library-button'), queueButton: $('#queue-button'), queueCount: $('#queue-count'),
  deadlineTitle: $('#deadline-title'), deadlineDetail: $('#deadline-detail'), timingFill: $('#timing-fill'),
  commandOverline: $('.command-overline'), autoButton: $('#auto-button'), autoLabel: $('#auto-label'),
  protectButton: $('#protect-button'), nextButton: $('#next-button'), transportButton: $('#transport-button'),
  transportSymbol: $('#transport-symbol'), transportLabel: $('#transport-label'), footStatus: $('#foot-status'), footLed: $('.foot-led'),
  mixerReadout: $('#mixer-readout'), mixerSubreadout: $('#mixer-subreadout'), volume: $('#master-volume'), volumeValue: $('#volume-value'),
  crossfader: $('#crossfader'), faderValue: $('#fader-value'), faderHint: $('#fader-hint'), meterA: $('#meter-a'), meterB: $('#meter-b'),
  panel: $('#music-panel'), panelTitle: $('#panel-title'), panelInstruction: $('#panel-instruction'), sourceMessage: $('#source-message'),
  panelLibraryTab: $('#panel-library-tab'), panelQueueTab: $('#panel-queue-tab'), panelQueueCount: $('#panel-queue-count'), panelClose: $('#panel-close'),
  libraryList: $('#library-list'), queueList: $('#queue-list'), notice: $('#notice'),
  mobileA: $('#show-deck-a'), mobileB: $('#show-deck-b'),
  decks: [0, 1].map((index) => {
    const letter = index === 0 ? 'a' : 'b';
    return {
      root: $(`#deck-${letter}`), state: $(`#deck-${letter}-state`), kicker: $(`#deck-${letter}-kicker`),
      track: $(`#deck-${letter}-track`), artist: $(`#deck-${letter}-artist`), progress: $(`#deck-${letter}-progress`),
      elapsed: $(`#deck-${letter}-elapsed`), duration: $(`#deck-${letter}-duration`), platter: $(`#platter-${letter}`),
      meter: $(`#deck-${letter}-meter`), load: $(`#deck-${letter}-load`), play: $(`#deck-${letter}-play`),
    };
  }),
};

let panelOpen = false;
let panelTab = 'library';
let loadTarget = null;
let mobileDeck = 0;
let lastActiveDeck = 0;
let panelKey = '';
let lastNotice = '';
let noticeTimeout = null;
let returnFocus = null;
let draggingFader = false;
let demoLoaded = false;
let sourceMessage = 'Local files stay on this device.';

const formatTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
const formatCountdown = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

function showNotice(message, error = false) {
  if (!message) return;
  ui.notice.textContent = message;
  ui.notice.classList.toggle('is-error', error);
  ui.notice.classList.add('is-visible');
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => ui.notice.classList.remove('is-visible'), 5200);
}

function renderDeadline(snapshot) {
  const { current, next, remaining, state, autoMix, preparedId, preparedState, protectCurrent } = snapshot;
  let title;
  let detail;
  if (!current) {
    title = state === 'ended' ? 'Set finished' : snapshot.queue.length >= 2 ? 'Ready when you are' : 'Load two tracks to start';
    detail = state === 'ended' ? 'Add more music or press Start for another set.' : snapshot.queue.length >= 2 ? 'Press Start set. Audio begins only after your click.' : 'Use the original demo sounds or add local MP3 and WAV files.';
  } else if (state === 'transitioning' || (state === 'paused' && snapshot.transitioning)) {
    title = `${state === 'paused' ? 'Mix paused' : 'Mixing now'} · ${next?.title || 'next track'}`;
    detail = state === 'paused' ? 'Both decks are paused at the same mix position.' : 'Use the crossfader to shape this transition.';
  } else if (!autoMix) {
    title = `AutoMix off · ends in ${formatCountdown(remaining)}`;
    detail = 'Load a track and use Mix next, or turn AutoMix back on.';
  } else if (!next) {
    title = `Add more music · ${formatCountdown(remaining)} left`;
    detail = 'No playable track is queued. The current song will finish normally.';
  } else if (preparedId === next.id && preparedState === 'ready') {
    title = state === 'paused' ? 'Next track ready · paused' : 'Next track ready';
    detail = protectCurrent ? `${next.title} starts after this song ends in ${formatCountdown(remaining)}.` : `${next.title} · Mix begins in ${formatCountdown(Math.max(0, remaining - FADE_REMAINING))}.`;
  } else if (preparedState === 'loading') {
    title = 'Loading the next deck…';
    detail = `${next.title} is being prepared. The current song keeps playing.`;
  } else {
    title = `Load a track in ${formatCountdown(secondsUntilAutoLoad(snapshot.duration, snapshot.elapsed))}`;
    detail = `Otherwise AutoMix loads ${next.title} at ${AUTO_LOAD_REMAINING} seconds remaining.`;
  }
  ui.deadlineTitle.textContent = title;
  ui.deadlineDetail.textContent = detail;
  ui.timingFill.style.width = `${snapshot.duration ? Math.min(100, snapshot.elapsed / snapshot.duration * 100) : 0}%`;
}

function renderDeck(snapshot, index) {
  const deck = snapshot.decks[index];
  const elements = ui.decks[index];
  const track = deck.track;
  const onAir = deck.isActive;
  const incoming = snapshot.transitioning && !onAir && deck.status === 'mixing';
  elements.state.textContent = deck.status.toUpperCase();
  elements.state.classList.toggle('is-on-air', onAir && snapshot.state !== 'paused');
  elements.state.classList.toggle('is-ready', deck.status === 'ready' || incoming);
  elements.kicker.textContent = onAir ? 'NOW PLAYING' : incoming ? 'MIXING IN' : deck.status === 'ready' ? 'PREPARED NEXT' : deck.status === 'loading' ? 'PREPARING' : track ? 'QUEUED · NOT LOADED' : 'NO TRACK LOADED';
  elements.track.textContent = track?.title || 'Choose a track';
  elements.artist.textContent = track?.artist || 'Ready for your music';
  elements.elapsed.textContent = formatTime(onAir || incoming ? deck.elapsed : 0);
  elements.duration.textContent = formatTime(track?.duration);
  elements.progress.style.width = `${track && (onAir || incoming) ? Math.min(100, deck.elapsed / track.duration * 100) : 0}%`;
  elements.meter.style.width = `${Math.round(deck.level * 100)}%`;
  elements.platter.classList.toggle('is-playing', (onAir || incoming) && snapshot.state !== 'paused');
  elements.load.disabled = (!!snapshot.current && index === snapshot.activeDeck) || snapshot.transitioning || snapshot.frozen;
  const canStart = !snapshot.current && (snapshot.state === 'ready' || snapshot.state === 'ended') && snapshot.queue.length >= (snapshot.state === 'ready' ? 2 : 1) && index === snapshot.activeDeck;
  const canControl = onAir || canStart;
  elements.play.disabled = !canControl;
  elements.play.textContent = onAir && (snapshot.state === 'playing' || snapshot.state === 'transitioning') ? '❚❚' : '▶';
  elements.play.setAttribute('aria-label', onAir ? `${snapshot.state === 'paused' ? 'Resume' : 'Pause'} deck ${index === 0 ? 'A' : 'B'}` : `Start deck ${index === 0 ? 'A' : 'B'}`);
}

function render(snapshot) {
  if (snapshot.activeDeck !== lastActiveDeck) setMobileDeck(snapshot.activeDeck);
  lastActiveDeck = snapshot.activeDeck;
  const playing = snapshot.state === 'playing' || snapshot.state === 'transitioning';
  const labels = { ready: 'STANDBY', playing: snapshot.autoMix ? 'AUTO MIX ON' : 'MANUAL NEXT', transitioning: 'TRANSITIONING', paused: 'PAUSED', ended: 'SET FINISHED' };
  ui.sessionStatus.textContent = labels[snapshot.state];
  ui.topCenter.classList.toggle('is-live', playing);
  ui.commandOverline.classList.toggle('is-live', playing);
  ui.footLed.classList.toggle('is-live', playing);
  ui.trackCount.textContent = `${snapshot.library.filter((track) => !track.unavailable).length} TRACKS`;
  ui.queueCount.textContent = String(snapshot.queue.length);
  ui.panelQueueCount.textContent = String(snapshot.queue.length);
  renderDeadline(snapshot);
  ui.autoButton.setAttribute('aria-pressed', String(snapshot.autoMix));
  ui.autoLabel.textContent = snapshot.autoMix ? 'ON' : 'OFF';
  ui.protectButton.disabled = !snapshot.current || snapshot.transitioning;
  ui.protectButton.setAttribute('aria-pressed', String(snapshot.protectCurrent));
  ui.nextButton.disabled = snapshot.state !== 'playing' || !snapshot.queue.length || snapshot.transitioning;
  ui.transportButton.disabled = !snapshot.current && snapshot.queue.length < (snapshot.state === 'ended' ? 1 : 2);
  const transportAction = playing ? 'Pause set' : snapshot.state === 'paused' ? 'Resume set' : 'Start set';
  ui.transportLabel.textContent = transportAction;
  ui.transportSymbol.textContent = playing ? '❚❚' : '▶';
  ui.transportButton.setAttribute('aria-label', transportAction);
  ui.footStatus.textContent = snapshot.current ? `${snapshot.current.title} · ${snapshot.autoMix ? 'automatic transitions' : 'manual next'}` : snapshot.queue.length ? `${snapshot.queue.length} track${snapshot.queue.length === 1 ? '' : 's'} queued · ready for your set` : 'Two decks. One continuous set.';
  ui.mixerReadout.textContent = snapshot.transitioning ? 'MIXING' : playing ? 'ON AIR' : snapshot.state.toUpperCase();
  ui.mixerSubreadout.textContent = snapshot.transitioning ? 'Both decks active' : snapshot.current ? snapshot.current.title : 'Waiting for music';
  ui.meterA.style.height = `${Math.round(snapshot.decks[0].level * 100)}%`;
  ui.meterB.style.height = `${Math.round(snapshot.decks[1].level * 100)}%`;
  ui.volumeValue.textContent = `${Math.round(snapshot.volume * 100)}%`;
  if (document.activeElement !== ui.volume) ui.volume.value = String(Math.round(snapshot.volume * 100));
  ui.crossfader.disabled = !snapshot.transitioning || snapshot.state === 'paused';
  if (!draggingFader) ui.crossfader.value = String(snapshot.crossfader);
  ui.faderValue.textContent = snapshot.transitioning ? `${snapshot.crossfader}% toward B` : snapshot.activeDeck === 0 ? 'A' : 'B';
  ui.faderHint.textContent = snapshot.transitioning ? 'Take over this mix; release to resume AutoMix' : 'Available during a mix';
  renderDeck(snapshot, 0);
  renderDeck(snapshot, 1);
  if (snapshot.notice && snapshot.notice !== lastNotice) {
    lastNotice = snapshot.notice;
    showNotice(snapshot.notice, snapshot.noticeIsError);
  }
  const structuralKey = [panelTab, loadTarget, snapshot.state, snapshot.activeDeck, snapshot.frozen, snapshot.preparedId, snapshot.preparedState, snapshot.current?.id, snapshot.queue.map((track) => track.id).join(','), snapshot.library.map((track) => `${track.id}:${track.unavailable}`).join(',')].join('|');
  if (panelOpen && structuralKey !== panelKey) {
    panelKey = structuralKey;
    renderPanel(snapshot);
  }
}

function makeButton(text, label, action, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  if (options.className) button.className = options.className;
  button.disabled = Boolean(options.disabled);
  button.addEventListener('click', action);
  return button;
}

function makeTrackRow(track, meta, actions, isNext = false) {
  const row = document.createElement('div');
  row.className = `track-row ${isNext ? 'is-next' : ''}`;
  row.setAttribute('role', 'listitem');
  const art = document.createElement('span');
  art.className = `track-art ${track.palette || 'blue'}`;
  art.setAttribute('aria-hidden', 'true');
  art.textContent = '✳';
  const copy = document.createElement('div');
  copy.className = 'track-copy';
  const title = document.createElement('strong');
  title.textContent = track.title;
  const subtitle = document.createElement('small');
  subtitle.textContent = meta;
  copy.append(title, subtitle);
  const duration = document.createElement('span');
  duration.className = 'track-duration';
  duration.textContent = formatTime(track.duration);
  const actionBox = document.createElement('div');
  actionBox.className = 'track-actions';
  actionBox.append(...actions);
  row.append(art, copy, duration, actionBox);
  return row;
}

function renderPanel(snapshot) {
  ui.panelTitle.textContent = panelTab === 'library' ? 'Music library' : 'Running order';
  ui.panelLibraryTab.setAttribute('aria-pressed', String(panelTab === 'library'));
  ui.panelQueueTab.setAttribute('aria-pressed', String(panelTab === 'queue'));
  ui.libraryList.hidden = panelTab !== 'library';
  ui.queueList.hidden = panelTab !== 'queue';
  ui.sourceMessage.textContent = sourceMessage;
  ui.panelInstruction.textContent = loadTarget === null ? panelTab === 'queue' ? 'Move or remove tracks before the next deck locks.' : 'Load a track or add it to the running order.' : `Choose a track for Deck ${loadTarget === 0 ? 'A' : 'B'}.`;
  if (panelTab === 'library') {
    ui.libraryList.replaceChildren();
    if (!snapshot.library.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      const heading = document.createElement('strong');
      heading.textContent = 'Your library is empty';
      const note = document.createElement('span');
      note.textContent = 'Load original demo sounds or your own MP3 and WAV files.';
      const demo = makeButton('Load demo sounds', 'Load demo sounds', () => void loadDemo());
      empty.append(heading, note, demo);
      ui.libraryList.append(empty);
    } else {
      snapshot.library.forEach((track) => {
        const queued = snapshot.queue.some((item) => item.id === track.id);
        const isCurrent = snapshot.current?.id === track.id;
        const target = loadTarget === null ? snapshot.current ? 1 - snapshot.activeDeck : 0 : loadTarget;
        const label = `Load ${track.title} on Deck ${target === 0 ? 'A' : 'B'}`;
        const load = makeButton(`Load ${target === 0 ? 'A' : 'B'}`, label, () => {
          const accepted = engine.selectForDeck(track.id, target);
          if (accepted) closePanel();
          else showNotice('That deck is locked during this transition.', true);
        }, { className: 'primary', disabled: track.unavailable || isCurrent || snapshot.transitioning || snapshot.frozen || (!!snapshot.current && target === snapshot.activeDeck) });
        const add = makeButton(queued ? 'Queued' : 'Queue', `${queued ? 'Already queued' : 'Add to queue'}: ${track.title}`, () => engine.enqueue(track.id), { disabled: queued || isCurrent || track.unavailable });
        ui.libraryList.append(makeTrackRow(track, track.unavailable ? 'Unavailable · reload the file' : track.artist, [load, add], queued && snapshot.next?.id === track.id));
      });
    }
  } else {
    ui.queueList.replaceChildren();
    if (!snapshot.queue.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      const heading = document.createElement('strong');
      heading.textContent = 'Nothing up next';
      const note = document.createElement('span');
      note.textContent = 'Open the library to add tracks to your running order.';
      const browse = makeButton('Browse library', 'Browse music library', () => openPanel('library'));
      empty.append(heading, note, browse);
      ui.queueList.append(empty);
    } else {
      snapshot.queue.forEach((track, index) => {
        const locked = snapshot.transitioning || snapshot.frozen;
        const load = makeButton(index === 0 && snapshot.preparedId === track.id ? 'Ready' : 'Load next', `Load ${track.title} next`, () => { void engine.selectNext(track.id); closePanel(); }, { className: 'primary', disabled: locked || (index === 0 && snapshot.preparedId === track.id && snapshot.preparedState === 'ready') });
        const up = makeButton('↑', `Move ${track.title} up`, () => engine.moveQueue(track.id, -1), { className: 'square', disabled: locked || index === 0 });
        const down = makeButton('↓', `Move ${track.title} down`, () => engine.moveQueue(track.id, 1), { className: 'square', disabled: locked || index === snapshot.queue.length - 1 });
        const remove = makeButton('×', `Remove ${track.title} from queue`, () => engine.removeFromQueue(track.id), { className: 'square', disabled: locked });
        ui.queueList.append(makeTrackRow(track, `${index === 0 ? 'UP NEXT · ' : ''}${track.artist}`, [load, up, down, remove], index === 0));
      });
    }
  }
}

function openPanel(tab = 'library', target = null) {
  if (!panelOpen) returnFocus = document.activeElement;
  panelOpen = true;
  panelTab = tab;
  loadTarget = target;
  panelKey = '';
  ui.panel.dataset.open = 'true';
  ui.panel.inert = false;
  ui.panel.setAttribute('aria-hidden', 'false');
  ui.libraryButton.setAttribute('aria-expanded', 'true');
  ui.queueButton.setAttribute('aria-expanded', 'true');
  render(engine.snapshot());
  ui.panelClose.focus();
}

function closePanel() {
  panelOpen = false;
  loadTarget = null;
  ui.panel.dataset.open = 'false';
  ui.panel.inert = true;
  ui.panel.setAttribute('aria-hidden', 'true');
  ui.libraryButton.setAttribute('aria-expanded', 'false');
  ui.queueButton.setAttribute('aria-expanded', 'false');
  if (returnFocus?.focus) returnFocus.focus();
}

function setMobileDeck(index) {
  mobileDeck = index;
  ui.mobileA.setAttribute('aria-pressed', String(index === 0));
  ui.mobileB.setAttribute('aria-pressed', String(index === 1));
  ui.decks[0].root.dataset.mobileVisible = String(index === 0);
  ui.decks[1].root.dataset.mobileVisible = String(index === 1);
}

function probeDuration(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('Timed out reading audio metadata.')), 10000);
    function finish(error, duration) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      audio.removeAttribute('src');
      audio.load();
      error ? reject(error) : resolve(duration);
    }
    audio.addEventListener('loadedmetadata', () => Number.isFinite(audio.duration) && audio.duration > 0 ? finish(null, audio.duration) : finish(new Error('Audio duration is unavailable.')), { once: true });
    audio.addEventListener('error', () => finish(new Error('The file could not be decoded.')), { once: true });
    audio.preload = 'metadata';
    audio.src = url;
  });
}

async function addLocalFiles(files) {
  const candidates = [...files];
  if (!candidates.length) return;
  sourceMessage = `Checking ${candidates.length} local file${candidates.length === 1 ? '' : 's'}…`;
  render(engine.snapshot());
  let added = 0;
  let failed = 0;
  for (const file of candidates) {
    if (!/\.(mp3|wav)$/i.test(file.name)) { failed += 1; continue; }
    const url = URL.createObjectURL(file);
    try {
      const duration = await probeDuration(url);
      engine.addTrack({ id: crypto.randomUUID(), title: file.name.replace(/\.(mp3|wav)$/i, ''), artist: 'Local file', duration, url, palette: palettes[engine.tracks.size % palettes.length] });
      added += 1;
    } catch {
      URL.revokeObjectURL(url);
      failed += 1;
    }
  }
  sourceMessage = failed ? `${added} added · ${failed} failed` : `${added} local track${added === 1 ? '' : 's'} added`;
  showNotice(failed ? `${failed} file${failed === 1 ? '' : 's'} could not load. Use playable MP3 or PCM WAV files.` : `${added} track${added === 1 ? '' : 's'} added. Audio stays on this device.`, failed > 0);
  panelKey = '';
  render(engine.snapshot());
  ui.fileInput.value = '';
}

async function loadDemo() {
  if (demoLoaded) return;
  demoLoaded = true;
  ui.demoButton.disabled = true;
  ui.demoButton.textContent = 'Creating sounds…';
  try {
    for (const spec of demoSets) {
      sourceMessage = `Creating ${spec.title}…`;
      panelKey = '';
      render(engine.snapshot());
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blob = makeDemoWav(spec);
      engine.addTrack({ id: crypto.randomUUID(), title: spec.title, artist: spec.artist, duration: spec.duration, url: URL.createObjectURL(blob), palette: palettes[engine.tracks.size % palettes.length] });
    }
    ui.demoButton.textContent = 'Demo ready';
    sourceMessage = 'Four original demo sounds ready';
    showNotice('Four original demo sounds loaded. Press Start set.');
  } catch (error) {
    demoLoaded = false;
    ui.demoButton.disabled = false;
    ui.demoButton.textContent = 'Load demo';
    showNotice(`Could not create demo sounds: ${error.message}`, true);
  }
  panelKey = '';
  render(engine.snapshot());
}

function togglePlayback() {
  const snapshot = engine.snapshot();
  if (snapshot.state === 'paused') void engine.resume();
  else if (snapshot.state === 'playing' || snapshot.state === 'transitioning') engine.pause();
  else void engine.start();
}

ui.demoButton.addEventListener('click', () => void loadDemo());
ui.fileButton.addEventListener('click', () => ui.fileInput.click());
ui.fileInput.addEventListener('change', (event) => void addLocalFiles(event.target.files));
ui.libraryButton.addEventListener('click', () => panelOpen ? closePanel() : openPanel('library'));
ui.queueButton.addEventListener('click', () => panelOpen && panelTab === 'queue' ? closePanel() : openPanel('queue'));
ui.panelLibraryTab.addEventListener('click', () => openPanel('library'));
ui.panelQueueTab.addEventListener('click', () => openPanel('queue'));
ui.panelClose.addEventListener('click', closePanel);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && panelOpen) closePanel(); });
ui.transportButton.addEventListener('click', togglePlayback);
ui.nextButton.addEventListener('click', () => void engine.mixNext());
ui.autoButton.addEventListener('click', () => engine.setAutoMix(!engine.autoMix));
ui.protectButton.addEventListener('click', () => engine.setProtected(!engine.protectCurrent));
ui.volume.addEventListener('input', () => engine.setVolume(Number(ui.volume.value) / 100));
ui.crossfader.addEventListener('input', () => { draggingFader = true; engine.setCrossfader(Number(ui.crossfader.value)); });
ui.crossfader.addEventListener('change', () => { draggingFader = false; engine.releaseCrossfader(); });
ui.crossfader.addEventListener('pointerup', () => { draggingFader = false; engine.releaseCrossfader(); });
ui.crossfader.addEventListener('keyup', () => { draggingFader = false; engine.releaseCrossfader(); });
ui.crossfader.addEventListener('blur', () => { draggingFader = false; engine.releaseCrossfader(); });
ui.mobileA.addEventListener('click', () => setMobileDeck(0));
ui.mobileB.addEventListener('click', () => setMobileDeck(1));
ui.decks.forEach((deck, index) => {
  deck.load.addEventListener('click', () => openPanel('library', index));
  deck.play.addEventListener('click', togglePlayback);
});
window.addEventListener('pagehide', () => engine.dispose());

ui.panel.inert = true;
setMobileDeck(0);
engine.subscribe(render);
