# Mixtape redesign handoff

This records the earlier Party Mode iteration. The current default experience and verification are documented in [the 3D console handoff](3d-console-handoff.md).

## Review target

- Branch: `feat/mixtape-party-mode-redesign`
- Base: `main` at `39157d3`
- Pull request: https://github.com/suhailquraishi-dev/mixtape/pull/1
- Vercel preview: https://mixtape-git-feat-mixtape-p-0fb0e9-suhailquraishi-5594s-projects.vercel.app/
- Run locally: `npm start`, then open `http://localhost:8000`

## What changed

- `index.html`, `styles.css`, and `src/app.js` add the default Party Mode: a visible music library, now-playing view, queue, real transport, AutoMix controls, and responsive mobile panels. The prior console remains available as Studio Mode, with mode switching tied to one playback engine.
- `src/audio-engine.js` adds single-song playback, queue reorder/removal, and a short-fade Skip action while retaining the existing real two-deck equal-power transition.
- `src/waveform.js` renders peaks decoded from the selected local file, with a truthful fallback for files that cannot be previewed or exceed 24 MB.
- `test/audio-engine.test.js`, `test/waveform.test.js`, and `package.json` add queue, fader, waveform, and syntax checks. `README.md` documents controls and local-file privacy.

## Verification

- `npm run check`: 5 tests passed; all JavaScript syntax checks passed.
- `git diff --check`: passed.
- Browser checks: demo loading, one-song playback, local MP3 and WAV imports and playback, MP3-to-WAV automatic transition, Mix Now, Skip, queue reorder with drag and keyboard controls, mode switching during playback, corrupt-file rejection, and queue exhaustion. Switching to Studio and back retained elapsed playback.
- Layout checked at 1440×900, 1366×768, 1024×768, and 390×844. Party Mode and the mobile Studio view had no document overflow; narrow-screen library and queue panels remained reachable.
- Short manual audio sequences were tested. The requested uninterrupted 30-minute playlist smoke test was **not completed**; long-run silence, gain, and source-lifecycle behavior remains to be checked before production promotion.
- Vercel preview opened successfully after deployment; four demo tracks loaded and Start party entered live playback.

## Screenshots

See [`screenshots/`](screenshots/) for desktop and mobile empty, loaded, playing, and transitioning states. `loaded-laptop.jpg` and `studio-mobile.jpg` show intermediate and advanced layouts.

## Current limits

- Library and queue live only in the open tab. Music remains on the host device; no uploaded files, accounts, streaming services, saved sessions, beatmatching, or key analysis are implemented.
- File-derived waveform preview is capped at 24 MB to limit decoding work. Playback may still work for a larger file supported by the browser.
- The Studio decks retain their earlier compact console presentation; their controls use the same real audio graph, but Studio-specific waveforms and full deck-level redesign are a later milestone.
