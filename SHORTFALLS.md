# OpenLive shortfalls

Tracked gaps and debt. Each block below is picked up by
`.github/workflows/sync-shortfalls.yml` and turned into a GitHub issue.

**Marker format**

```md
<!-- issue: unique-kebab-id -->
### Human title
Body / acceptance criteria…
```

After the sync workflow runs, markers become `<!-- issue: id #123 -->`.

---

## Active shortfalls

<!-- issue: browser-drag-instruments -->
### Browser panel instruments are non-functional
Dragging Drum Kit / Bass / Keys from the left browser does nothing.
Items are static hints only — no `addTrack` / instrument assign path.

**Acceptance**
- [ ] Drag (or click) an instrument creates or configures a track
- [ ] New track appears in session matrix + mixer
- [ ] Engine builds the matching voice chain

**Priority:** P1 · **Area:** shell / session · **Source:** code review 2026-07-23

<!-- issue: no-project-persistence -->
### No save / load project persistence
Projects live only in memory. Refresh loses all edits. Roadmap item from README.

**Acceptance**
- [ ] Export project JSON (tracks, clips, matrix, scenes, arrangement, transport)
- [ ] Import / load JSON
- [ ] Optional `localStorage` autosave

**Priority:** P1 · **Area:** store · **Source:** README roadmap

<!-- issue: no-automated-tests -->
### No automated test suite
`package.json` has no `test` script. Regressions rely on manual QA + `npm run build`.

**Acceptance**
- [ ] Vitest (or similar) wired in CI
- [ ] Store action unit tests (launchScene, deleteClip cascade, setLoop)
- [ ] `noteUtils` / `patchClipNotes` pure tests

**Priority:** P1 · **Area:** tooling · **Source:** code review 2026-07-23

<!-- issue: npm-audit-highs -->
### npm audit reports high severity dev-tooling vulns
Vite / Rollup / PostCSS advisories (mostly dev-server). Run `npm audit fix` and bump.

**Acceptance**
- [ ] `npm audit` clean or only accepted residual risks documented
- [ ] Dependabot PRs reviewed for vite major

**Priority:** P2 · **Area:** tooling / security · **Source:** npm audit 2026-07-23

<!-- issue: master-volume-missing -->
### No master volume control in the store
Engine master gain is fixed at `0.9`. Master strip is meter-only.

**Acceptance**
- [ ] `masterVolume` (or similar) on project state
- [ ] Engine applies it; mixer Master strip can change it

**Priority:** P2 · **Area:** mixer / engine · **Source:** code review

<!-- issue: meter-raf-storm -->
### Per-strip requestAnimationFrame meter loops
Session headers, mixer channels, master, and ASCII wave each run independent rAF loops.
Fine at 4 tracks; will not scale.

**Acceptance**
- [ ] Shared meter clock or single rAF bus
- [ ] No more than one rAF subscription infrastructure-wide for levels

**Priority:** P3 · **Area:** performance · **Source:** code review

<!-- issue: bundle-size-tone -->
### Production JS bundle ~600 kB (Tone.js dominates)
First load is heavy. Consider dynamic `import('tone')` after first user gesture.

**Acceptance**
- [ ] Initial route JS significantly smaller without Tone
- [ ] Engine loads on first `ensureStarted()`

**Priority:** P2 · **Area:** engine / perf · **Source:** vite build warning

<!-- issue: midi-input -->
### MIDI input not implemented
Roadmap: play/record from hardware via Web MIDI API.

**Acceptance**
- [ ] Device picker / permission flow
- [ ] Notes route to selected track with preview + optional record-into-clip

**Priority:** P2 · **Area:** engine / devices · **Source:** README roadmap

<!-- issue: audio-tracks-samples -->
### No audio tracks or sample-based kits
Everything is pure synth. Users cannot import/record audio.

**Acceptance**
- [ ] Design for audio clip model (may extend `daw.ts` carefully)
- [ ] Sample drum kit path or audio track MVP

**Priority:** P3 · **Area:** engine · **Source:** README roadmap

<!-- issue: eslint-ui-template-noise -->
### ESLint fails on shadcn ui template exports
`components/ui/*` trips `react-refresh/only-export-components` and sidebar purity rules.
CI currently continues-on-error for lint.

**Acceptance**
- [ ] ESLint override for `src/components/ui/**` or fix exports
- [ ] `npm run lint` clean; CI lint job blocking

**Priority:** P2 · **Area:** tooling · **Source:** eslint run

<!-- issue: undo-redo -->
### No undo / redo
Destructive edits (delete clip, paint notes) cannot be reversed.

**Acceptance**
- [ ] Temporal stack or zundo middleware on project store
- [ ] Ctrl/Cmd+Z / Shift+Ctrl+Z in shell

**Priority:** P2 · **Area:** store · **Source:** code review

<!-- issue: scene-matrix-drift -->
### Scene.slotByTrack can drift from sessionMatrix
Launch path now uses matrix, but scene objects still store a snapshot that is not always updated on `setSlot` / `createClip`.

**Acceptance**
- [ ] Either drop slotByTrack from runtime path docs or keep scenes synced on every matrix write
- [ ] Tests covering createClip → launchScene

**Priority:** P2 · **Area:** store / session · **Source:** fix follow-up 2026-07-23
