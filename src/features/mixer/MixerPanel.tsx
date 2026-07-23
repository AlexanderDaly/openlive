/**
 * MixerPanel — right-rail mixer for OpenLive.
 *
 * One vertical channel strip per track plus a master strip at the far
 * right. Reads track state from the zustand project store and writes
 * via store actions (setVolume / setPan / toggleMute / toggleSolo /
 * setFxParam / addTrack / removeTrack). Level meters are read-only from
 * the audio engine — the engine syncs itself to the store.
 *
 * Owned by the Mixer feature agent. See `src/features/CONTRACT.md`.
 */
import { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import type { InstrumentKind } from '@/types/daw';
import ChannelStrip from './ChannelStrip';
import MasterStrip from './MasterStrip';

/** Add Track cycles through instrument kinds. */
const KIND_ORDER: InstrumentKind[] = ['drumkit', 'bass', 'keys'];

const KIND_META: Record<InstrumentKind, { label: string; color: string; type: 'midi' | 'drums' }> = {
  drumkit: { label: 'Drums', color: '#e05c5c', type: 'drums' },
  bass: { label: 'Bass', color: '#e0a43c', type: 'midi' },
  keys: { label: 'Keys', color: '#5cb56a', type: 'midi' },
};

export default function MixerPanel() {
  const tracks = useProjectStore((s) => s.tracks);
  const addTrack = useProjectStore((s) => s.addTrack);
  const [kindIdx, setKindIdx] = useState(0);

  const nextKind = KIND_ORDER[kindIdx % KIND_ORDER.length];
  const meta = KIND_META[nextKind];

  const handleAddTrack = () => {
    addTrack({
      name: `${meta.label} ${tracks.filter((t) => t.instrument === nextKind).length + 1}`,
      type: meta.type,
      instrument: nextKind,
      color: meta.color,
    });
    setKindIdx((i) => i + 1);
  };

  return (
    <div className="flex h-full w-full flex-col border-l border-[#333] bg-[#141414]">
      {/* panel header */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-[#333] bg-[#1a1a1a] px-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400">
          Mixer
        </span>
        <button
          type="button"
          onClick={handleAddTrack}
          title={`Add ${meta.label} track (cycles drumkit → bass → keys)`}
          className="rounded-[2px] border border-[#3a3a3a] bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-neutral-300 hover:border-[#ff8c2e] hover:text-[#ff8c2e]"
        >
          + {meta.label}
        </button>
      </div>

      {/* strips — horizontal scroll when tracks overflow */}
      <div className="flex min-h-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        {tracks.map((track) => (
          <ChannelStrip key={track.id} track={track} />
        ))}
        <MasterStrip />
      </div>
    </div>
  );
}
