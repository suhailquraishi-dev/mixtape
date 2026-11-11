# AutoMix Party

A single-screen, two-deck DJ console for hosting a continuous music set. The console fills the browser viewport. The library and queue open in a panel that scrolls independently.

## Run it

```powershell
npm start
```

Open `http://localhost:8000`. Load the four original demo sounds or add local MP3/PCM WAV files, then press **Start set**. Audio begins after a user click.

## Playing a set

- The top strip shows when to load the next track. If you do nothing, AutoMix prepares the first eligible queued track when the current track has 15 seconds left. The next choice locks at 10 seconds and an equal-power fade starts with up to 5 seconds left.
- **Load A/B** opens the library to choose a deck. A manually loaded next track takes priority over the queue's previous first track. The queue panel lets you reorder or remove tracks before it locks.
- **Mix next** starts a transition immediately. During an overlap, the crossfader controls the two deck gains; releasing it lets the smooth fade finish from that position.
- **AutoMix OFF** stops automatic loading and transitions. The current track ends normally. You can still use Mix next.
- Pause freezes the playback countdown and any active transition. Master level adjusts output volume.

At narrow widths, the Deck A and Deck B tabs switch the visible deck while playback and AutoMix controls stay on screen. The visible tab follows the active deck after a transition.

## Current scope

- Audio plays only on the host device. Local audio is read through browser object URLs and is not uploaded.
- Demo sounds are synthesized in the browser. They are not a commercial music catalogue.
- The library, queue, and set are temporary browser-tab state. Refreshing the page stops audio and clears them.
- Guest rooms, requests, saved sessions, track analysis, loudness normalization, beat alignment, and provider integrations are future work.

## Implementation

The app uses plain HTML, CSS, and JavaScript without a build step or external JavaScript dependencies. `src/audio-engine.js` owns playback and exposes a single snapshot to `src/app.js`. Web Audio routes two `HTMLAudioElement` decks through separate gain and analyser nodes to a master gain. `src/demo-audio.js` generates PCM WAV demo tracks; `src/timing.js` holds countdown and fade math. Run `npm run check` for syntax and timing checks.
