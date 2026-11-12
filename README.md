# Mixtape

Mixtape is a browser-based party music player. **Party Mode** is the default: add local music, see what is playing and what comes next, and let AutoMix keep the set moving. **Studio Mode** reveals the two decks and crossfader for hosts who want more control. Switching modes does not restart playback.

## Run

```powershell
npm start
```

Open `http://localhost:8000`. Use **Add music** to select multiple MP3 or PCM WAV files, drag files onto Party Mode, or choose **Try demo** for four original synthesized songs. A single song can play normally. Add at least two for continuous transitions.

## Controls

- **Start party**, **Pause**, and **Resume** control actual local audio. **Mix now** fades into the first queued song. **Skip** advances with a short fade.
- AutoMix prepares the next song at 15 seconds remaining, locks the choice at 10 seconds, and begins a real equal-power crossfade with up to 5 seconds remaining. Turning AutoMix off lets the current song finish without an automatic transition.
- The library shows file-derived names and durations. Search it, add played songs back to the queue, or remove demo tracks with **Clear demos**. Reorder the queue by dragging a song or using its labeled up/down buttons.
- The waveform is calculated from the selected audio file and advances with real playback time. Files larger than 24 MB or files the browser cannot decode still play when supported, but show a truthful unavailable preview.
- Studio Mode uses the same queue and audio engine. Its deck load buttons, transport, master volume, and overlap crossfader control the real audio graph.

## Privacy and scope

Music stays on the host device. The app uses browser object URLs and does not upload local audio. Library and queue state last only for the current tab; reloading clears them. There is no account, streaming catalogue, beatmatching, key analysis, or saved session yet.

## Development

The app is plain HTML, CSS, and JavaScript without a build step or production dependencies. `src/audio-engine.js` owns playback and queue state; `src/app.js` renders both modes from its snapshots. `src/waveform.js` computes file-derived waveform peaks. `src/demo-audio.js` generates original WAV demo tracks. Run `npm run check` for syntax and unit tests.

See [the redesign audit](docs/redesign-audit.md) and [review screenshots](docs/screenshots/).
