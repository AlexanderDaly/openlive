/**
 * ChannelStrip.tsx — one vertical mixer channel strip per track.
 * Reads/writes the project store; meters read from the audio engine (read-only).
 */
import { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { engine } from '@/audio/engine';
import type { Track } from '@/types/daw';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Meter, MiniSlider, PanKnob, VerticalFader } from './controls';
import { useMeterLevel } from './useMeterLevel';

/** Linear 0..1 gain → dB-ish label (engine maps 0..1 to -inf..0dB). */
function dbLabel(v: number): string {
  if (v <= 0.001) return '-inf';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

function abbrev(name: string): string {
  const clean = name.trim();
  return clean.length > 7 ? clean.slice(0, 6).toUpperCase() + '…' : clean.toUpperCase();
}

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
}

export default function ChannelStrip({ track }: { track: Track }) {
  const setVolume = useProjectStore((s) => s.setVolume);
  const setPan = useProjectStore((s) => s.setPan);
  const toggleMute = useProjectStore((s) => s.toggleMute);
  const toggleSolo = useProjectStore((s) => s.toggleSolo);
  const setFxParam = useProjectStore((s) => s.setFxParam);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const level = useMeterLevel(() => engine.getTrackMeter(track.id));

  return (
    <div className="flex w-16 shrink-0 flex-col items-stretch gap-1.5 overflow-y-auto border-r border-[#2a2a2a] bg-[#1b1b1b] px-1.5 py-2">
      {/* header: color chip + abbreviated name + remove */}
      <div className="group relative flex items-center gap-1">
        <span
          className="h-3.5 w-1.5 shrink-0 rounded-[1px]"
          style={{ backgroundColor: track.color }}
        />
        <span
          className="min-w-0 flex-1 truncate text-[9px] font-semibold tracking-wide text-neutral-300"
          title={track.name}
        >
          {abbrev(track.name)}
        </span>
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          title={`Remove ${track.name}`}
          className="absolute -right-0.5 -top-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-[#2b2b2b] text-[9px] leading-none text-neutral-400 hover:bg-[#e0483c] hover:text-black group-hover:flex"
        >
          ×
        </button>
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Remove track"
          description={`Remove track “${track.name}” and all its clips? You can undo with Ctrl/Cmd+Z.`}
          confirmLabel="Remove"
          onConfirm={() => removeTrack(track.id)}
        />
      </div>

      {/* M / S */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => toggleMute(track.id)}
          title="Mute"
          className={`h-4 flex-1 rounded-[2px] border text-[9px] font-bold leading-none ${
            track.muted
              ? 'border-[#e0a43c] bg-[#e0a43c] text-black'
              : 'border-[#333] bg-[#242424] text-neutral-400 hover:border-neutral-500'
          }`}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => toggleSolo(track.id)}
          title="Solo"
          className={`h-4 flex-1 rounded-[2px] border text-[9px] font-bold leading-none ${
            track.soloed
              ? 'border-[#38bdf8] bg-[#38bdf8] text-black'
              : 'border-[#333] bg-[#242424] text-neutral-400 hover:border-neutral-500'
          }`}
        >
          S
        </button>
      </div>

      {/* pan */}
      <PanKnob value={track.pan} onChange={(v) => setPan(track.id, v)} />

      {/* meter + fader */}
      <div className="flex items-stretch justify-center gap-2" style={{ height: 112 }}>
        <Meter level={level} />
        <VerticalFader
          value={track.volume}
          onChange={(v) => setVolume(track.id, v)}
          defaultValue={0.8}
          title={`${track.name} volume — double-click to reset`}
        />
      </div>
      <div className="text-center text-[8px] tabular-nums text-neutral-400">
        {dbLabel(track.volume)}
      </div>

      {/* FX mini-section */}
      <div className="flex flex-col gap-1 border-t border-[#2a2a2a] pt-1.5">
        <MiniSlider
          label="REV"
          value={track.fx.reverb}
          min={0}
          max={1}
          onChange={(v) => setFxParam(track.id, 'reverb', v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <MiniSlider
          label="DLY"
          value={track.fx.delay}
          min={0}
          max={1}
          onChange={(v) => setFxParam(track.id, 'delay', v)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <MiniSlider
          label="FLT"
          value={track.fx.filterFreq}
          min={20}
          max={18000}
          log
          onChange={(v) => setFxParam(track.id, 'filterFreq', v)}
          format={formatHz}
        />
      </div>
    </div>
  );
}
