# AutoMix Party

First working audio prototype for AutoMix Party PRD v0.1.

## Run it

Serve this folder, then open it in a current desktop browser:

```powershell
npm start
```

Open `http://localhost:8000`, load the original demo sounds or choose at least two local MP3/PCM WAV files, and press **Start party**. Audio begins only after that click. The current track automatically overlaps the next with an equal-power fade of up to five seconds, shortened for very short tracks. You can pause/resume, adjust volume, mix next, let the current song finish, and reorder or remove upcoming tracks.

## Current scope

- Audio plays only on the host device. Local audio is read through browser object URLs and is not uploaded.
- Demo sounds are synthesized in the browser and are not a commercial music catalogue.
- The queue and setup are temporary browser-tab state. Refreshing the page stops audio and clears them.
- Guest rooms, requests, saved sessions, track analysis, loudness normalization, beat alignment, and provider integrations are not implemented yet.
- This prototype is for validating the host experience and basic real transitions; it is not a private-pilot-ready product.

## Implementation

The app uses plain HTML, CSS, and JavaScript. Web Audio routes two `HTMLAudioElement` decks through separate gain nodes to a master gain. Transition gain follows equal-power sine/cosine curves. The browser reads local files directly, while the four demo tracks are generated as PCM WAV blobs in `src/app.js`. No build or external JavaScript dependencies are required. The font falls back to system sans serif when Google Fonts is unavailable.
