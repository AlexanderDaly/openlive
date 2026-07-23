# OpenLive

[![CI](https://github.com/AlexanderDaly/openlive/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexanderDaly/openlive/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Issues](https://img.shields.io/github/issues/AlexanderDaly/openlive)](https://github.com/AlexanderDaly/openlive/issues)

**OpenLive — a free, open-source, browser-based DAW inspired by Ableton Live.**

No installs, no accounts, no audio files to manage: OpenLive runs entirely in
your browser and synthesizes every sound in real time with
[Tone.js](https://tonejs.github.io/). It ships with a seeded demo project
(4 tracks, 9 clips, scenes A/B/Break, a 16-bar arrangement at 124 BPM) so you
can press play the second it loads.

## Features

- **Session View** — Ableton-style clip-launching grid. Launch individual
  clips or whole scenes; launches are quantized to the next bar boundary.
  Create, rename, recolor, and delete clips inline.
- **Arrangement View** — horizontal timeline with a bar ruler, per-track
  lanes, clip move/resize, a zoomable playhead with auto-scroll, and a
  drag-to-mark loop region on the ruler.
- **Mixer** — vertical channel strips per track plus a master strip:
  volume faders, pan knobs, mute/solo (Ableton-style solo-in-place),
  per-track FX sends, and live post-fader level meters.
- **Step sequencer / piano roll** — clip detail editor. Drum clips get a
  classic step grid; melodic clips get a two-octave mini piano roll with
  scale highlighting, drag-to-paint, velocity cycling, and a velocity lane.
- **Drum Rack** — 4×4 pad grid for drumkit tracks (kick / snare / clap /
  closed hat / low tom / open hat / high tom). Pads flash on playback,
  audition on click, and record-toggle notes into the selected clip.
- **FX chain** — per-track filter, reverb, and delay sends, editable from
  both the mixer and the device rack.
- **Live audition** — drum pads, step-sequencer cells, and piano-roll notes
  preview through the track's real FX chain when you click them.

## Tech stack

- **React 19 + TypeScript + Vite** — UI and tooling
- **Tailwind CSS + shadcn/ui** — styling and primitives
- **Tone.js** — Web Audio synthesis, transport, and scheduling
- **zustand** — single source of truth for project state

Architecture note: state flows one way — UI calls **store actions**, and the
audio engine **subscribes to the store** and syncs itself. Feature code never
touches Tone.js directly; it only uses the engine's small public API
(`ensureStarted`, `previewNote`, meters, transport position).

## Quickstart

```bash
npm install
npm run dev
```

Then open the printed URL (default <http://localhost:5173>). Audio starts on
your first click — that's the browser's autoplay policy, press the ▶ button.

Other scripts:

```bash
npm run build    # type-check + production build
npm run lint     # eslint
npm run preview  # serve the production build
```

## Keyboard / interaction cheat sheet

| Context            | Action                                   |
| ------------------ | ---------------------------------------- |
| Transport          | ▶ Play / ■ Stop (first click unlocks audio) |
| Session View       | Click clip ▶ to launch (bar-quantized); click again to stop |
| Session View       | Double-click a clip or scene name to rename |
| Session View       | Click empty slot to create a clip; hover a clip for ✕ to delete |
| Arrangement View   | Drag on the bar ruler to mark a loop region; click ruler to clear |
| Arrangement View   | Select a clip block, then `Delete` / `Backspace` to remove it |
| Arrangement View   | Toolbar ＋/− to zoom the timeline |
| Step grid / piano roll | Left-click toggles a note; drag paints; shift-click / right-click cycles velocity |
| Drum Rack          | Click a pad to audition + record-toggle it into the selected clip |
| Mixer / faders / knobs | Drag to adjust; double-click resets to default |

## Roadmap / contributing

OpenLive is early and welcoming contributions. Planned directions:

- **MIDI in** — play and record from a hardware controller (Web MIDI API)
- **Audio tracks** — record/import real audio alongside the synth tracks
- **Samples** — sample-based drum kits and a sample browser
- **Plugin FX** — a proper device chain with reorderable, automatable FX
- **Save / load projects** — export/import project JSON, local persistence
- **PWA** — installable, offline-capable app shell

Tracked shortfalls live in [`SHORTFALLS.md`](./SHORTFALLS.md) and sync to
GitHub Issues automatically. See [`CONTRIBUTING.md`](./CONTRIBUTING.md),
[`DEVLOG.md`](./DEVLOG.md), and `src/features/CONTRACT.md`.

To contribute: fork, branch, and open a PR. Keep the one-way store→engine
sync contract intact, match the dark palette, and ensure `npm run build` passes.

## License

MIT — free to use, modify, and share.
