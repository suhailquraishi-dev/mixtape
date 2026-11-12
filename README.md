# Mixtape

Mixtape is a browser DJ console for your own music. Its default view is one interactive 3D controller with two decks and a mixer. **AutoMix DJ** and **Manual DJ** operate the same audio engine, so switching modes keeps the set playing.

## Run

```powershell
npm start
```

Open `http://localhost:8000`. Import local MP3 or PCM WAV files with **Add music**, drop files onto the console, or choose **Try demo** for four original synthesized songs. Use **Music library** to load a specific deck or add a song to the queue. The library and queue scroll inside a panel; the main console stays on one screen.

## Play

- In **AutoMix DJ**, press **Start AutoMix**. The queue plays in order. The next track is prepared at 15 seconds remaining, locked at 10 seconds, and blended with an equal-power fade near the end. **Mix now** starts the next transition early; **Skip** uses a short fade. The crossfader animates with the real audio transition.
- In **Manual DJ**, use either deck's Play and Cue controls, jog wheels for coarse seeking, channel faders, crossfader, three-band EQ, low-pass filters, and master volume. These controls change the actual sound. **Mix now** completes a blend from the current crossfader position if both decks are playing.
- During an automatic transition, moving the crossfader takes control of that fade. Releasing it lets the fade complete smoothly. A transport or fader action on the 3D controller enters Manual DJ where needed.
- The **Mixer controls** sheet provides keyboard-accessible sliders equivalent to the 3D faders and knobs. The deck strip provides accessible transport and load buttons. **Reduced effects** lowers rendering cost; **Reset view** restores the camera.

The waveforms come from the selected audio files, and the meters respond to the audio signal. The device screens, jogs, faders, and lights follow the same playback snapshot as the 2D controls.

## Privacy and current scope

Music stays on the host device. The app uses browser object URLs and does not upload local audio. Library and queue state last only for the current tab. There is no account or streaming catalogue. AutoMix currently uses timed fades; it does **not** perform beatmatching, key or phrase analysis, or loudness normalization. A long listening and soak test is still needed before production promotion.

## Development

The app is plain HTML, CSS, and JavaScript without a build step. `src/audio-engine.js` owns playback and queue state; `src/app.js` renders one shared snapshot; `src/render3d/controller.js` builds the original procedural Three.js console. The vendored Three.js module is MIT licensed; see [`vendor/THREE-LICENSE.txt`](vendor/THREE-LICENSE.txt). `src/waveform.js` computes file-derived peaks. `src/demo-audio.js` generates the demo WAV files. Run `npm run check` for syntax and unit checks.

See [the 3D console handoff](docs/3d-console-handoff.md) for verification and remaining work, and [screenshots](docs/screenshots/) for the visual review.
