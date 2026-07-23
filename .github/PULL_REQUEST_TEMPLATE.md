## Summary
<!-- What and why (1–3 bullets). -->

## Type
- [ ] Bug fix
- [ ] Feature
- [ ] Shortfall / debt
- [ ] Docs / tooling
- [ ] Refactor (no behavior change)

## Contract checklist
- [ ] Store remains single source of truth; engine does not write the store
- [ ] No new direct Tone.js usage outside `src/audio/engine.ts`
- [ ] Feature UI only uses allowed engine APIs (`ensureStarted`, `previewNote`, meters, transport position)
- [ ] `npm run build` passes locally

## Test plan
- [ ] Manual: Session launch / stop
- [ ] Manual: Arrangement play + loop (if touched)
- [ ] Manual: Step grid paint (if editor touched)
- [ ] Manual: ASCII wave ON AIR while playing (if shell touched)

## Related issues
<!-- Closes #… -->
