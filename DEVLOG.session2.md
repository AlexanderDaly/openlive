<!-- MERGE NOTE: Your local DEVLOG.md was edited while this session ran, and the
     sync bridge would not let me read the newer copy — so rather than overwrite
     your edits, this session-2 version was saved alongside as DEVLOG.session2.md.
     Merge the "session 2" entry, roadmap ticks, and table rows into DEVLOG.md,
     then delete this file. -->

# OpenLive — Devlog / Personal Bible

Working notes for humans (and future agents) hacking on this repo.
Read this before changing architecture. Update it when you land non-trivial work.

---

## 0. What this is

**OpenLive** — free, open-source, browser DAW inspired by Ableton Live.

- No installs, no accounts, no sample files.
- Every sound is synthesized in real time with **Tone.js**.
- Ships with a seeded demo project (4 tracks, 9 clips, scenes A/B/Break, 16-bar arrangement @ 124 BPM, key of A minor).

Stack: React 19 · TypeScript · Vite · Tailwind · shadcn/ui · Tone.js · zustand.

---

## 1. Architecture bible (do not break)

```
UI  ──calls actions──▶  zustand store  ──subscribe──▶  audio engine
                              ▲                              │
                              └──── getState() reads ────────┘
```

### Hard rules

1. **Store is the single source of truth** (`src/store/projectStore.ts`).
2. **Engine never writes the store.** It only `subscribe`s and `getState()`.
3. **Feature UI never touches Tone.js directly.** Allowed engine API only:
   - `engine.ensureStarted()` — user gesture unlock
   - `engine.previewNote(trackId, note, velocity?)` — one-shot note audition
   - `engine.previewClip(clipId)` — one-shot clip audition, transport-free (WS2 #43)
   - `engine.getTrackMeter(id)` / `engine.getMasterMeter()`
   - `engine.getTransportPosition()` / `engine.getTransportStep()` / `engine.isStarted()`
4. **Timing is in Transport ticks** (`"Ni"`), not seconds — BPM changes mid-play stay correct.
5. **Contract file:** `src/features/CONTRACT.md` + types in `src/types/daw.ts`.

### Folder ownership

| Path | Owns |
|------|------|
| `src/types/daw.ts` | Domain model (shared contract, incl. `ProjectContent`) |
| `src/store/projectStore.ts` | State + actions + demo seed |
| `src/store/persistence.ts` | Project JSON files + localStorage autosave |
| `src/store/history.ts` | Undo/redo snapshots (content slice only) |
| `src/audio/engine.ts` | Tone.js singleton |
| `src/lib/instruments.ts` | Instrument metadata for browser↔shell add-track |
| `src/components/*` | App shell (Transport, Browser, Detail) |
| `src/features/session/` | Session clip grid |
| `src/features/arrangement/` | Timeline |
| `src/features/mixer/` | Channel strips |
| `src/features/editor/` | Step seq / piano roll |
| `src/features/devices/` | Drum rack, synth macros, FX |

`persistence` and `history` follow the engine's pattern: they `subscribe` to
the store and call public actions — they never reach into features, and
features never reimplement them.

### Drum note map (engine + editor must match)

| Note | Voice |
|------|-------|
| C1 | Kick |
| D1 | Snare |
| E1 | Clap |
| F#1 | Closed hat |
| G1 | Low tom |
| A1 | Open hat |
| B1 | High tom |

Melodic: standard pitch names (`A1`, `C4`, `F#3`, …). Instruments: `drumkit` | `bass` (mono) | `keys` (poly).

### Playback modes

- **Session:** `Tone.Part` per launched clip, looped, bar-quantized launch (`@1m`).
- **Arrangement:** 16n scheduleRepeat walks `arrangementClips` and triggers notes live.
- **Loop region:** store `loop: { startBar, lengthBars } | null` → Tone.Transport loop **only when `view === 'arrangement'`**.

---

## 2. Commands

```bash
npm install
npm run dev       # http://localhost:3000 — audio unlocks on first click
npm run build     # tsc -b && vite build  (must stay green)
npm run lint      # eslint .  (now fully clean — keep it that way)
npm test          # vitest — store / noteUtils / persistence / history
npm run preview   # serve dist/
```

Gate = **build + lint + test all clean**.

---

## 3. Session log

### 2026-07-23 — Init, review, bugfix, ASCII wave

#### Git

- Repo was not a git repo → `git init` on `main`.
- Needed `safe.directory` exception (filesystem without ownership).

#### Code review findings (summary)

| Severity | Issue | Status |
|----------|-------|--------|
| High | Step-grid drag-paint lost notes (stale `clip.notes` closure) | **Fixed** |
| High | Arrangement loop was cosmetic only | **Fixed** |
| High | “Add Scene” didn’t create launchable scenes | **Fixed** |
| Med | Shared MembraneSynth for both toms | **Fixed** |
| Med | Reverb IR not generated | **Fixed** |
| Med | Session “playing” ring stayed green while stopped | **Fixed** (UI) |
| Med | Pan label used ×50 instead of ×100 | **Fixed** |
| Low | package name `my-app` | **Fixed** → `openlive` |
| — | No unit tests, npm audit highs on Vite/Rollup/PostCSS | Open |
| — | Browser instruments are non-drag (hints only) | Open / roadmap |

#### Fixes landed

**Store / types** (`daw.ts`, `projectStore.ts`)

- `loop` + `setLoop({ startBar, lengthBars } | null)`.
- `addScene(name?) → index`, `renameScene(index, name)`.
- `launchScene` now reads **session matrix row** (source of truth). Null slot → stop that track.
- `addScene` extends **all** tracks’ matrices and appends a real `Scene`.

**Engine** (`audio/engine.ts`)

- `applyLoop(state)` → Tone.Transport loopStart/End; disabled outside arrangement.
- Separate `lowTom` / `highTom` voices.
- `void reverb.generate()` on chain build.

**Editor** (`noteUtils.ts`, `DrumGrid.tsx`, `MelodicGrid.tsx`)

- `patchClipNotes(clipId, mutate)` / `hasClipNote` always read **fresh** `getState()`.
- Paint/toggle/velocity use those helpers → no more dropped notes mid-drag.

**Session** (`SessionView.tsx`)

- Uses `addScene` / `renameScene`.
- Playing ring = `isTransportPlaying && playingId === clip.id` (launched clips still resume on Play).

**Arrangement** (`ArrangementView.tsx`)

- Loop UI writes store `setLoop` (engine follows).

**Lint hygiene**

- Transport BPM draft without setState-in-effect.
- `usePlayhead` / `useTransportStep` derive stopped value instead of effect setState.
- `useMeterLevel` updates `readRef` in an effect, not during render.

#### ASCII wave (Beatbox-style)

Inspired by Kimi **Beatbox**’s cyan ASCII sound field (`) * + / ( K ▲` glyph soup + ON AIR).

| File | Role |
|------|------|
| `src/components/AsciiWave.tsx` | Generative field, rAF → single `<pre>`, master-meter reactive |
| `BrowserPanel.tsx` | Full WAVE panel + ON AIR / IDLE |
| `TransportBar.tsx` | Compact strip replaces amber master bar |

Behavior:

- Glyph ladder: ` . - + / ( ) * K ▲ #`
- Hot glyphs cyan + glow when energy high.
- Playing: pulse from master meter + BPM-synced shimmer.
- Stopped: soft idle noise field.
- ~24 fps, no React re-render per frame (DOM `innerHTML` on the pre).

Colors: deep teal field `#0a0e12`, mid `#5eb8d4`, hot `#22d3ee` — sits next to OpenLive orange accent without fighting it.

#### Verify

```text
npm run build  → PASS (tsc + vite)
```

### 2026-07-23 (session 2) — Engine bugfixes + persistence, undo/redo, tests

#### Engine bugs fixed (`audio/engine.ts`)

| Bug | Fix |
|-----|-----|
| Muted/un-soloed tracks still bled into reverb/delay (sends tap PRE-channel) | `applyTrackParams` zeroes send gains under effective mute |
| Concurrent `ensureStarted()` double-inited nodes → doubled metronome + arrangement triggers | shared `startPromise` guard (failed unlock allows retry) |
| Metronome accent drifted off the downbeat (local counter) | beat derived from transport ticks at schedule time |
| Editing a playing clip's notes re-quantized to `@1m` → up to a 1-bar dropout | rebuild launches `@16n` with tick-phase offset (`part.start(time, offset)`); rename/recolor no longer rebuild at all; pending `@1m` launches keep their quantize |

#### UX bugs fixed

- **Session:** launching a clip/scene while stopped now starts the transport
  (Ableton behavior) — `launchAndRoll` in `SessionView` chains
  `ensureStarted → launch → togglePlay`.
- **Arrangement:** ruler loop-drag is now inclusive of the bar under the
  cursor (drag 2→4 loops bars 2..4); plain click still clears. Ruler bar
  clamp was off by one at the far right edge.
- **Lint:** `useMeterLevel` moved out of `mixer/controls.tsx` into its own
  file — `react-refresh/only-export-components` now passes; lint is fully green.
- `index.html`: inline SVG favicon (kills the dev-console 404).
- README quickstart said port 5173; vite.config pins 3000.

#### Features landed

- **Master volume** — `masterVolume` + `setMasterVolume` in the store,
  engine ramps its master `Gain`, `MasterStrip` fader is real now.
- **`setClipColor`** — real store action; `features/editor/clipColor.ts` is a
  thin delegate (gotcha #3 below is resolved).
- **Save/load** (`store/persistence.ts`) — versioned project files
  (`{ app: 'openlive', version: 1, savedAt, content }`), export/import buttons
  in the TransportBar, debounced (800ms) localStorage autosave
  (`openlive.project.v1`), hydrate-on-boot in `main.tsx`, reset-to-demo with a
  two-click confirm (no native dialogs). Loading always goes through the new
  `loadProject` store action → engine follows; playback state never persists.
- **Undo/redo** (`store/history.ts`) — snapshots of the musical content slice
  (bpm/swing/loop/masterVolume/tracks/clips/matrix/scenes/arrangement); bursts
  within 350ms coalesce (drag-paint = one step); 100-step cap;
  Ctrl/Cmd+Z / Shift+Z / Y global shortcuts in `App.tsx` (inputs excluded);
  buttons in the TransportBar via `useSyncExternalStore` hooks. View /
  metronome / selection / playback are deliberately NOT undoable.
- **Browser add-track** — instrument items in `BrowserPanel` are clickable
  AND draggable (`application/x-openlive-instrument`); `App.tsx` hosts the
  center-view drop target with an overlay hint. Shared metadata in
  `lib/instruments.ts` ("Drums 2", "Bass 2", ... naming).
- **Types:** `ProjectState` split into `ProjectContent` (serializable) +
  runtime; store seed refactored to `createDemoContent()` (structuredClone).

#### Tests (new)

`vitest` (devDependency) + `npm test`; standalone `vitest.config.ts` (node
env, no React plugins). 41 tests across 4 files: store integrity
(delete/remove cleanups, scene launch matrix semantics, clamps, lifecycle),
noteUtils (midi round-trip, drum map contract, fresh-state patches),
persistence (round-trip, validation/clamps, storage hydrate, autosave
debounce + runtime-change filtering), history (undo/redo, coalescing,
future-stack invalidation, UI-state isolation).

#### Verify

```text
npm run build → PASS   npm run lint → PASS (0 problems)   npm test → 41/41
Playwright smoke vs dev server: 15/15 interactions, no console errors
(launch-starts-transport, scene switch, step toggle, add-track via click and
drag-drop, undo/redo, master fader, loop drag, autosave reload restore).
```

---

## 4. Gotchas / tribal knowledge

1. **Browser autoplay:** audio context starts only after a user gesture. Always `await engine.ensureStarted()` before play/preview.
2. **StrictMode** double-mounts React components; engine is a module singleton and guards with `if (this.unsubscribe) return`.
3. **Autosave key** is `openlive.project.v1` in localStorage. Corrupt payloads are ignored on boot (demo loads instead); bump `PROJECT_FILE_VERSION` + migrate in `coerceProjectFile` if the content shape ever changes.
4. **Scenes vs matrix:** launch path uses matrix. `Scene.slotByTrack` is still stored for seed/compat but can drift; don’t trust it for playback.
5. **shadcn lint noise:** `components/ui/*` trips `react-refresh/only-export-components` and sidebar skeleton purity. App code is what matters.
6. **Large bundle (~600 kB):** mostly Tone.js. Dynamic `import('tone')` after first gesture is a future win.
7. **Meter rAF storms:** session headers + mixer strips + ASCII each poll. Fine at 4 tracks; consolidate if track count grows.
8. **Windows git ownership:** this path may need `git config --global --add safe.directory <path>`.

---

## 5. Roadmap (from README + review)

- [ ] MIDI in (Web MIDI)
- [ ] Audio tracks / samples
- [ ] Real device chain (reorderable FX)
- [x] Save / load project JSON + local persistence *(2026-07-23 s2)*
- [ ] PWA / offline
- [x] Unit tests for store + `noteUtils` *(2026-07-23 s2 — plus persistence/history)*
- [ ] `npm audit fix` / Vite bumps
- [x] Browser panel actual drag-to-add-track *(2026-07-23 s2 — click or drag)*
- [x] Master volume in store *(2026-07-23 s2)*
- [x] Undo / redo *(2026-07-23 s2)*
- [ ] Clip length editing (32/64-step patterns exist in the model; no UI)
- [ ] Dynamic `import('tone')` after first gesture (bundle is ~600 kB)

---

## 6. Design tokens (quick)

| Role | Value |
|------|-------|
| App bg | `#1a1a1a` |
| Panels | `#1e1e1e` – `#242424` |
| Borders | `#333` / `neutral-800` |
| Accent | `#ff8c2e` (orange) |
| Playing | green ring / pulse |
| ASCII wave | cyan `#22d3ee` on `#0a0e12` |
| Font UI | system / sans |
| Font wave | `font-mono` |

No gradients on chrome (contract). ASCII glow is the one intentional light effect.

---

## 7. How to add something safely

**New mixer control**

1. Add field on `Track` / action in `daw.ts` + `projectStore`.
2. Map it in `engine.applyTrackParams` or chain build.
3. Wire UI in `features/mixer` only.

**New FX device param**

1. Add the field to `TrackFx` in `daw.ts` + `DEFAULT_TRACK_FX` (persistence
   back-fills it for old files).
2. Use `setTrackFx(trackId, partial)` — clamp in the action, map in
   `engine.applyTrackParams`. Watch for expensive setters: `Reverb.decay`
   regenerates the IR on every assignment, so guard with a changed-check.

**New clip editor gesture**

1. Mutate notes only via `patchClipNotes` or `updateClipNotes` with **fresh** state.
2. Audition with `engine.ensureStarted().then(() => engine.previewNote(...))`.

**New visualizer**

1. Prefer rAF + DOM/canvas refs over React state per frame.
2. Read meters from engine; never start audio without a gesture path.

---

## 8. Changelog (condensed)

| Date | Change |
|------|--------|
| 2026-07-23 | git init |
| 2026-07-23 | Full code review + test report |
| 2026-07-23 | Paint stale-state fix; loop; scenes; dual toms; reverb generate |
| 2026-07-23 | Session playing UI; pan label; package rename |
| 2026-07-23 | Beatbox-style `AsciiWave` in Browser + Transport |
| 2026-07-23 | This DEVLOG |
| 2026-07-23 s2 | Engine fixes: send-mute bleed, `ensureStarted` race, metronome downbeat, in-phase playing-clip rebuild |
| 2026-07-23 s2 | Clip/scene launch starts transport; inclusive loop drag; lint fully green |
| 2026-07-23 s2 | Master volume; `setClipColor`; save/load + autosave; undo/redo; browser add-track |
| 2026-07-23 s2 | vitest suite (41 tests); Playwright smoke 15/15; README/CONTRACT refreshed |

---

*Last updated: 2026-07-23 — keep this file honest; delete stale advice, don’t accumulate myths.*
