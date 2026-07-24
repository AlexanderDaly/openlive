/**
 * MasterStrip.tsx — master channel strip at the far right of the mixer.
 * Meter comes from `engine.getMasterMeter()`; the fader now drives the
 * store's REAL `masterVolume` (the engine follows the store).
 */
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';
import { Meter, VerticalFader } from './controls';
import { useMeterLevel } from './useMeterLevel';

function dbLabel(v: number): string {
  if (v <= 0.001) return '-inf';
  const db = 20 * Math.log10(v);
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}

export default function MasterStrip() {
  const volume = useProjectStore((s) => s.masterVolume);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const level = useMeterLevel(() => engine.getMasterMeter());

  return (
    <div className="flex w-16 shrink-0 flex-col items-stretch gap-1.5 overflow-y-auto bg-[#202020] px-1.5 py-2 shadow-[inset_1px_0_0_#333]">
      {/* header */}
      <div className="flex items-center gap-1">
        <span className="h-3.5 w-1.5 shrink-0 rounded-[1px] bg-[#ff8c2e]" />
        <span className="min-w-0 flex-1 truncate text-[9px] font-semibold tracking-wide text-[#ff8c2e]">
          MASTER
        </span>
      </div>

      <div className="flex-1" />

      {/* meter + fader */}
      <div className="flex items-stretch justify-center gap-2" style={{ height: 128 }}>
        <Meter level={level} />
        <VerticalFader
          value={volume}
          onChange={setMasterVolume}
          defaultValue={0.9}
          title="Master volume — double-click to reset"
        />
      </div>
      <div className="text-center text-[8px] tabular-nums text-neutral-400">{dbLabel(volume)}</div>
    </div>
  );
}
