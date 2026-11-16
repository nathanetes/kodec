# Kodec

A creative effect engine for type and photos, and the graphics side of [Atlas CRT](https://atlas-crt.nathanetes.com). Set words or open a picture, run it through scan drag, warps, ink edges, stipple, halftone, grain, glow and color, and save a PNG that keeps its transparent background.

It runs entirely in the browser: open `index.html` from any static server. Nothing is uploaded.

## What's in it

- **Source**: text set in any font on the computer or a font file you load (weight, tracking, width, slant, outline), or a photo or video. Scale, position and rotation on a canvas of any shape, up to 6000 px.
- **Scan Drag**: the page moved while the scanner was reading it.
- **Warp**: flow, liquid, waves, ripple, swirl, mirror fold, pinch, arch and squeeze.
- **Ink & Edge**: ink spread and choke, rough photocopy edges, soft edges, misregistration.
- **Color**: pre grade, grade, split toning, gradient maps, channel mixer, burn, iridescence, light leaks.
- **Stipple & Print**: stipple, screen print, halftone screens (dots, lines, diamonds, squares) and dither.
- **Screen, Glow, Grain & Texture**: scanlines that can cut through the shape, a phosphor grid, glow, film grain, dust, paper fibre and toner.
- **Glitch**: four slots, including Erase, which cuts bands out of the picture.
- **Transparency**: clear the light or dark areas so only the ink is left.
- Every slider can be animated with keyframes or an LFO, looks can be saved, exported and imported, and the timeline exports as video.

## Where it came from

The interface (controls, timeline, history, settings, exporter) and many of the effects are Atlas CRT's, carried over to a new engine that keeps transparency through every pass. The two are separate apps with separate saved looks.

Files: `src/shaders.js` (the effects), `src/engine.js` (the passes), `src/params.js` (controls and factory looks), `src/source.js` (the Source tab and the type setter), `src/app.js` (the loop), and Atlas's panels in `rack.js`, `timeline.js`, `automation.js`, `history.js`, `settings.js`, `export.js` and `mp4.js`.
