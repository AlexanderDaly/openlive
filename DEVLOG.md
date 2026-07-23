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
   - `engine.previewNote(trackId, note, velocity?)`
   - `engine.getTrackMeter(id)` / `engine.getMasterMeter()`
   - `engine.getTransportPosition()` / `engine.isStarted()`
4. **Timing is in Transport ticks** (`"Ni"`), not seconds — BPM changes mid-play stay correct.
5. **Contract file:** `src/features/CONTRACT.md` + types in `src/types/daw.ts`.

### Folder ownership

| Path | Owns |
|------|------|
| `src/types/daw.ts` | Domain model (shared contract) |
| `src/store/projectStore.ts` | State + actions + demo seed |
| `src/audio/engine.ts` | Tone.js singleton |
| `src/components/*` | App shell (Transport, Browser, Detail) |
| `src/features/session/` | Session clip grid |
| `src/features/arrangement/` | Timeline |
| `src/features/mixer/` | Channel strips |
| `src/features/editor/` | Step seq / piano roll |
| `src/features/devices/` | Drum rack, synth macros, FX |

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
npm run dev       # http://localhost:5173 — audio unlocks on first click
npm run build     # tsc -b && vite build  (must stay green)
npm run lint      # eslint .
npm run preview   # serve dist/
```

No automated test suite yet. Gate = **`npm run build` clean**.

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

### 2026-07-23 — Phase 2 kickoff

#### Scene A seed fix (committed)

- `ef4ed3b` — `playingClipByTrack` is now seeded from `slotFor(0)` at store
  init, so the first press of Play launches scene A's clips instead of silence.

#### Phase 2 — "Playable, Reliable, Tested"

- Milestone created, due **2026-08-20**; 19 issues assigned
  (WS0 tests/tooling: #4 #11 #5 #50 · WS1 audio bugs: #39 #40 ·
  WS2 editor/UX: #42–#48 · WS3 persistence: #3 · WS4 instruments: #2 ·
  WS5 store/UX: #6 #12 #13 · WS6 perf: #8).
- `PHASE2.md` written as the implementer plan (workstreams, scope, order).
- Deferred to Phase 3: **#7** meter rAF storm, **#9** MIDI in,
  **#10** audio tracks/samples, **#49** metronome drift.

#### New workflows

- `.github/workflows/test.yml` — runs tests on push/PR; skips gracefully with
  a notice until a `test` script lands with #4.
- `.github/workflows/deploy-pages.yml` — builds with base `/openlive/` and
  deploys to GitHub Pages on push to main + manual dispatch. **Repo admin must
  set Settings → Pages → Source = GitHub Actions** or deploys will fail.

---

## 4. Gotchas / tribal knowledge

1. **Browser autoplay:** audio context starts only after a user gesture. Always `await engine.ensureStarted()` before play/preview.
2. **StrictMode** double-mounts React components; engine is a module singleton and guards with `if (this.unsubscribe) return`.
3. **Clip color** has no store action — editor uses `useProjectStore.setState` workaround (`features/editor/clipColor.ts`). Prefer a real `setClipColor` action if you touch the store again.
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
- [ ] Save / load project JSON + local persistence
- [ ] PWA / offline
- [ ] Unit tests for store + `noteUtils`
- [ ] `npm audit fix` / Vite bumps
- [ ] Browser panel actual drag-to-add-track
- [ ] Master volume in store
- [ ] Undo / redo

**Phase 2** (milestone "Phase 2 — Playable, Reliable, Tested", due 2026-08-20)
tracks several of these as issues: **#2** browser instruments, **#3** save/load,
**#4** tests, **#6** master volume, **#8** Tone.js bundle, **#11** shadcn lint,
**#12** undo/redo, **#13** slotByTrack drift. See `PHASE2.md`.

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

**New clip editor gesture**

1. Mutate notes only via `patchClipNotes` or `updateClipNotes` with **fresh** state.
2. Audition with `engine.ensureStarted().then(() => engine.previewNote(...))`.

**New visualizer**

1. Prefer rAF + DOM/canvas refs over React state per frame.
2. Read meters from engine; never start audio without a gesture path.

---

## 8. GitHub project management

**Repo:** https://github.com/AlexanderDaly/openlive (public)

| Tool | Purpose |
|------|---------|
| Issues + templates | bug / feature / shortfall forms |
| `SHORTFALLS.md` + `sync-shortfalls.yml` | Auto-open issues from tracked gaps |
| Labels (`scripts/sync-labels.mjs`) | P0–P3, area/*, shortfall, automated… |
| Milestones | P1 Near term · P2 Backlog · P3 Someday |
| CI (`ci.yml`) | `npm ci` + `npm run build` on push/PR |
| Dependabot | Weekly npm + Actions updates |
| Stale bot | Closes inactive issues/PRs |
| PR template | Contract checklist |

**Projects v2 board:** token needs `project` + `read:project` scopes:

```bash
gh auth refresh -s project,read:project
gh project create --owner AlexanderDaly --title "OpenLive Roadmap"
```

Then link open issues to the board in the GitHub UI.

## 9. Changelog (condensed)

| Date | Change |
|------|--------|
| 2026-07-23 | git init |
| 2026-07-23 | Full code review + test report |
| 2026-07-23 | Paint stale-state fix; loop; scenes; dual toms; reverb generate |
| 2026-07-23 | Session playing UI; pan label; package rename |
| 2026-07-23 | Beatbox-style `AsciiWave` in Browser + Transport |
| 2026-07-23 | This DEVLOG |
| 2026-07-23 | Public GitHub repo + issue automation + milestones |
| 2026-07-23 | Scene A seed fix (`playingClipByTrack: slotFor(0)`) — first Play has sound |
| 2026-07-23 | Phase 2 kickoff: milestone, `test.yml` + `deploy-pages.yml`, `PHASE2.md` |

---

*Last updated: 2026-07-23 — keep this file honest; delete stale advice, don’t accumulate myths.*
