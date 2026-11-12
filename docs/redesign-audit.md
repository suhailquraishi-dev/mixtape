# Mixtape redesign audit

The repository is a buildless HTML/CSS/JavaScript app. `src/audio-engine.js` owns the queue, two media elements, Web Audio gain/analyser graph, automatic 15/10/5-second scheduling, equal-power transitions, pause/resume, and one-mix crossfader takeover. `src/app.js` owns DOM rendering and local file import. Demo PCM WAVs are generated in `src/demo-audio.js`; `src/timing.js` holds timing math. `npm run check` runs syntax and timing tests.

The current console plays real demo and local WAV audio, rejects corrupt files, and lets the host manually load, mix, and reorder. Its default full-deck layout obscures the simple start flow. It requires two tracks to begin, has no file-derived waveform, no drag/drop, and no always-visible desktop library or queue. The audio engine can be reused without a framework migration.

This branch adds a simple Party Mode around the same engine, keeps the current console as Studio Mode, permits a one-track set, adds real file-derived waveform peaks and queue drag/drop, and shares all transport and queue state across modes. Manual browser checks verified that switching modes did not interrupt active audio.
