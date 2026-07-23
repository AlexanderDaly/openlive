# Contributing to OpenLive

Thanks for helping build a free browser DAW.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # must pass before PR
```

Audio unlocks on the first click (browser autoplay policy).

## Architecture (non-negotiable)

```
UI → store actions → engine subscribes
```

- Do **not** call Tone.js outside `src/audio/engine.ts`.
- Do **not** let the engine write the store.
- Read `src/features/CONTRACT.md` and `DEVLOG.md` before large changes.

## Issues & project board

- Bugs → **Bug report** template  
- Features → **Feature request** template  
- Known gaps → **Project shortfall** template or `SHORTFALLS.md`  
- Pushing changes to `SHORTFALLS.md` on `main` auto-opens issues via Actions  

Labels: `P0`–`P3`, `area/*`, `bug`, `enhancement`, `shortfall`, `automated`.

## Pull requests

1. Branch from `main`.
2. Keep PRs focused; link `Closes #n`.
3. Ensure `npm run build` is green.
4. Fill the PR template checklist.

## Code style

- TypeScript strict; `import type` for type-only imports.
- No drive-by refactors in feature PRs.
- Match the dark Ableton-ish palette (`#1a1a1a`–`#2b2b2b`, accent `#ff8c2e`).

## License

MIT — see LICENSE.
