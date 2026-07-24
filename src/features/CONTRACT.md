# OpenLive — Feature Agent Contract

Foundation is done. The store, audio engine and app shell are **fixed APIs**.
Each feature agent owns exactly ONE folder and must never edit files outside it.

## Ownership boundaries

| Agent        | Owns (and only this)                | Mounted as                          |
|--------------|-------------------------------------|-------------------------------------|
| Session      | `src/features/session/`             | `<SessionView/>` center (session)   |
| Arrangement  | `src/features/arrangement/`         | `<ArrangementView/>` center (arr.)  |
| Mixer        | `src/features/mixer/`               | `<MixerPanel/>` right rail          |
| Editor       | `src/features/editor/`              | `<ClipEditor/>` bottom detail       |
| Devices      | `src/features/devices/`             | `<DeviceRack/>` bottom detail       |

Rules:

- **Keep the default export** in your mounted file; App.tsx imports it by name path.
- **Do not edit** `src/types/daw.ts`, `src/store/projectStore.ts`, `src/audio/engine.ts`,
  `src/App.tsx`, `src/components/*`, or another feature's folder.
- The store/engine API is fixed. If something is missing, work around it inside your folder.
- `npm run build` must stay green (strict TS, `noUnusedLocals`, `verbatimModuleSyntax` — use `import type`).
- UI: dark Ableton-style. Surfaces `#1a1a1a`–`#2b2b2b`, borders `#333`/`neutral-800`,
  accent `#ff8c2e` (orange/amber). No gradients. shadcn/ui components live in `@/components/ui`.

## Store — `@/store/projectStore`

```ts
import { useProjectStore } from '@/store/projectStore';
const bpm = useProjectStore((s) => s.bpm);            // subscribe to a slice
const launchClip = useProjectStore((s) => s.launchClip); // actions are stable
```

Types (import with `import type { ... } from '@/types/daw'`):
`TrackType`, `InstrumentKind` ('drumkit' | 'bass' | 'keys'), `ViewMode`, `FxParam`,
`NoteEvent` (step, note, velocity 0..1, duration? in steps), `Clip`, `ArrangementClip`,
`TrackFx`, `Track`, `Scene`, `ProjectContent` (the serializable slice),
`ProjectState`. `STEPS_PER_BAR = 16`.

State: `bpm`, `isPlaying`, `metronome`, `swing` (0..0.6), `view` ('session' | 'arrangement'),
`loop: { startBar, lengthBars } | null` (arrangement transport loop),
`masterVolume` (0..1, master output gain),
`tracks: Track[]`, `clips: Record<string, Clip>` (clip pool),
`sessionMatrix: Record<trackId, (clipId | null)[]>`, `scenes: Scene[]`,
`arrangementClips: ArrangementClip[]`,
`playingClipByTrack: Record<trackId, clipId | null>` (max ONE playing clip per track),
`selectedClipId`.

Actions:
- Tracks: `addTrack(init?) → id`, `removeTrack`, `renameTrack`, `setVolume` (0..1),
  `setPan` (-1..1), `toggleMute`, `toggleSolo`, `setFxParam(trackId, 'reverb'|'delay'|'filterFreq', v)`
- Clips: `createClip(trackId, slotIndex?, init?) → id`, `deleteClip`, `updateClipNotes`,
  `renameClip`, `setClipColor`, `selectClip`, `setSlot(trackId, slotIndex, clipId | null)`
- Launching: `launchClip(trackId, clipId)` (quantized to next bar by the engine,
  replaces the track's current clip), `stopTrackClip`,
  `launchScene(sceneIndex)` (reads **session matrix row** — null slots stop that track),
  `stopAllClips`, `addScene(name?) → index`, `renameScene(index, name)`
- Arrangement: `addToArrangement(clipId, trackId, startBar, lengthBars) → id`,
  `moveArrangementClip(id, startBar, trackId?)`, `resizeArrangementClip`, `removeArrangementClip`
- Transport: `setBpm`, `setSwing`, `togglePlay`, `toggleMetronome`, `setView`,
  `setLoop({ startBar, lengthBars } | null)` (engine applies only in arrangement view),
  `setMasterVolume` (0..1)
- Project lifecycle: `loadProject(content: ProjectContent)` (replace everything,
  stops playback), `resetToDemo()` — normally driven by the foundation's
  TransportBar / persistence module, not by feature folders.

Foundation-owned store modules (do NOT reimplement in features):
`@/store/persistence` (project JSON + localStorage autosave) and
`@/store/history` (undo/redo). Both subscribe to the store like the engine.

Before playback the audio context must be unlocked from a user gesture:
`await engine.ensureStarted()` (TransportBar already does this on play; the
SessionView launch buttons chain it and then start the transport if stopped).

## Engine — `@/audio/engine`

```ts
import { engine } from '@/audio/engine';
```

The engine **subscribes to the store** — you never call it to make sound.
Read-only API you may use:

- `engine.ensureStarted(): Promise<void>` — unlock audio (user gesture only)
- `engine.getTrackMeter(trackId): Tone.Meter | undefined` — post-fader, `normalRange: true`;
  read with `meter.getValue()` inside `requestAnimationFrame`. Undefined until first `ensureStarted()`.
- `engine.getMasterMeter(): Tone.Meter | undefined`
- `engine.getTransportPosition(): string` — `'bars:beats:sixteenths'` while playing
- `engine.isStarted(): boolean`

Notes for everyone:

- Drumkit note map: `'C1'` kick, `'D1'` snare, `'E1'` clap, `'F#1'` closed hat,
  `'G1'` low tom, `'A1'` open hat, `'B1'` high tom. Everything else is a pitched note
  (`'A1'`, `'C4'`, `'F#3'`, …) for `bass` (mono) and `keys` (poly) instruments.
- Clip timing is step-based; a 1-bar clip has `lengthSteps: 16`. Note `duration` is in steps.
- Launching is bar-quantized automatically; scenes are pre-wired (A / B / Break).
- Arrangement playback works when `view === 'arrangement'` and transport plays; the engine
  reads `arrangementClips` live — edits sound immediately.
