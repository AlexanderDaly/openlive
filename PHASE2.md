# OpenLive — Phase 2 implementation plan

**Milestone:** `Phase 2 — Playable, Reliable, Tested` · due **2026-08-20**
**Audience:** implementers who have never seen this repo. Read
[`DEVLOG.md`](./DEVLOG.md) §1 (architecture bible) and
[`src/features/CONTRACT.md`](./src/features/CONTRACT.md) before touching code.

---

## 1. Goal

By 2026-08-20 OpenLive should be trustworthy for a real user session:

- **Playable** — the Browser instruments actually create tracks (#2), projects
  survive a refresh (#3), and there is a master volume (#6).
- **Reliable** — the P1 audio-correctness bugs are gone: muted/soloed tracks no
  longer leak through FX sends (#39), and editing a playing clip no longer
  silences it until the next bar (#40). The P2 editor/UX bug batch (#42–#48)
  is fixed, and destructive deletes are guarded (#47).
- **Tested** — Vitest runs in CI (#4), lint is blocking again (#11), npm audit
  is clean or documented (#5), and undo/redo (#12) plus the scene-matrix drift
  fix (#13) have regression tests.

### Explicitly out of scope (Phase 3 deferrals)

| Issue | Why deferred |
|-------|--------------|
| #7 meter rAF storm | Only hurts at high track counts; Phase 2 ships with ≤ a handful of tracks |
| #9 MIDI in (Web MIDI) | New feature surface, needs its own design |
| #10 audio tracks / samples | Extends the domain model (`daw.ts`) significantly |
| #49 metronome drift | Low user impact; needs careful scheduling work |

Do not pick these up. Do not "accidentally" fix them inside other workstreams.

---

## 2. Workstreams at a glance

| WS | Title | Issues | Priority | Effort | Sequencing |
|----|-------|--------|----------|--------|------------|
| WS0 | Test foundation & tooling gate | #4, #11, #5, #50 | P1/P2 | M | **First.** Everything after this is verified by tests/lint it enables |
| WS1 | Audio-correctness bugs | #39, #40 | P1 | M | **Second.** P1 bugs corrupt trust in playback |
| WS2 | Editor/UX bug batch | #42, #43, #44, #45, #46, #47, #48 | P2 | L | After WS0; independent of WS1 (editor vs engine) |
| WS3 | Project persistence | #3 | P1 | M | After WS0; can run parallel with WS1/WS4 |
| WS4 | Browser instruments → real tracks | #2 | P1 | M | After WS0; can run parallel with WS1/WS3 |
| WS5 | Store & UX upgrades | #6, #12, #13 | P2 | M | **After WS3** — undo/redo interacts with persistence/autosave |
| WS6 | Performance: lazy Tone.js | #8 | P2 | L | Anytime after WS1 (both touch `engine.ts`; avoid concurrent branches) |

Conflict map (don't run these on overlapping branches):

- `src/audio/engine.ts` — WS1, WS6 (also lightly WS5 #6).
- `src/store/projectStore.ts` + `src/types/daw.ts` — WS3, WS5 (#6/#12/#13), WS2 #48.
- `package.json` — WS0, WS5 (#12 adds zundo or similar), WS6 (none, but verify).
- `.github/workflows/ci.yml` — WS0 #11 only.

---

## 3. Implementer briefs

The architecture contract in one paragraph: UI calls **store actions**; the
engine (`src/audio/engine.ts`) **subscribes** to the store and never writes
it; feature UI never imports Tone.js (allowed engine API only:
`ensureStarted`, `previewNote`, meters, transport position); all timing is in
Transport ticks (`"16i"`, `"@1m"`), never seconds. `STEPS_PER_BAR = 16`.

---

### WS0 — Test foundation & tooling gate (#4, #11, #5, #50)

> **Status (2026-07-23): COMPLETE.** Vitest + 41 tests (#4) and lint override
> with blocking CI (#11) landed; `test.yml` skip removed; `npm audit` clean
> (#5); package metadata + favicon + SessionView comment fixed (#50). The
> brief below is kept for reference.

**Files to touch**

- `package.json` — add `"test": "vitest run"` (+ `"test:watch": "vitest"` if
  you like); add devDeps `vitest` (and `jsdom` only if you end up needing DOM
  APIs — the store tests below do not).
- `vite.config.ts` — add a `test` block (`/// <reference types="vitest/config" />`)
  reusing the existing `@` alias; `environment: 'node'` is sufficient.
- New: `src/store/projectStore.test.ts`, `src/features/editor/noteUtils.test.ts`.
- `eslint.config.js` — flat-config override for `src/components/ui/**`.
- `.github/workflows/ci.yml` — remove `continue-on-error: true` from the lint
  step (and its "(non-blocking …)" name suffix) once lint is clean.
- `package-lock.json` — via `npm audit fix` / targeted bumps.

**Approach**

- **#4 Vitest + tests.** The store (`src/store/projectStore.ts`) is plain
  zustand — no DOM, no Tone. You can drive it directly:
  `useProjectStore.getState().launchScene(0)` then assert on
  `useProjectStore.getState().playingClipByTrack`. **Reset state between
  tests**: capture `useProjectStore.getState()` (or build the initial state
  via a captured snapshot) in `beforeEach` and `useProjectStore.setState(initial, true)`.
  Required coverage from the issue body:
  - Store actions: `launchScene` (reads the session-matrix row; null slots
    stop that track), `deleteClip` cascade (removes from `clips`,
    `sessionMatrix`, `playingClipByTrack`, `scenes[].slotByTrack`,
    `arrangementClips`, clears `selectedClipId`), `setLoop` (clamps
    `startBar >= 0`, `lengthBars >= 1`, null clears).
  - `noteUtils` / `patchClipNotes` pure tests: `noteToMidi`/`midiToNote`
    round-trips (`'A1'→33→'A1'`, `'C4'→60`, garbage input → 60), and a
    regression test for the Phase 1 stale-closure bug: two sequential
    `patchClipNotes` calls in the same tick must both land (the second reads
    fresh `getState()`, not a stale `clip.notes`).
- **#11 ESLint.** In `eslint.config.js` add an override block
  `{ files: ['src/components/ui/**'], rules: { 'react-refresh/only-export-components': 'off', ... } }`
  for the shadcn template noise (sidebar skeleton purity too — run
  `npm run lint` and disable exactly what fires, nothing more). Then flip CI:
  lint becomes blocking.
- **#5 npm audit.** Run `npm audit`. `npm audit fix` first; if a vite major
  bump is required, check Dependabot's open PRs before hand-rolling one.
  Document any accepted residual risk in DEVLOG §4 (gotchas).
- **#50 quick wins.** `package.json`: `name` is already `openlive`; set a real
  `version` (suggest `0.2.0` at Phase 2 close) and keep `"private": true`
  (it's an app, not a library — that's fine, but say so in the field's
  spirit). Favicon 404: `index.html` references an icon path that 404s under
  `base: '/openlive/'` on Pages — add a real favicon asset and reference it
  **relative to the Vite base** (never hardcode `/openlive/`). Fix the stale
  doc comment called out in the issue.

**Acceptance criteria (from issue bodies)**

- #4: Vitest (or similar) wired in CI · store action unit tests
  (`launchScene`, `deleteClip` cascade, `setLoop`) · `noteUtils` /
  `patchClipNotes` pure tests.
- #11: ESLint override for `src/components/ui/**` or fixed exports ·
  `npm run lint` clean · CI lint job blocking.
- #5: `npm audit` clean or only accepted residual risks documented ·
  Dependabot PRs reviewed for vite major.
- #50: package metadata sane, favicon resolves under the Pages base path,
  stale comment fixed.

**Contract risks**

- Tests must not import `src/audio/engine.ts` (it imports Tone at module
  scope today — importing it in node tests will fail or be very slow). Test
  store and pure helpers only. (After WS6 this gets easier.)
- Don't relax lint rules outside `src/components/ui/**` — app code is what
  matters (DEVLOG §4 gotcha 5).

---

### WS1 — Audio-correctness bugs (#39, #40)

**Files to touch:** `src/audio/engine.ts` only. (Tests for #40's timing math
can land in a pure helper if you extract one; otherwise verify manually.)

**#39 — Muted/un-soloed tracks audible through reverb & delay**

Root cause is in `buildChain` (`src/audio/engine.ts`): sends are tapped
**pre-fader, pre-mute** —

```ts
filter.connect(reverbSend);   // taps the filter output, BEFORE the channel
filter.connect(delaySend);    // so channel.mute / channel.volume never affect sends
```

`applyTrackParams` implements mute/solo as `chain.channel.mute = track.muted ||
(anySolo && !track.soloed)`, but the send path never passes through the
channel, so a muted track still feeds reverb/delay.

Fix: move the send tap **post-fader/post-mute** — connect the sends from the
`channel` output (or a post-channel node) instead of from `filter`:

```ts
// instrument -> filter -> channel -> meter + master + sends
channel.connect(reverbSend);  // was: filter.connect(reverbSend)
channel.connect(delaySend);   // was: filter.connect(delaySend)
```

Note the signal-level change: send amount now scales with track volume too
(true post-fader behavior — this is the correct, Ableton-consistent result).
Check `disposeChain` still covers every node (it should — the node set
doesn't change, only the wiring).

**#40 — Editing/renaming a playing session clip silences its track until next bar**

Root cause is the rebuild path in the store subscription: when
`state.clips !== prev.clips`, the engine calls `launchPart(trackId, clip)` for
the changed playing clip. `launchPart` schedules the new `Tone.Part` with
`transport.scheduleOnce(..., '@1m')` — bar-quantized — so a mid-bar edit kills
the current part and stays silent until the next bar boundary.

Fix: distinguish **user launch** (keep `'@1m'` quantization — that's the
Ableton behavior) from **rebuild of an already-playing part** (restart
immediately, preserving musical position). Concretely: in the rebuild branch
of the subscription, restart the part at the current transport position
offset into the clip: compute the current step from ticks
(`Tone.getTransport().getTicksAtTime(Tone.now())`, divided by
`sixteenthTicks()`, modulo `clip.lengthSteps`), then start the new part with
`part.start(undefined, `${offsetTicks}i`)` so the pattern resumes at the right
step rather than from step 0 at the next bar. A clean way is a private
`restartPartInPlace(trackId, clip)` next to `launchPart`. Renames produce a
new clip object too (`renameClip` spreads the clip), so make sure the rebuild
only fires when `clip.notes` or `clip.lengthSteps` actually changed —
compare against `prev.clips[entry.clipId]` before rebuilding, not just object
identity, or renaming will still restart the pattern.

**Acceptance criteria**

- #39: mute a track with reverb/delay send > 0 while its clip plays → silence
  (including wet tails from new triggers); solo another track → same for all
  non-soloed tracks. Un-mute restores dry + wet.
- #40: while a session clip is playing, paint a note / rename the clip → the
  track keeps playing, new notes audible at the next occurrence of their
  step, no gap to the next bar, no restart from step 0.

**Contract risks**

- Engine-only change. The engine still must not write the store.
- Stay in ticks. Do not compute the restart offset in seconds — BPM ramps
  (`transport.bpm.rampTo`) make seconds lie mid-play.
- `syncPlayingClips` and the rebuild branch both call part-management code;
  keep the "max ONE playing clip per track" invariant intact.

---

### WS2 — Editor/UX bug batch (#42–#48)

Seven small P2 bugs. One branch, one PR per 2–3 related fixes is fine (see §4).

**Files to touch**

| Issue | Primary files |
|-------|---------------|
| #42, #43 | `src/features/editor/ClipEditor.tsx` (+ maybe `src/audio/engine.ts` for an audition API, see below) |
| #44 | `src/features/editor/MelodicGrid.tsx` |
| #45 | `src/features/arrangement/ArrangementView.tsx` |
| #46 | `src/features/editor/usePlayhead.ts`, `src/features/devices/useTransportStep.ts`, `src/features/devices/DrumRack.tsx` |
| #47 | `src/features/session/SessionView.tsx`, `src/features/arrangement/ArrangementView.tsx`, `src/components/ui/alert-dialog` (already a dependency via radix) |
| #48 | `src/features/devices/FxRack.tsx`, `src/types/daw.ts`, `src/store/projectStore.ts`, `src/audio/engine.ts` |

**#42 — Clip editor Play/Stop desyncs from transport.** In
`ClipEditor.tsx` the button state comes from an `isClipPlaying` selector and
the handler calls `togglePlay()`/launch logic that doesn't account for the
transport being stopped elsewhere. Derive the label from **both**
`isPlaying` and `playingClipByTrack[trackId] === clip.id`; when the user hits
Stop, stop the transport (or `stopTrackClip`) so the store, transport, and
button agree. Manual test: play from transport bar → editor shows Stop;
stop from transport bar → editor shows Play.

**#43 — Editor ▶ in Arrangement view plays the timeline instead of
auditioning the clip.** In arrangement view, `view === 'arrangement'` and
pressing ▶ starts global timeline playback. The editor's button should
audition the edited clip instead. Cleanest contract-safe path: add a
read-only-ish engine audition API, e.g. `engine.previewClip(clipId)` — a
one-shot `Tone.Part` through the track's real chain, stopped at clip end —
and call it from the editor when `view === 'arrangement'`. Adding an engine
API method is allowed in this phase, but update the allowed-API lists in
`DEVLOG.md` §1 and `src/features/CONTRACT.md` in the same PR. In session
view the button keeps its launch semantics.

**#44 — Piano-roll octave window persists across clip selection.** The
octave offset in `MelodicGrid.tsx` is local state that survives switching to
a different clip. Reset it when `selectedClipId` changes (a `useEffect`
keyed on the clip id, or lift the state and key the component with
`key={clip.id}`).

**#45 — Loop ruler: 1-bar loops can't be dragged; release bar excluded.** In
`ArrangementView.tsx`, drag state lives in `loopDragRef` and mouseup treats
"released on the anchor bar" as a plain click → `setLoop(null)`. Two fixes:
(1) make the dragged range **inclusive** of the release bar —
`lengthBars = |currentBar - anchorBar| + 1`; (2) distinguish click from drag
by pointer movement in pixels (threshold ~4 px), not by bar equality, so a
1-bar loop (drag within one bar, or anchor == release) is creatable.
`setLoop` already clamps `lengthBars >= 1`.

**#46 — Playhead & drum-pad flash highlight the wrong step for non-aligned
clips.** `usePlayhead.ts` / `useTransportStep.ts` compute the step from the
transport position assuming bar-aligned, 16-step clips. Clips with
`lengthSteps !== 16` (32/64) or arrangement clips starting mid-timeline
highlight the wrong cell/pad. Compute from ticks: `step =
floor(ticks / sixteenthTicks)`, then `stepInClip = step % clip.lengthSteps`
(session) — this mirrors the arrangement walk already in
`engine.ts` (`stepInClip = (step - a.startBar * STEPS_PER_BAR) %
clip.lengthSteps`); copy that arithmetic, don't invent a second convention.
Ticks are not exposed in the current engine API; add
`engine.getTransportTicks()` or derive from `getTransportPosition()`
('bars:beats:sixteenths') — prefer a ticks getter to avoid string parsing.
If you add it, update the contract docs (same rule as #43).

**#47 — Destructive deletes have no confirmation, no undo.** Guard:
`deleteClip` (hover ✕ in `SessionView.tsx`), `removeTrack`, and arrangement
`Delete`/`Backspace` (`ArrangementView.tsx`). Use the radix alert-dialog
(`@radix-ui/react-alert-dialog` is already in `package.json`). Copy tone:
one sentence, name the thing being deleted, "This can't be undone." — once
WS5 #12 lands you may soften that line, but don't block WS2 on WS5. Undo
(#12) is the deeper safety net; this issue only requires the confirmation.

**#48 — FX power switches and macro knobs are fake.** `FxRack.tsx` holds
`power` and `macro` in local `useState` and never touches the store/engine.
Make them real:

- Extend `TrackFx` in `src/types/daw.ts` with per-device bypass and the macro
  params you wire, e.g. `reverbOn`, `delayOn`, `filterOn` and
  `reverbDecay`, `delayTime`, `delayFeedback`, `filterReso` (or a nested
  shape — your call, but keep it flat-ish for the store's `setFxParam`
  pattern; you will likely widen `FxParam` or add a `setTrackFx(trackId,
  partial)` action).
- Store: add the action(s) with the same clamp discipline as `setFxParam`.
- Engine `applyTrackParams`: bypass = send gain 0 for reverb/delay; filter
  bypass = frequency at max (18000) or a real `filter.frequency` bypass —
  pick the cheaper honest version. Map decay/time/feedback/reso onto the
  `Tone.Reverb` / `Tone.FeedbackDelay` / `Tone.Filter` nodes.
- `FxRack.tsx`: replace local state with store selectors/actions; remove the
  "(visual)" titles.
- This is a **contract-touching** change (`daw.ts` + engine): update
  `src/features/CONTRACT.md` and DEVLOG §7 ("How to add something safely")
  in the same PR. Persistence (WS3) must tolerate the new `TrackFx` fields —
  coordinate with the WS3 implementer or land WS3 first with defaults for
  missing fields.

**Acceptance criteria** — each issue body is terse; the bar is "the described
broken behavior is gone and the fix survives `npm run build`, lint, and the
WS0 test suite."

**Contract risks (whole WS2)**

- Editor/arrangement/session files must not import Tone. New engine APIs go
  through `src/audio/engine.ts` and the contract docs.
- Step math in ticks, not seconds (#46).
- Don't let confirmation dialogs swallow the store action on "Cancel"
  (obvious, but the ✕ handler currently calls `deleteClip` directly).

---

### WS3 — Project persistence (#3)

**Files to touch**

- New: `src/lib/persistence.ts` (pure serialize/deserialize + schema
  validation — `zod` is already a dependency, use it).
- `src/store/projectStore.ts` — a `loadProject(data)` / `newProject()`
  action; possibly a `hydrate` path at store creation.
- `src/main.tsx` or `src/App.tsx` — load-on-start.
- `src/components/TransportBar.tsx` (or a small shell menu) — explicit
  Save / Load (file download/upload) / New.
- Tests: `src/lib/persistence.test.ts` (round-trip, version mismatch,
  corrupt JSON).

**Approach**

- **Versioned format.** Serialize a subset of `ProjectState` — the
  *document*, not the runtime: `bpm`, `swing`, `metronome`, `tracks`,
  `clips`, `sessionMatrix`, `scenes`, `arrangementClips`, `loop`, `view`.
  Exclude `isPlaying`, `playingClipByTrack`, `selectedClipId` (derive on
  load: `playingClipByTrack` from scene row 0 like the seed does, or all
  null). Wrap it: `{ schemaVersion: 1, savedAt: ISO, project: {…} }`.
- **Deserialize** validates with zod, fills defaults for missing optional
  fields (this is what lets WS2 #48 add `TrackFx` fields later — old files
  must still load), and rejects unknown `schemaVersion > CURRENT` with a
  clear error message.
- **The engine never sees persistence.** Loading = one store update via a
  `loadProject` action (or `setState` from the store module). The engine's
  existing subscription resyncs chains/parts by itself. Stop playback before
  applying a load (`isPlaying: false` in the same update) so
  `stopAllParts()` fires through the normal subscription path.
- **Autosave.** Subscribe to the store (outside React, in
  `src/lib/persistence.ts` or a tiny `useAutosave` hook) and write
  `localStorage['openlive.project']` debounced ~1 s. JSON size is small
  (notes only); don't persist meters/UI ephemera. Guard `JSON.stringify`
  in try/catch (quota) and keep the last-good payload in memory.
- **Load-on-start.** At bootstrap, if a valid autosave exists, hydrate from
  it; otherwise keep the demo seed (the README's "press play the second it
  loads" promise — don't break it for first-time users).
- **Explicit Save/Load/New.** Save = download `project.openlive.json`
  (Blob + anchor). Load = file input → parse → validate → `loadProject`.
  New = confirm (reuse WS2 #47's dialog pattern) → reset to demo seed and
  clear autosave.

**Acceptance criteria (from issue body)**

- Export project JSON (tracks, clips, matrix, scenes, arrangement, transport).
- Import / load JSON.
- Optional `localStorage` autosave — treat as required for Phase 2.

**Contract risks**

- One-way sync: persistence writes go *through the store*, never around it.
  If you catch yourself calling an engine method on load, stop.
- ID integrity: imported files reference clips by id across `clips`,
  `sessionMatrix`, `scenes[].slotByTrack`, `arrangementClips[].clipId` —
  validate referential integrity or repair-by-dropping dangling refs
  (and test both paths).
- Autosave + undo (WS5 #12): undoing must also trigger autosave (it will, if
  autosave subscribes to state changes and undo is a state change — verify).

---

### WS4 — Browser instruments → real tracks (#2)

**Files to touch**

- `src/components/BrowserPanel.tsx` — the instrument list (currently static
  hint text: "Drag onto a MIDI track (drumkit)" etc.).
- `src/features/session/SessionView.tsx` — drop target on track headers /
  empty slot area.
- Possibly `src/features/mixer/MixerPanel.tsx` — nothing should be needed;
  it renders from `state.tracks`, verify.
- No store changes required: `addTrack(init?) → id` already exists and seeds
  the `sessionMatrix` row.

**Approach**

- **Click-to-add fallback first** (accessibility + easy win): clicking
  Drum Kit / Bass / Keys calls `addTrack({ name, instrument, type, color })`.
  Mapping: Drum Kit → `{ instrument: 'drumkit', type: 'drums' }`, Bass →
  `{ instrument: 'bass', type: 'midi' }`, Keys → `{ instrument: 'keys',
  type: 'midi' }`. Pick colors from the existing palette range.
- **Drag-and-drop** second: HTML5 DnD (`draggable` + `dataTransfer` with the
  instrument kind) onto the session grid — drop on empty space = new track
  (same as click); drop on an existing track header = reassign that track's
  instrument via a store update (`renameTrack`-style action or a new
  `setTrackInstrument`; if you add an action, engine `syncTracks` rebuilds
  the chain only when the `tracks` array identity changes — it does on any
  track edit, but note the chain is **reused**, so changing instrument needs
  a chain rebuild: check `syncTracks`/`buildChain` and add an
  instrument-change path in the engine — dispose + rebuild the voice when
  `track.instrument` differs from the built chain).
- Verify the three acceptance bullets end-to-end: new track row appears in
  the session matrix (`sessionMatrix[id]` is seeded by `addTrack`), mixer
  strip renders, and after `ensureStarted()` + launching a clip on it, the
  engine builds the matching voice (`buildVoice` switch).

**Acceptance criteria (from issue body)**

- Drag (or click) an instrument creates or configures a track.
- New track appears in session matrix + mixer.
- Engine builds the matching voice chain.

**Contract risks**

- UI → store action → engine reacts. Do not import Tone or call engine
  chain-builders from `BrowserPanel`.
- Drum tracks are `type: 'drums'` — the editor renders `DrumGrid` vs
  `MelodicGrid` off this; getting it wrong makes the new track uneditable.

---

### WS5 — Store & UX upgrades (#6, #12, #13)

**After WS3** (undo must not fight autosave; persistence must round-trip the
new `masterVolume`).

**#6 — Master volume.** Files: `src/types/daw.ts` (`masterVolume: number` on
`ProjectState` + `setMasterVolume` action), `src/store/projectStore.ts`
(default `0.9` to match the current hardcoded `new Tone.Gain(0.9)` in
`initNodes`), `src/audio/engine.ts` (`applyMasterVolume` in `fullSync` +
subscription, using the existing `volumeToDb` helper),
`src/features/mixer/MasterStrip.tsx` (replace the visual-only local-state
fader — its own header comment admits it's fake). Persistence: include
`masterVolume` in the WS3 schema with default 0.9.

**#12 — Undo/redo.** Files: `src/store/projectStore.ts`, `package.json`
(add `zundo` — temporal middleware for zustand — or hand-roll a small
temporal stack; prefer the dependency, it's tiny), `src/App.tsx` (global
keydown: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z / Ctrl+Y), DEVLOG/CONTRACT docs.
Configuration that matters:
- `partialize`: track only the *document* — `tracks`, `clips`,
  `sessionMatrix`, `scenes`, `arrangementClips`, `bpm`, `swing`, `loop`,
  `masterVolume`. Exclude `isPlaying`, `playingClipByTrack`,
  `selectedClipId`, `view`, `metronome` (playback/selection are not
  undoable — undoing "play" would be bizarre and would fight the engine).
- Throttle/limit: zundo's `limit` (~100) and `handleSet` throttle for
  drag-paint gestures so one paint stroke ≠ 50 history entries.
- Keyboard handler must ignore events from inputs/textareas (renaming a clip
  must not trigger global undo).
- Verify engine follows undo through the normal subscription (it will —
  undo is just a state change — but test undoing a `deleteClip` while
  session playback is running).

**#13 — `Scene.slotByTrack` drift.** Launch already reads the session
matrix; `Scene.slotByTrack` is a stale snapshot (`setSlot` and `createClip`
don't update it). Pick **one**:
- (a) Keep `slotByTrack` synced on every matrix write — update `setSlot`,
  `createClip`, `addScene` (already writes it), `deleteClip` (already
  cleans it). Straightforward but easy to regress.
- (b) Remove `slotByTrack` from the runtime path: keep the field only in the
  persistence schema as derived data, computed at save time from
  `sessionMatrix`. Requires touching the type + seed + WS3 serializer.
Recommendation: (a) for Phase 2 (smaller diff), with a test asserting
`createClip(trackId, slotIndex)` → `scenes[slotIndex].slotByTrack[trackId]`
matches, and `createClip` → `launchScene` end-to-end (issue acceptance).
Document the choice in DEVLOG §4 (gotcha 4 becomes stale — rewrite it).

**Acceptance criteria (from issue bodies)**

- #6: `masterVolume` (or similar) on project state · engine applies it ·
  mixer Master strip can change it.
- #12: temporal stack or zundo middleware on project store ·
  Ctrl/Cmd+Z / Shift+Ctrl+Z in shell.
- #13: either drop slotByTrack from runtime path docs or keep scenes synced
  on every matrix write · tests covering createClip → launchScene.

**Contract risks**

- Undo/persistence both replace store state — the engine must learn about
  it only through its subscription. Never special-case the engine.
- `masterVolume` is linear 0..1 in the store, dB at the node — reuse
  `volumeToDb`, don't write a second conversion.

---

### WS6 — Performance: lazy-load Tone.js (#8)

**Files to touch:** `src/audio/engine.ts` (the whole point),
possibly `vite.config.ts` (verify chunking), DEVLOG §4 (gotcha 6 becomes stale).

**Approach**

- Today `engine.ts` does `import * as Tone from 'tone'` at module scope, so
  Tone lands in the entry chunk (~600 kB) even though no node is created
  before the first gesture.
- Target shape: keep the `engine` facade module Tone-free. Move the heavy
  implementation into `src/audio/engineImpl.ts` (or keep the class but
  `await import('tone')` inside `ensureStarted()` and store the namespace on
  the instance). Types can stay as `import type ... from 'tone'` — erased at
  build time, zero runtime cost. The public API (`ensureStarted`,
  `previewNote`, `getTrackMeter`, `getMasterMeter`, `getTransportPosition`,
  `isStarted`, plus any additions from WS2) must stay identical so no UI
  changes are needed.
- All pre-gesture calls must remain safe no-ops (`previewNote` before start
  already returns early — keep that).
- Verify: `npm run build` output shows a separate `tone-*.js` chunk loaded
  on demand; entry chunk drops dramatically; `npm run dev` smoke test —
  first click still unlocks and plays (watch for a one-frame delay on first
  `ensureStarted` while the chunk fetches; that's acceptable, note it in the
  PR).

**Acceptance criteria (from issue body)**

- Initial route JS significantly smaller without Tone.
- Engine loads on first `ensureStarted()`.

**Contract risks**

- The singleton + StrictMode double-mount guard (`if (this.unsubscribe)
  return`) must survive the refactor.
- After WS0, engine module shape matters for tests: keep store tests
  engine-free either way.
- Don't do this concurrently with WS1 — both rewrite `engine.ts`. Sequence:
  WS1 lands first, then WS6.

---

## 4. Branching / PR strategy

- **Branch naming:** `ws<n>/<short-slug>` per workstream, or
  `fix/<issue>-<slug>` for single-issue fixes. Examples: `ws0/test-foundation`,
  `ws3/persistence`, `fix/39-fx-sends-post-fader`, `fix/42-43-editor-play-button`.
- **Granularity:** one PR per workstream is fine for WS0/WS3/WS4/WS5/WS6.
  WS2 is seven issues — split into 2–3 PRs along the file boundaries in the
  WS2 table (editor cluster #42/#43/#44/#46, arrangement+deletes #45/#47,
  devices #48) so review stays fast.
- **Never** run `git commit`/`git push` if you are a delegated specialist —
  the orchestrator commits after review. Implementers working directly:
  small, conventional commits (`fix(engine): route FX sends post-fader (#39)`).
- **PR checklist** (from `.github/PULL_REQUEST_TEMPLATE.md`) — every PR must
  answer:
  - Store remains single source of truth; engine does not write the store.
  - No new direct Tone.js usage outside `src/audio/engine.ts`.
  - Feature UI only uses allowed engine APIs (`ensureStarted`, `previewNote`,
    meters, transport position — plus any new APIs you added *and documented*
    in the same PR).
  - `npm run build` passes locally.
  - Fill in the manual test-plan boxes relevant to what you touched.
- **CI expectations:**
  - `ci.yml`: build must be green on every PR. Lint is non-blocking **until
    WS0 #11 lands**, blocking after — rebase WS2+ branches if they start
    failing lint.
  - `test.yml` (new): runs `npm test` on push/PR. Until WS0 adds the `test`
    script it detects that, prints a notice, and exits green — don't be
    confused by the skip; once WS0 merges, test failures block.
- Close issues with `Closes #N` in the PR body so the milestone tracks itself.

---

## 5. GitHub mechanics

- **Milestone:** assign every Phase 2 PR/issue to
  `Phase 2 — Playable, Reliable, Tested` (due 2026-08-20). If it doesn't
  exist yet when you start, the admin creates it — don't invent your own.
- **Labels:** priorities `P0`–`P3` and areas `area/session`,
  `area/arrangement`, `area/mixer`, `area/editor`, `area/devices`,
  `area/engine`, `area/shell`, `area/tooling` (plus `bug`, `security`,
  `shortfall`, `dependencies`). Keep issue labels current as work lands.
- **Workflows you will interact with:**
  - `.github/workflows/ci.yml` — `npm ci` + build on push/PR; lint step
    flips to blocking in WS0.
  - `.github/workflows/test.yml` — unit tests; graceful skip until the
    `test` script exists (remove the skip step when closing #4).
  - `.github/workflows/deploy-pages.yml` — builds with `base: '/openlive/'`
    and deploys to GitHub Pages on push to `main` + `workflow_dispatch`.
    Consequence: **never hardcode absolute asset paths** (`/foo.png`);
    favicon and any new assets must resolve under the base (WS0 #50).
  - `.github/workflows/sync-shortfalls.yml` — auto-creates issues from
    `SHORTFALLS.md` markers. When your PR closes an issue that came from
    SHORTFALLS, delete the corresponding `<!-- issue: id #N -->` block in
    the same PR so it isn't re-created.
- **Docs debt:** any PR that changes the contract (new engine API, new store
  field/action, `TrackFx` shape, `Scene` semantics) updates
  `src/features/CONTRACT.md` and `DEVLOG.md` in the same PR. DEVLOG tone:
  concise, honest, no marketing.

---

## 6. Definition of done — Phase 2

All of the following, not most:

1. **Issues closed:** #2, #3, #4, #5, #6, #8, #11, #12, #13, #39, #40, #42,
   #43, #44, #45, #46, #47, #48, #50 — all in the milestone, all closed via
   merged PRs.
2. **Gates green on `main`:** `npm run build`, `npm run lint` (blocking in
   CI), `npm test` (blocking in CI, with the WS0-required coverage actually
   present).
3. **Contract intact:** engine never writes the store; no Tone.js import
   outside `src/audio/`; new engine APIs documented in `CONTRACT.md` +
   DEVLOG §1; timing still in ticks.
4. **Manual smoke script passes on the Pages build:**
   first load plays the demo seed on ▶; refresh mid-session restores the
   project (autosave); muted track with reverb send is silent; editing a
   playing clip doesn't drop audio; Cmd/Ctrl+Z undoes a clip delete; Browser
   click adds a playable track; master fader changes loudness.
5. **Docs honest:** `SHORTFALLS.md` blocks for closed issues removed;
   DEVLOG §4 gotchas updated (#13 slotByTrack, #8 bundle, #6 master volume);
   DEVLOG changelog rows added.
6. **Deferred issues untouched:** #7, #9, #10, #49 still open and still
   labelled — Phase 3 picks them up.

---

*Plan written for milestone `Phase 2 — Playable, Reliable, Tested`. When a
brief here conflicts with reality in the code, trust the code, fix the plan.*
