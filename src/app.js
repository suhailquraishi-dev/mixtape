import { AudioEngine } from './audio-engine.js';
import { demoSets, makeDemoWav } from './demo-audio.js';
import { AUTO_LOAD_REMAINING, FADE_REMAINING, secondsUntilAutoLoad } from './timing.js';
import { WaveformView } from './waveform.js';
import { ControllerStage } from './render3d/controller.js';

const $ = (selector) => document.querySelector(selector);
const engine = new AudioEngine();
const palettes = ['blue', 'lime', 'peach', 'lavender'];
const ui = {
  sessionStatus: $('#session-status'), trackCount: $('#track-count'), topCenter: $('.topbar-center'),
  demoButton: $('#demo-button'), fileButton: $('#file-button'), fileInput: $('#file-input'),
  libraryButton: $('#library-button'), queueButton: $('#queue-button'), queueCount: $('#queue-count'),
  shell: $('.app-shell'), partyView: $('#party-view'), studioView: $('#studio-view'), partyModeButton: $('#party-mode-button'), studioModeButton: $('#studio-mode-button'),
  party: {
    libraryCount: $('#party-library-count'), libraryList: $('#party-library-list'), search: $('#party-search'), importButton: $('#party-import-button'), clearDemo: $('#party-clear-demo'),
    queueCount: $('#party-queue-count'), queueList: $('#party-queue-list'), queueFooter: $('#party-queue-footer'), queueAdd: $('#party-queue-add'),
    output: $('#party-output-status'), empty: $('#party-empty'), emptyTitle: $('#party-empty-title'), emptyDetail: $('#party-empty-detail'), addButton: $('#party-add-button'), demoButton: $('#party-demo-button'), importStatus: $('#party-import-status'),
    player: $('#party-player'), playingLabel: $('#party-playing-label'), source: $('#party-track-source'), cover: $('#party-cover'), coverMark: $('#party-cover-mark'), title: $('#party-track-title'), artist: $('#party-track-artist'), note: $('#party-track-note'),
    waveform: $('#party-waveform'), waveformState: $('#waveform-state'), elapsed: $('#party-elapsed'), duration: $('#party-duration'),
    transitionTitle: $('#party-transition-title'), transitionDetail: $('#party-transition-detail'), transitionTime: $('#party-transition-time'),
    play: $('#party-play-button'), mix: $('#party-mix-button'), skip: $('#party-skip-button'), auto: $('#party-auto-button'), volume: $('#party-volume-input'), volumeValue: $('#party-volume-value'),
    bottomStatus: $('#party-bottom-status'), openLibrary: $('#party-open-library'), openQueue: $('#party-open-queue'), mobileQueueCount: $('#party-mobile-queue-count'),
  },
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
  hardware: {
    canvas: $('#hardware-canvas'), tooltip: $('#hardware-tooltip'), fallback: $('#hardware-fallback'),
    mixState: $('#hardware-mix-state'), mixDetail: $('#hardware-mix-detail'), stageStatus: $('#hardware-stage-status'), stageLed: $('.stage-led'),
    aLevel: $('#hardware-a-level'), bLevel: $('#hardware-b-level'),
    play: $('#hardware-play'), mix: $('#hardware-mix'), skip: $('#hardware-skip'), demo: $('#hardware-demo'), library: $('#hardware-library'), queue: $('#hardware-queue'), queueCount: $('#hardware-queue-count'),
    nextTitle: $('#hardware-next-title'), nextDetail: $('#hardware-next-detail'), reset: $('#hardware-reset-view'), effects: $('#hardware-effects'),
    controls: $('#hardware-controls'), controlsToggle: $('#hardware-controls-toggle'), controlsClose: $('#hardware-controls-close'),
    volume: $('#hardware-volume'), crossfader: $('#hardware-crossfader'),
    decks: [0, 1].map((index) => { const letter = index === 0 ? 'a' : 'b'; return {
      state: $(`#hardware-${letter}-state`), title: $(`#hardware-${letter}-title`), meta: $(`#hardware-${letter}-meta`), time: $(`#hardware-${letter}-time`),
      wave: $(`#hardware-${letter}-wave`), load: $(`#hardware-${letter}-load`), play: $(`#hardware-${letter}-play`), cue: $(`#hardware-${letter}-cue`),
      channel: $(`#hardware-${letter}-channel`), low: $(`#hardware-${letter}-low`), mid: $(`#hardware-${letter}-mid`), high: $(`#hardware-${letter}-high`), filter: $(`#hardware-${letter}-filter`),
    }; }),
  },
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
const waveform = new WaveformView(ui.party.waveform, ui.party.waveformState);
const hardwareWaveforms = ui.hardware.decks.map((deck) => new WaveformView(deck.wave, document.createElement('span')));
const hardwareStage = new ControllerStage(ui.hardware.canvas, ui.hardware.tooltip, ui.hardware.fallback, engine, {
  load: (index) => openPanel('library', index),
  takeover: () => { setMode('studio'); showNotice('Manual takeover. AutoMix is off.'); },
});

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
let mode = 'party';
let partyKey = '';

const formatTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
const formatCountdown = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

function setMode(nextMode) {
  mode = nextMode;
  ui.shell.dataset.mode = mode;
  ui.partyView.hidden = true;
  ui.studioView.hidden = true;
  if (engine.autoMix !== (mode === 'party')) engine.setAutoMix(mode === 'party');
  ui.partyModeButton.setAttribute('aria-pressed', String(mode === 'party'));
  ui.studioModeButton.setAttribute('aria-pressed', String(mode === 'studio'));
  if (panelOpen) closePanel();
  waveform.draw();
}

function renderHardware(snapshot) {
  const h = ui.hardware;
  hardwareStage.update(snapshot);
  snapshot.decks.forEach((deck, index) => {
    const target = h.decks[index];
    target.state.textContent = deck.playing ? 'PLAYING' : deck.status.toUpperCase();
    target.title.textContent = deck.track?.title || (index === 0 ? 'Load your first track' : 'Ready for the next song');
    target.meta.textContent = deck.track?.artist || 'MP3 or WAV · local music';
    target.time.textContent = `${formatTime(deck.elapsed)} / ${formatTime(deck.track?.duration)}`;
    target.play.disabled = !deck.track && !snapshot.queue.length;
    target.play.textContent = deck.playing ? `Pause ${index === 0 ? 'A' : 'B'}` : `Play ${index === 0 ? 'A' : 'B'}`;
    target.cue.disabled = snapshot.autoMix || !deck.track || snapshot.transitioning;
    target.load.disabled = snapshot.transitioning || snapshot.frozen || (!!snapshot.current && index === snapshot.activeDeck);
    void hardwareWaveforms[index].setTrack(deck.track);
    hardwareWaveforms[index].setProgress(deck.elapsed, deck.track?.duration || 0);
    for (const key of ['channel', 'low', 'mid', 'high', 'filter']) {
      const value = key === 'channel' ? deck.channelLevel * 100 : key === 'filter' ? deck.filterValue * 100 : deck.eq[key];
      if (document.activeElement !== target[key]) target[key].value = String(Math.round(value));
    }
  });
  const playing = snapshot.state === 'playing' || snapshot.transitioning;
  h.mixState.textContent = snapshot.transitioning ? `TRANSITIONING ${snapshot.activeDeck === 0 ? 'A → B' : 'B → A'}` : snapshot.state === 'paused' ? 'PAUSED' : playing ? snapshot.autoMix ? 'AUTOMIX ARMED' : 'MANUAL DJ' : 'WAITING FOR MUSIC';
  h.mixDetail.textContent = snapshot.transitioning ? `${Math.round(snapshot.crossfader)}% toward B` : snapshot.next ? `Next: ${snapshot.next.title}` : snapshot.current ? 'Queue finished after this song' : 'Add songs or try the demo';
  h.stageStatus.textContent = snapshot.transitioning ? 'TWO DECKS / LIVE TRANSITION' : playing ? 'LOCAL AUDIO / LIVE' : 'AUDIO ENGINE READY';
  h.stageLed.classList.toggle('is-live', playing);
  h.aLevel.style.setProperty('--level', `${Math.round(snapshot.decks[0].level * 100)}%`);
  h.bLevel.style.setProperty('--level', `${Math.round(snapshot.decks[1].level * 100)}%`);
  h.play.disabled = !snapshot.current && !snapshot.queue.length;
  h.play.textContent = playing ? 'Pause' : snapshot.state === 'paused' ? 'Resume' : snapshot.autoMix ? 'Start AutoMix' : 'Start manual set';
  const spareLive = snapshot.decks[1 - snapshot.activeDeck].playing;
  h.mix.disabled = !snapshot.current || (!snapshot.queue.length && !spareLive) || snapshot.state !== 'playing';
  h.skip.disabled = !snapshot.current || !snapshot.queue.length || snapshot.state !== 'playing';
  h.nextTitle.textContent = spareLive && !snapshot.transitioning ? `${snapshot.decks[1 - snapshot.activeDeck].track?.title} · live on other deck` : snapshot.next?.title || 'No track queued';
  h.nextDetail.textContent = spareLive && !snapshot.transitioning ? 'Move the crossfader or press Mix now' : snapshot.current && snapshot.next && snapshot.autoMix ? `Mix in ${formatCountdown(Math.max(0, (snapshot.remaining || 0) - FADE_REMAINING))}` : snapshot.current && !snapshot.autoMix ? 'Cue and fade when you are ready' : snapshot.current ? 'Current song will finish' : 'Add music to begin';
  h.queueCount.textContent = String(snapshot.queue.length);
  h.demo.disabled = demoLoaded;
  h.demo.textContent = demoLoaded ? 'Demo ready' : 'Try demo';
  h.crossfader.disabled = snapshot.autoMix && !snapshot.transitioning;
  if (document.activeElement !== h.crossfader) h.crossfader.value = String(snapshot.crossfader);
  if (document.activeElement !== h.volume) h.volume.value = String(Math.round(snapshot.volume * 100));
}

function partyRow(track, subtitle, buttons, isNext = false) {
  const row = document.createElement('div');
  row.className = `party-track-row ${isNext ? 'is-next' : ''}`;
  row.setAttribute('role', 'listitem');
  const art = document.createElement('span');
  art.className = `party-row-art ${track.palette || 'blue'}`;
  art.textContent = track.title.slice(0, 1).toUpperCase();
  art.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = 'party-row-copy';
  const title = document.createElement('strong');
  title.textContent = track.title;
  const meta = document.createElement('small');
  meta.textContent = subtitle;
  copy.append(title, meta);
  const actions = document.createElement('div');
  actions.className = 'party-row-actions';
  actions.append(...buttons);
  row.append(art, copy, actions);
  return row;
}

function movePartyQueue(id, title, direction) {
  if (!engine.moveQueue(id, direction)) return;
  const label = `Move ${title} ${direction < 0 ? 'up' : 'down'}`;
  const button = [...ui.party.queueList.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label);
  (button?.disabled ? [...button.parentElement.querySelectorAll('button')].find((item) => !item.disabled) : button)?.focus();
}

function movePanelQueue(id, title, direction) {
  if (!engine.moveQueue(id, direction)) return;
  const label = `Move ${title} ${direction < 0 ? 'up' : 'down'}`;
  const button = [...ui.queueList.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label);
  (button?.disabled ? [...button.parentElement.querySelectorAll('button')].find((item) => !item.disabled) : button)?.focus();
}

function renderPartyLists(snapshot) {
  const term = ui.party.search.value.trim().toLocaleLowerCase();
  ui.party.libraryList.replaceChildren();
  const matches = snapshot.library.filter((track) => `${track.title} ${track.artist}`.toLocaleLowerCase().includes(term));
  if (!matches.length) {
    const empty = document.createElement('div');
    empty.className = 'rail-empty';
    empty.textContent = term ? 'No songs match your search.' : 'Add local songs or try the demo to build your library.';
    ui.party.libraryList.append(empty);
  }
  for (const track of matches) {
    const queued = snapshot.queue.some((item) => item.id === track.id);
    const playing = snapshot.current?.id === track.id;
    const add = makeButton(playing ? 'Playing' : queued ? 'Queued' : 'Queue', `${playing ? 'Now playing' : queued ? 'Already queued' : 'Add to queue'}: ${track.title}`, () => { if (engine.enqueue(track.id)) ui.party.play.focus(); }, { className: !playing && !queued ? 'is-primary' : '', disabled: queued || playing || track.unavailable });
    ui.party.libraryList.append(partyRow(track, track.unavailable ? 'Unavailable' : `${formatTime(track.duration)} · ${track.source === 'demo' ? 'Demo' : 'Local file'}`, [add], snapshot.next?.id === track.id));
  }
  ui.party.queueList.replaceChildren();
  if (!snapshot.queue.length) {
    const empty = document.createElement('div');
    empty.className = 'rail-empty';
    const heading = document.createElement('strong');
    heading.textContent = 'No songs queued';
    const copy = document.createElement('span');
    copy.textContent = 'Add songs from your library to keep the party going.';
    const browse = makeButton('Browse library', 'Browse music library', () => openPanel('library'));
    empty.append(heading, copy, browse);
    ui.party.queueList.append(empty);
  }
  snapshot.queue.forEach((track, index) => {
    const locked = snapshot.transitioning || snapshot.frozen;
    const up = makeButton('↑', `Move ${track.title} up`, () => movePartyQueue(track.id, track.title, -1), { disabled: locked || index === 0 });
    const down = makeButton('↓', `Move ${track.title} down`, () => movePartyQueue(track.id, track.title, 1), { disabled: locked || index === snapshot.queue.length - 1 });
    const remove = makeButton('×', `Remove ${track.title} from queue`, () => { if (engine.removeFromQueue(track.id)) ui.party.queueAdd.focus(); }, { disabled: locked });
    const row = partyRow(track, `${index === 0 ? 'NEXT · ' : ''}${formatTime(track.duration)} · ${track.artist}`, [up, down, remove], index === 0);
    row.draggable = !locked;
    row.title = locked ? 'Queue locked for the next mix' : 'Drag to reorder';
    row.addEventListener('dragstart', (event) => { if (locked) return; event.dataTransfer.setData('text/plain', track.id); event.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragover', (event) => { if (locked) return; event.preventDefault(); row.classList.add('is-drag-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('is-drag-target'));
    row.addEventListener('drop', (event) => { event.preventDefault(); row.classList.remove('is-drag-target'); engine.moveQueueTo(event.dataTransfer.getData('text/plain'), track.id); });
    ui.party.queueList.append(row);
  });
}

function renderParty(snapshot) {
  const party = ui.party;
  const track = snapshot.current || snapshot.queue[0] || null;
  const playing = snapshot.state === 'playing' || snapshot.state === 'transitioning';
  party.libraryCount.textContent = String(snapshot.library.length);
  party.queueCount.textContent = String(snapshot.queue.length);
  party.mobileQueueCount.textContent = String(snapshot.queue.length);
  party.clearDemo.hidden = !snapshot.library.some((item) => item.source === 'demo' && item.id !== snapshot.current?.id);
  party.output.textContent = snapshot.state === 'transitioning' ? 'Mixing' : snapshot.state === 'paused' ? 'Paused' : playing ? 'Playing' : snapshot.state === 'ended' && !snapshot.queue.length ? 'Completed' : track ? 'Ready' : 'Ready for music';
  party.output.classList.toggle('is-playing', playing);
  party.empty.hidden = !!track;
  party.player.hidden = !track;
  party.importStatus.textContent = sourceMessage;
  party.bottomStatus.textContent = snapshot.current ? `${snapshot.current.title} · ${snapshot.autoMix ? 'AutoMix on' : 'AutoMix off'}` : snapshot.queue.length ? `${snapshot.queue.length} song${snapshot.queue.length === 1 ? '' : 's'} ready to play` : 'Add a song to begin.';
  party.queueFooter.textContent = snapshot.queue.length ? `${snapshot.queue.length} song${snapshot.queue.length === 1 ? '' : 's'} in your running order.` : 'Your queue is waiting.';
  if (!track) {
    party.emptyTitle.textContent = snapshot.library.length ? 'Your queue is empty.' : "Add your music. We'll keep it flowing.";
    party.emptyDetail.textContent = snapshot.library.length ? 'Add a song from the library to start another set.' : 'Choose local MP3 or WAV files, or try our original demo sounds.';
    party.addButton.textContent = snapshot.library.length ? 'Browse library' : 'Add music';
    void waveform.setTrack(null);
  } else {
    party.playingLabel.textContent = snapshot.transitioning ? 'MIXING NOW' : snapshot.state === 'paused' ? 'PAUSED' : playing ? 'NOW PLAYING' : 'READY TO PLAY';
    party.source.textContent = track.source === 'demo' ? 'ORIGINAL DEMO' : 'LOCAL MUSIC';
    party.title.textContent = track.title;
    party.artist.textContent = track.artist;
    party.note.textContent = !snapshot.current && snapshot.queue.length === 1 ? 'Add another song for continuous mixing.' : snapshot.current ? (!snapshot.queue.length ? 'Playing this song. Add more to keep it flowing.' : snapshot.autoMix ? 'Your set is running on AutoMix.' : 'Manual playback is active.') : 'Start your party when you’re ready.';
    party.cover.className = `party-cover ${track.palette || 'blue'}`;
    party.coverMark.textContent = track.title.slice(0, 1).toUpperCase();
    party.elapsed.textContent = formatTime(snapshot.current ? snapshot.elapsed : 0);
    party.duration.textContent = formatTime(track.duration);
    void waveform.setTrack(track);
    waveform.setProgress(snapshot.current ? snapshot.elapsed : 0, track.duration);
    const next = snapshot.next;
    if (!snapshot.current) {
      party.transitionTitle.textContent = next && snapshot.queue.length > 1 ? `Up next: ${snapshot.queue[1].title}` : 'One song ready';
      party.transitionDetail.textContent = snapshot.queue.length > 1 ? 'AutoMix will move through your queue.' : 'Add another song for continuous mixing.';
      party.transitionTime.textContent = '—';
    } else if (snapshot.transitioning) {
      party.transitionTitle.textContent = `Mixing into ${next?.title || 'next song'}`;
      party.transitionDetail.textContent = snapshot.state === 'paused' ? 'Both songs are paused together.' : 'A real crossfade is in progress.';
      party.transitionTime.textContent = 'MIXING';
    } else if (!next) {
      party.transitionTitle.textContent = 'Queue empty';
      party.transitionDetail.textContent = 'This song will finish normally. Add music to continue.';
      party.transitionTime.textContent = formatCountdown(snapshot.remaining);
    } else if (!snapshot.autoMix) {
      party.transitionTitle.textContent = `Up next: ${next.title}`;
      party.transitionDetail.textContent = 'AutoMix is off. Use Mix now or turn it on.';
      party.transitionTime.textContent = formatCountdown(snapshot.remaining);
    } else {
      party.transitionTitle.textContent = snapshot.preparedState === 'loading' ? `Preparing ${next.title}` : `Up next: ${next.title}`;
      party.transitionDetail.textContent = snapshot.preparedState === 'ready' ? 'Next song ready for the transition.' : `AutoMix loads it at ${AUTO_LOAD_REMAINING} seconds remaining.`;
      party.transitionTime.textContent = formatCountdown(snapshot.preparedState === 'ready' ? Math.max(0, snapshot.remaining - FADE_REMAINING) : secondsUntilAutoLoad(snapshot.duration, snapshot.elapsed));
    }
  }
  party.play.disabled = !snapshot.current && !snapshot.queue.length;
  party.play.textContent = playing ? 'Pause' : snapshot.state === 'paused' ? 'Resume' : 'Start party';
  party.mix.disabled = snapshot.state !== 'playing' || !snapshot.queue.length || snapshot.transitioning;
  party.skip.disabled = snapshot.state !== 'playing' || !snapshot.queue.length || snapshot.transitioning;
  party.auto.setAttribute('aria-pressed', String(snapshot.autoMix));
  party.auto.textContent = snapshot.autoMix ? 'On' : 'Off';
  party.volumeValue.textContent = `${Math.round(snapshot.volume * 100)}%`;
  if (document.activeElement !== party.volume) party.volume.value = String(Math.round(snapshot.volume * 100));
  const key = [ui.party.search.value, snapshot.library.map((item) => `${item.id}:${item.unavailable}`).join(','), snapshot.queue.map((item) => item.id).join(','), snapshot.current?.id, snapshot.transitioning, snapshot.frozen].join('|');
  if (key !== partyKey) { partyKey = key; renderPartyLists(snapshot); }
}

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
    title = state === 'ended' && !snapshot.queue.length ? 'Set finished' : snapshot.queue.length ? 'Ready when you are' : 'Load a track to start';
    detail = state === 'ended' && !snapshot.queue.length ? 'Add more music or press Start for another set.' : snapshot.queue.length ? 'Press Start set. Audio begins only after your click.' : 'Use the original demo sounds or add local MP3 and WAV files.';
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
  const canStart = !snapshot.current && (snapshot.state === 'ready' || snapshot.state === 'ended') && snapshot.queue.length >= 1 && index === snapshot.activeDeck;
  const canControl = onAir || canStart;
  elements.play.disabled = !canControl;
  elements.play.textContent = onAir && (snapshot.state === 'playing' || snapshot.state === 'transitioning') ? '❚❚' : '▶';
  elements.play.setAttribute('aria-label', onAir ? `${snapshot.state === 'paused' ? 'Resume' : 'Pause'} deck ${index === 0 ? 'A' : 'B'}` : `Start deck ${index === 0 ? 'A' : 'B'}`);
}

function render(snapshot) {
  renderParty(snapshot);
  renderHardware(snapshot);
  if (snapshot.activeDeck !== lastActiveDeck) setMobileDeck(snapshot.activeDeck);
  lastActiveDeck = snapshot.activeDeck;
  const playing = snapshot.state === 'playing' || snapshot.state === 'transitioning';
  const labels = { ready: 'STANDBY', playing: snapshot.autoMix && snapshot.queue.length ? 'AUTO MIX ON' : 'PLAYING', transitioning: 'TRANSITIONING', paused: 'PAUSED', ended: snapshot.queue.length ? 'STANDBY' : 'SET FINISHED' };
  ui.sessionStatus.textContent = labels[snapshot.state];
  ui.topCenter.classList.toggle('is-live', playing);
  ui.commandOverline.classList.toggle('is-live', playing);
  ui.footLed.classList.toggle('is-live', playing);
  const playableCount = snapshot.library.filter((track) => !track.unavailable).length;
  ui.trackCount.textContent = `${playableCount} TRACK${playableCount === 1 ? '' : 'S'}`;
  ui.queueCount.textContent = String(snapshot.queue.length);
  ui.panelQueueCount.textContent = String(snapshot.queue.length);
  renderDeadline(snapshot);
  ui.autoButton.setAttribute('aria-pressed', String(snapshot.autoMix));
  ui.autoLabel.textContent = snapshot.autoMix ? 'ON' : 'OFF';
  ui.protectButton.disabled = !snapshot.current || snapshot.transitioning;
  ui.protectButton.setAttribute('aria-pressed', String(snapshot.protectCurrent));
  ui.nextButton.disabled = snapshot.state !== 'playing' || !snapshot.queue.length || snapshot.transitioning;
  ui.transportButton.disabled = !snapshot.current && snapshot.queue.length < 1;
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
  button.title = label;
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
  ui.panelInstruction.textContent = mode === 'party' ? panelTab === 'queue' ? 'Move or remove songs before the next transition.' : 'Choose what plays next or add a song to the queue.' : loadTarget === null ? panelTab === 'queue' ? 'Move or remove tracks before the next deck locks.' : 'Load a track or add it to the running order.' : `Choose a track for Deck ${loadTarget === 0 ? 'A' : 'B'}.`;
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
        const label = mode === 'party' ? `${snapshot.current ? 'Play next' : 'Play first'}: ${track.title}` : `Load ${track.title} on Deck ${target === 0 ? 'A' : 'B'}`;
        const load = makeButton(mode === 'party' ? snapshot.current ? 'Play next' : 'Play first' : `Load ${target === 0 ? 'A' : 'B'}`, label, () => {
          const accepted = mode === 'party' && snapshot.current ? engine.selectNext(track.id) : engine.selectForDeck(track.id, target);
          if (accepted) closePanel();
          else showNotice('That deck is locked during this transition.', true);
        }, { className: 'primary', disabled: track.unavailable || isCurrent || snapshot.transitioning || snapshot.frozen || (!!snapshot.current && target === snapshot.activeDeck) });
        const add = makeButton(queued ? 'Queued' : 'Queue', `${queued ? 'Already queued' : 'Add to queue'}: ${track.title}`, () => { if (engine.enqueue(track.id)) ui.panelClose.focus(); }, { disabled: queued || isCurrent || track.unavailable });
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
        const load = makeButton(index === 0 && snapshot.preparedId === track.id ? 'Ready' : mode === 'party' ? 'Play next' : 'Load next', `${mode === 'party' ? 'Play' : 'Load'} ${track.title} next`, () => { void engine.selectNext(track.id); closePanel(); }, { className: 'primary', disabled: locked || (index === 0 && snapshot.preparedId === track.id && snapshot.preparedState === 'ready') });
        const up = makeButton('↑', `Move ${track.title} up`, () => movePanelQueue(track.id, track.title, -1), { className: 'square', disabled: locked || index === 0 });
        const down = makeButton('↓', `Move ${track.title} down`, () => movePanelQueue(track.id, track.title, 1), { className: 'square', disabled: locked || index === snapshot.queue.length - 1 });
        const remove = makeButton('×', `Remove ${track.title} from queue`, () => { if (engine.removeFromQueue(track.id)) ui.panelClose.focus(); }, { className: 'square', disabled: locked });
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
      engine.addTrack({ id: crypto.randomUUID(), title: file.name.replace(/\.(mp3|wav)$/i, ''), artist: 'Local file', duration, url, size: file.size, source: 'local', palette: palettes[engine.tracks.size % palettes.length] });
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
  ui.party.demoButton.disabled = true;
  ui.demoButton.textContent = 'Creating sounds…';
  try {
    for (const spec of demoSets) {
      sourceMessage = `Creating ${spec.title}…`;
      panelKey = '';
      render(engine.snapshot());
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blob = makeDemoWav(spec);
      engine.addTrack({ id: crypto.randomUUID(), title: spec.title, artist: spec.artist, duration: spec.duration, url: URL.createObjectURL(blob), size: blob.size, source: 'demo', palette: palettes[engine.tracks.size % palettes.length] });
    }
    ui.demoButton.textContent = 'Demo ready';
    ui.party.demoButton.textContent = 'Demo ready';
    sourceMessage = 'Four original demo sounds ready';
    showNotice('Four original demo sounds loaded. Press Start party.');
  } catch (error) {
    demoLoaded = false;
    ui.demoButton.disabled = false;
    ui.party.demoButton.disabled = false;
    ui.demoButton.textContent = 'Try demo';
    showNotice(`Could not create demo sounds: ${error.message}`, true);
  }
  panelKey = '';
  render(engine.snapshot());
}

function clearDemo() {
  const demos = [...engine.tracks.values()].filter((track) => track.source === 'demo');
  let removed = 0;
  for (const track of demos) if (engine.removeTrack(track.id)) removed += 1;
  demoLoaded = [...engine.tracks.values()].some((track) => track.source === 'demo');
  ui.demoButton.disabled = demoLoaded;
  ui.party.demoButton.disabled = demoLoaded;
  if (!demoLoaded) { ui.demoButton.textContent = 'Try demo'; ui.party.demoButton.textContent = 'Try demo'; }
  showNotice(removed ? `${removed} demo song${removed === 1 ? '' : 's'} removed.${demoLoaded ? ' The playing demo stays until it ends.' : ''}` : 'The playing demo stays until it ends.');
  partyKey = '';
  render(engine.snapshot());
}

function togglePlayback() {
  const snapshot = engine.snapshot();
  if (snapshot.state === 'paused') void engine.resume();
  else if (snapshot.state === 'playing' || snapshot.state === 'transitioning') engine.pause();
  else void engine.start();
}

ui.demoButton.addEventListener('click', () => void loadDemo());
ui.party.demoButton.addEventListener('click', () => void loadDemo());
ui.party.clearDemo.addEventListener('click', clearDemo);
ui.party.addButton.addEventListener('click', () => engine.snapshot().library.length ? openPanel('library') : ui.fileInput.click());
ui.party.importButton.addEventListener('click', () => ui.fileInput.click());
ui.party.queueAdd.addEventListener('click', () => openPanel('library'));
ui.party.search.addEventListener('input', () => { partyKey = ''; renderParty(engine.snapshot()); });
ui.party.openLibrary.addEventListener('click', () => openPanel('library'));
ui.party.openQueue.addEventListener('click', () => openPanel('queue'));
ui.partyModeButton.addEventListener('click', () => setMode('party'));
ui.studioModeButton.addEventListener('click', () => setMode('studio'));
ui.hardware.play.addEventListener('click', togglePlayback);
ui.hardware.mix.addEventListener('click', () => void engine.mixNext());
ui.hardware.skip.addEventListener('click', () => void engine.skipNext());
ui.hardware.demo.addEventListener('click', () => void loadDemo());
ui.hardware.library.addEventListener('click', () => openPanel('library'));
ui.hardware.queue.addEventListener('click', () => openPanel('queue'));
ui.hardware.reset.addEventListener('click', () => hardwareStage.resetView());
ui.hardware.effects.addEventListener('click', () => { const reduced = ui.hardware.effects.getAttribute('aria-pressed') !== 'true'; ui.hardware.effects.setAttribute('aria-pressed', String(reduced)); hardwareStage.setReducedEffects(reduced); });
ui.hardware.controlsToggle.addEventListener('click', () => { ui.hardware.controls.hidden = !ui.hardware.controls.hidden; ui.hardware.controlsToggle.setAttribute('aria-expanded', String(!ui.hardware.controls.hidden)); if (!ui.hardware.controls.hidden) ui.hardware.controlsClose.focus(); });
ui.hardware.controlsClose.addEventListener('click', () => { ui.hardware.controls.hidden = true; ui.hardware.controlsToggle.setAttribute('aria-expanded', 'false'); ui.hardware.controlsToggle.focus(); });
ui.hardware.volume.addEventListener('input', () => engine.setVolume(Number(ui.hardware.volume.value) / 100));
ui.hardware.crossfader.addEventListener('input', () => { if (engine.autoMix) setMode('studio'); engine.setCrossfader(Number(ui.hardware.crossfader.value)); });
for (const event of ['change', 'pointerup', 'keyup', 'blur']) ui.hardware.crossfader.addEventListener(event, () => engine.releaseCrossfader());
ui.hardware.decks.forEach((deck, index) => {
  deck.load.addEventListener('click', () => openPanel('library', index));
  deck.play.addEventListener('click', () => void engine.playDeck(index));
  deck.cue.addEventListener('click', () => engine.cueDeck(index));
  deck.channel.addEventListener('input', () => engine.setChannelGain(index, Number(deck.channel.value) / 100));
  for (const band of ['low', 'mid', 'high']) deck[band].addEventListener('input', () => engine.setEq(index, band, Number(deck[band].value)));
  deck.filter.addEventListener('input', () => engine.setFilter(index, Number(deck.filter.value) / 100));
});
ui.party.play.addEventListener('click', togglePlayback);
ui.party.mix.addEventListener('click', () => void engine.mixNext());
ui.party.skip.addEventListener('click', () => void engine.skipNext());
ui.party.auto.addEventListener('click', () => engine.setAutoMix(!engine.autoMix));
ui.party.volume.addEventListener('input', () => engine.setVolume(Number(ui.party.volume.value) / 100));
ui.partyView.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); ui.partyView.dataset.drop = 'true'; });
ui.partyView.addEventListener('dragleave', (event) => { if (!ui.partyView.contains(event.relatedTarget)) ui.partyView.dataset.drop = 'false'; });
ui.partyView.addEventListener('drop', (event) => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); ui.partyView.dataset.drop = 'false'; void addLocalFiles(event.dataTransfer.files); });
$('#hardware-view').addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
$('#hardware-view').addEventListener('drop', (event) => { if (![...event.dataTransfer.types].includes('Files')) return; event.preventDefault(); void addLocalFiles(event.dataTransfer.files); });
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
window.addEventListener('pagehide', () => { waveform.dispose(); hardwareWaveforms.forEach((view) => view.dispose()); hardwareStage.dispose(); engine.dispose(); });

ui.panel.inert = true;
setMobileDeck(0);
setMode('party');
engine.subscribe(render);
