/**
 * BrowserPanel — left rail of the DAW shell (owned by the foundation).
 * Instrument list (click or drag-into-center to add a track), FX hints,
 * and the Beatbox-style ASCII sound-field visualizer.
 */
import type { DragEvent } from 'react';
import { Drum, Music, Piano, Plus, Waves, Clock3, SlidersHorizontal } from 'lucide-react';
import AsciiWave from '@/components/AsciiWave';
import { useProjectStore } from '@/store/projectStore';
import { INSTRUMENT_DRAG_TYPE, INSTRUMENTS, instrumentTrackInit } from '@/lib/instruments';
import type { InstrumentKind } from '@/types/daw';

function InstrumentIcon({ kind }: { kind: InstrumentKind }) {
  switch (kind) {
    case 'drumkit':
      return <Drum size={14} />;
    case 'bass':
      return <Music size={14} />;
    default:
      return <Piano size={14} />;
  }
}

/** Draggable + clickable instrument entry: both paths create a track. */
function InstrumentItem({ kind, label }: { kind: InstrumentKind; label: string }) {
  const addTrack = useProjectStore((s) => s.addTrack);

  const add = () => {
    addTrack(instrumentTrackInit(kind, useProjectStore.getState().tracks));
  };

  const onDragStart = (e: DragEvent<HTMLLIElement>) => {
    e.dataTransfer.setData(INSTRUMENT_DRAG_TYPE, kind);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onClick={add}
      title={`Click (or drag into the center view) to add a ${label} track`}
      className="group flex cursor-grab items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-neutral-300 hover:bg-[#2b2b2b] active:cursor-grabbing"
    >
      <span className="text-[#ff8c2e]">
        <InstrumentIcon kind={kind} />
      </span>
      {label}
      <Plus className="ml-auto h-3 w-3 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100" />
    </li>
  );
}

interface HintItem {
  icon: React.ReactNode;
  label: string;
  hint: string;
}

function HintCategory({ title, items }: { title: string; items: HintItem[] }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </p>
      <ul>
        {items.map((it) => (
          <li
            key={it.label}
            title={it.hint}
            className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-neutral-300 hover:bg-[#2b2b2b]"
          >
            <span className="text-[#ff8c2e]">{it.icon}</span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrowserPanel() {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-neutral-800 bg-[#1e1e1e] p-2">
      <p className="mb-2 shrink-0 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
        Browser
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-3">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Instruments
          </p>
          <ul>
            {INSTRUMENTS.map((m) => (
              <InstrumentItem key={m.kind} kind={m.kind} label={m.label} />
            ))}
          </ul>
          <p className="mt-1 px-2 text-[9px] leading-relaxed text-neutral-600">
            Click or drag into the center view to add a track.
          </p>
        </div>
        <HintCategory
          title="Audio FX"
          items={[
            { icon: <Waves size={14} />, label: 'Reverb', hint: 'Send FX — adjust in the device rack' },
            { icon: <Clock3 size={14} />, label: 'Delay', hint: 'Send FX — adjust in the device rack' },
            { icon: <SlidersHorizontal size={14} />, label: 'Filter', hint: 'Per-track low-pass filter' },
          ]}
        />
      </div>

      {/* Beatbox-style ASCII sound field — live master-level reactive */}
      <div className="mt-2 shrink-0">
        <AsciiWave />
        <p className="mt-1.5 px-1 text-[9px] leading-relaxed text-neutral-600">
          ASCII wave reacts to master level. Press ▶ to go ON AIR.
        </p>
      </div>
    </aside>
  );
}
