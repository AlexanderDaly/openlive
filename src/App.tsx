/**
 * OpenLive — app shell (owned by the foundation).
 * Full-viewport dark DAW layout:
 *   top    TransportBar
 *   left   BrowserPanel | center SessionView/ArrangementView | right MixerPanel
 *   bottom DetailPanel (ClipEditor + DeviceRack)
 * Also owns global undo/redo keyboard shortcuts and the center-view drop
 * target for browser instruments (drop → new track with that instrument).
 */
import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import TransportBar from '@/components/TransportBar';
import BrowserPanel from '@/components/BrowserPanel';
import DetailPanel from '@/components/DetailPanel';
import SessionView from '@/features/session/SessionView';
import ArrangementView from '@/features/arrangement/ArrangementView';
import MixerPanel from '@/features/mixer/MixerPanel';
import { useProjectStore } from '@/store/projectStore';
import { redo, undo } from '@/store/history';
import { INSTRUMENT_DRAG_TYPE, instrumentMeta, instrumentTrackInit } from '@/lib/instruments';
import type { InstrumentKind } from '@/types/daw';

const isTypingTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

export default function App() {
  const view = useProjectStore((s) => s.view);
  const addTrack = useProjectStore((s) => s.addTrack);
  const [dropKind, setDropKind] = useState<InstrumentKind | null>(null);

  // Global undo/redo shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- browser-instrument drop target (center view) ----
  const readKind = (e: DragEvent): InstrumentKind | null => {
    if (!e.dataTransfer.types.includes(INSTRUMENT_DRAG_TYPE)) return null;
    // types are visible during dragover; the payload only on drop.
    const raw = e.dataTransfer.getData(INSTRUMENT_DRAG_TYPE);
    return (raw || null) as InstrumentKind | null;
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(INSTRUMENT_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dropKind === null) setDropKind('keys'); // generic hint until drop
  };

  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropKind(null);
  };

  const onDrop = (e: DragEvent) => {
    const kind = readKind(e);
    setDropKind(null);
    if (!kind) return;
    e.preventDefault();
    addTrack(instrumentTrackInit(kind, useProjectStore.getState().tracks));
  };

  return (
    <div className="grid h-screen w-screen grid-cols-[220px_1fr_280px] grid-rows-[48px_1fr_240px] overflow-hidden bg-[#1a1a1a] text-neutral-200">
      {/* Transport — full width */}
      <div className="col-span-3">
        <TransportBar />
      </div>

      {/* Browser — left, spans center + detail rows */}
      <div className="row-span-2 min-h-0">
        <BrowserPanel />
      </div>

      {/* Center — session or arrangement (accepts instrument drops) */}
      <main
        className="relative min-h-0 min-w-0"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {view === 'session' ? <SessionView /> : <ArrangementView />}
        {dropKind !== null && (
          <div className="pointer-events-none absolute inset-1 z-50 flex items-center justify-center rounded-[4px] border-2 border-dashed border-[#ff8c2e]/70 bg-[#ff8c2e]/5">
            <span className="rounded-sm bg-[#1a1a1a]/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ff8c2e]">
              Drop to add {instrumentMeta(dropKind).trackName} track
            </span>
          </div>
        )}
      </main>

      {/* Mixer — right, spans center + detail rows */}
      <div className="row-span-2 min-h-0">
        <MixerPanel />
      </div>

      {/* Detail — bottom center */}
      <div className="min-h-0 min-w-0">
        <DetailPanel />
      </div>
    </div>
  );
}
