# Mixtape UI and typography refinement

## Type audit and selection

The previous console mixed Space Grotesk and DM Sans in the DOM, system monospace for data, and Arial on 3D canvas textures. Several functional labels were 8–10px, while timers and title sizes varied between the deck ribbon, hardware screens and music panel.

The [rendered comparison](type-study.png) uses the same Mixtape tracks, BPM, timers, queue, controls and 3D-screen labels at working sizes. Its [HTML source](type-study.html) can be opened to inspect the live fonts.

| System | Readability | Hardware character | Decision |
| --- | --- | --- | --- |
| IBM Plex Sans Condensed + Sans + Mono | Clear mixed-case titles and stable tabular numerals | Precise, understated, coherent across hardware and DOM | **Selected** |
| Space Grotesk + DM Sans + Roboto Mono | Clear titles and controls | Familiar application feel, weaker hardware identity | Replaced |
| Barlow Condensed + Barlow + Roboto Mono | Compact labels | Strong broadcast feel, but crowded in mixed-case metadata | Not selected |

The selected faces are one IBM Plex superfamily: Condensed 600 for physical labels and the wordmark, Sans 400–700 for tracks and controls, and Mono 500/600 for changing data. `refinement.css` defines role-based font, size, color and surface tokens. Latin WOFF2 files are self-hosted in `assets/fonts/`, loaded with `font-display: swap`, and covered by [IBM's SIL Open Font License](../../assets/fonts/OFL-LICENSE.txt). Non-Latin names use the browser fallback stack until broader script subsets are added.

## UI changes

- Enlarged the controller at desktop widths while keeping the full device visible. The fixed-stage layout and the audio engine are unchanged.
- Aligned the deck ribbon, transport dock and panel to a common scale. Timers and counters use tabular numerals. Track names, metadata and control labels have distinct roles.
- Replaced the previous lime panel emphasis with bone, charcoal and muted deck A/B accents. Buttons, sheets and track rows use restrained raised-surface treatment rather than dashboard cards or glow.
- Sharpened canvas labels and deck displays with high-resolution Plex text, anisotropic texture filtering and redraw after the fonts load.
- Added physical press travel to 3D transport buttons, drag emphasis on knobs and faders, and exact values in hover/drag tooltips. Canceled pointer gestures no longer activate a button.
- Added reversible, reduced-motion-aware button press feedback. The mixer sheet has a sticky Close control and internal scrolling on narrow screens.

## Visual review

| Size | Before | After |
| --- | --- | --- |
| 1440×900 | [Desktop baseline](before-desktop.png) | [Refined desktop](after-desktop.png) |
| 390×844 | [Mobile baseline](before-mobile.png) | [Refined mobile](after-mobile.png) |

Additional review: [1024px tablet](after-tablet.png), [mobile music panel](after-mobile-library.png), and [mobile mixer sheet](after-mobile-mixer.png).

## Verification

- Playwright browser checks at 1440×900, 1366×768, 1024×768, 390×844 and 320×700 found `document.scrollWidth/Height` equal to the viewport, with no overflow in the ribbon or dock.
- The mobile library and the mixer sheet remained reachable. The mixer sheet scrolled internally and kept its Close button visible.
- The physical Deck A Play button started real playback. Dragging the physical Deck A high EQ knob changed the accessible slider to 7 dB. Browser diagnostics reported no errors or warnings.
- Key text combinations on the new surfaces were measured above 9:1 contrast; disabled states are intentionally subdued.
- `npm run check` and `git diff --check` pass. This pass did not modify `src/audio-engine.js`.

The controller remains procedural 3D hardware. This pass refines its visible materials, text and interactions; it does not add beat-aware mixing or change the shared Manual DJ/AutoMix behavior.
