/**
 * ArrangementView — horizontal timeline of the arrangement.
 * Owned by the Arrangement feature agent. See `src/features/CONTRACT.md`.
 *
 * Reads:  tracks, clips, arrangementClips, selectedClipId, isPlaying, view, bpm
 * Writes: selectClip, addToArrangement, moveArrangementClip,
 *         resizeArrangementClip, removeArrangementClip (via ClipBlock)
 *
 * Audio is never triggered here — store→engine sync is automatic.
 * The playhead only POLLS engine.getTransportPosition() (read-only).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { STEPS_PER_BAR } from '@/types/daw';
import { useProjectStore } from '@/store/projectStore';
import { engine } from '@/audio/engine';
import { ClipBlock } from './ClipBlock';
import ConfirmDialog from '@/components/ConfirmDialog';

const GUTTER_W = 160;
const RULER_H = 24;
const LANE_H = 56;
const MIN_PX_PER_BAR = 16;
const MAX_PX_PER_BAR = 256;

/** Parse 'bars:beats:sixteenths' into a fractional bar position. */
function positionToBars(pos: string): number {
  const [b, beats, six] = pos.split(':');
  const bars = parseFloat(b ?? '0') || 0;
  const beatF = parseFloat(beats ?? '0') || 0;
  const sixF = parseFloat(six ?? '0') || 0;
  return bars + beatF / 4 + sixF / 16;
}

export default function ArrangementView() {
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const arrangementClips = useProjectStore((s) => s.arrangementClips);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const view = useProjectStore((s) => s.view);
  const bpm = useProjectStore((s) => s.bpm);
  const selectClip = useProjectStore((s) => s.selectClip);
  const addToArrangement = useProjectStore((s) => s.addToArrangement);
  const removeArrangementClip = useProjectStore((s) => s.removeArrangementClip);
  const loop = useProjectStore((s) => s.loop);
  const setLoop = useProjectStore((s) => s.setLoop);

  const [pxPerBar, setPxPerBar] = useState(64);
  const [selectedArrId, setSelectedArrId] = useState<string | null>(null);
  const [confirmRemoveArrId, setConfirmRemoveArrId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const loopDragRef = useRef<{ anchorBar: number; downX: number; moved: boolean } | null>(null);

  /* ---------------- derived layout values ---------------- */

  const maxEndBar = useMemo(
    () => arrangementClips.reduce((m, a) => Math.max(m, a.startBar + a.lengthBars), 0),
    [arrangementClips],
  );
  const totalBars = Math.max(32, maxEndBar + 8);
  const timelineW = totalBars * pxPerBar;
  // Label density adapts to zoom so numbers never collide.
  const labelEvery = pxPerBar >= 48 ? 1 : pxPerBar >= 28 ? 2 : 4;

  const clipsByTrack = useMemo(() => {
    const map = new Map<string, typeof arrangementClips>();
    for (const a of arrangementClips) {
      const list = map.get(a.trackId) ?? [];
      list.push(a);
      map.set(a.trackId, list);
    }
    return map;
  }, [arrangementClips]);

  const selectedPoolClip = selectedClipId ? clips[selectedClipId] : undefined;

  /* ---------------- playhead (poll engine, read-only) ---------------- */

  const playheadActive = isPlaying && view === 'arrangement';
  useEffect(() => {
    const el = playheadRef.current;
    if (!playheadActive) {
      if (el) el.style.display = 'none';
      return;
    }
    let raf = 0;
    const tick = () => {
      let bars = 0;
      try {
        bars = positionToBars(engine.getTransportPosition());
      } catch {
        // Transport not ready yet (audio not started) — keep playhead at 0.
      }
      const x = bars * pxPerBar;
      const node = playheadRef.current;
      if (node) {
        node.style.display = 'block';
        node.style.transform = `translateX(${x}px)`;
      }
      // Auto-scroll: keep the playhead inside the visible timeline window.
      const sc = scrollRef.current;
      if (sc) {
        const viewL = sc.scrollLeft + GUTTER_W;
        const viewR = sc.scrollLeft + sc.clientWidth - 24;
        if (x < viewL || x > viewR) {
          sc.scrollLeft = Math.max(0, x - GUTTER_W - 48);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playheadActive, pxPerBar]);

  /* ---------------- keyboard delete ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selectedArrId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      setConfirmRemoveArrId(selectedArrId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedArrId]);

  /* ---------------- actions ---------------- */

  const zoom = (dir: 1 | -1) => {
    setPxPerBar((p) => {
      const next = dir > 0 ? Math.round(p * 1.5) : Math.round(p / 1.5);
      return Math.min(MAX_PX_PER_BAR, Math.max(MIN_PX_PER_BAR, next));
    });
  };

  const handleAddAtEnd = () => {
    if (!selectedPoolClip) return;
    const lengthBars = Math.max(1, Math.ceil(selectedPoolClip.lengthSteps / STEPS_PER_BAR));
    addToArrangement(selectedPoolClip.id, selectedPoolClip.trackId, maxEndBar, lengthBars);
  };

  /* ---------------- loop region (drag on ruler) ---------------- */

  const barFromRulerEvent = (e: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(totalBars - 1, Math.floor((e.clientX - rect.left) / pxPerBar)));
  };

  const onRulerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    loopDragRef.current = { anchorBar: barFromRulerEvent(e), downX: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onRulerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = loopDragRef.current;
    if (!d) return;
    const cur = barFromRulerEvent(e);
    // Click vs drag is decided by PIXELS, not bar equality — otherwise a
    // drag inside a single bar reads as a click and a 1-bar loop is
    // impossible to create.
    if (!d.moved && (cur !== d.anchorBar || Math.abs(e.clientX - d.downX) >= 4)) d.moved = true;
    if (!d.moved) return;
    // Inclusive selection: the anchor bar AND the bar under the cursor are
    // both inside the loop (dragging across bars 2→4 loops bars 2..4).
    setLoop({
      startBar: Math.min(d.anchorBar, cur),
      lengthBars: Math.abs(cur - d.anchorBar) + 1,
    });
  };

  const onRulerUp = () => {
    const d = loopDragRef.current;
    loopDragRef.current = null;
    if (d && !d.moved) setLoop(null); // plain click (no drag) clears
  };

  /* ---------------- render ---------------- */

  return (
    <div className="flex h-full flex-col bg-[#141414] text-neutral-300">
      {/* toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#333] bg-[#1a1a1a] px-2">
        <span className="text-[10px] font-semibold tracking-widest text-neutral-400 uppercase">
          Arrangement
        </span>
        <span className="text-[10px] text-neutral-600">{bpm} BPM</span>

        <div className="ml-2 flex items-center border border-[#333]">
          <button
            type="button"
            aria-label="Zoom out"
            className="h-5 w-5 text-[11px] text-neutral-400 hover:bg-[#2b2b2b] hover:text-neutral-200"
            onClick={() => zoom(-1)}
          >
            −
          </button>
          <span className="border-x border-[#333] px-1.5 text-[9px] text-neutral-500 tabular-nums">
            {pxPerBar}px/bar
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            className="h-5 w-5 text-[11px] text-neutral-400 hover:bg-[#2b2b2b] hover:text-neutral-200"
            onClick={() => zoom(1)}
          >
            ＋
          </button>
        </div>

        <div className="flex-1" />

        {selectedPoolClip ? (
          <button
            type="button"
            className="h-5 border border-[#ff8c2e] px-2 text-[9px] font-semibold tracking-wider text-[#ff8c2e] uppercase hover:bg-[#ff8c2e] hover:text-black"
            onClick={handleAddAtEnd}
            title={`Append "${selectedPoolClip.name}" at bar ${maxEndBar + 1}`}
          >
            ＋ Add “{selectedPoolClip.name}” at end
          </button>
        ) : (
          <span className="text-[9px] tracking-wider text-neutral-600 uppercase">
            Select a session clip to add it here
          </span>
        )}
      </div>

      {/* scrollable body: sticky gutter + timeline share one scroll context */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div className="flex" style={{ width: GUTTER_W + timelineW, minHeight: '100%' }}>
          {/* left gutter — sticky on horizontal scroll */}
          <div
            className="sticky left-0 z-30 shrink-0 border-r border-[#333] bg-[#181818]"
            style={{ width: GUTTER_W }}
          >
            <div
              className="flex items-center border-b border-[#333] px-2 text-[9px] tracking-widest text-neutral-600 uppercase"
              style={{ height: RULER_H }}
            >
              Tracks
            </div>
            {tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 border-b border-[#262626] px-2"
                style={{ height: LANE_H }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: t.color }}
                />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-neutral-200">{t.name}</div>
                  <div className="text-[9px] tracking-wider text-neutral-600 uppercase">
                    {t.instrument}
                    {t.muted ? ' · muted' : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* timeline content */}
          <div className="relative shrink-0" style={{ width: timelineW }}>
            {/* bar ruler — sticky on vertical scroll, drag to set loop region */}
            <div
              className="sticky top-0 z-20 flex cursor-text border-b border-[#333] bg-[#1a1a1a]"
              style={{ height: RULER_H }}
              onPointerDown={onRulerDown}
              onPointerMove={onRulerMove}
              onPointerUp={onRulerUp}
              title="Drag to set transport loop · click to clear"
            >
              {Array.from({ length: totalBars }, (_, i) => (
                <div
                  key={i}
                  className="shrink-0 border-r border-[#2b2b2b] pl-1 text-[9px] leading-6 text-neutral-500 tabular-nums select-none"
                  style={{ width: pxPerBar }}
                >
                  {i % labelEvery === 0 ? i + 1 : ''}
                </div>
              ))}
              {/* loop marker strip inside the ruler */}
              {loop && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 bg-[#ff8c2e]/20"
                  style={{
                    left: loop.startBar * pxPerBar,
                    width: loop.lengthBars * pxPerBar,
                  }}
                />
              )}
            </div>

            {/* lanes with faint bar grid hairlines */}
            <div
              className="relative"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, #242424 0, #242424 1px, transparent 1px, transparent ${pxPerBar}px)`,
              }}
              onPointerDown={() => {
                setSelectedArrId(null);
                selectClip(null);
              }}
            >
              {tracks.map((t) => {
                const laneClips = clipsByTrack.get(t.id) ?? [];
                return (
                  <div
                    key={t.id}
                    className="relative border-b border-[#262626]"
                    style={{ height: LANE_H }}
                  >
                    {laneClips.length === 0 && (
                      <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-[3px] border border-dashed border-[#333] text-[9px] tracking-widest text-neutral-700 uppercase">
                        Drop zone
                      </div>
                    )}
                    {laneClips.map((ac) => {
                      const clip = clips[ac.clipId];
                      if (!clip) return null;
                      return (
                        <ClipBlock
                          key={ac.id}
                          ac={ac}
                          clip={clip}
                          pxPerBar={pxPerBar}
                          selected={selectedArrId === ac.id}
                          onSelect={setSelectedArrId}
                          onRequestRemove={setConfirmRemoveArrId}
                        />
                      );
                    })}
                  </div>
                );
              })}

              {/* loop region highlight across lanes */}
              {loop && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 border-x border-[#ff8c2e]/25 bg-[#ff8c2e]/5"
                  style={{
                    left: loop.startBar * pxPerBar,
                    width: loop.lengthBars * pxPerBar,
                  }}
                />
              )}
            </div>

            {/* playhead — positioned via transform from the rAF poll */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 bottom-0 left-0 z-40 w-px bg-[#ff8c2e]"
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveArrId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveArrId(null);
        }}
        title="Remove arrangement clip"
        description={`Remove “${
          clips[arrangementClips.find((a) => a.id === confirmRemoveArrId)?.clipId ?? '']?.name ??
          'clip'
        }” from the timeline? You can undo with Ctrl/Cmd+Z.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmRemoveArrId) removeArrangementClip(confirmRemoveArrId);
          setSelectedArrId(null);
        }}
      />
    </div>
  );
}
