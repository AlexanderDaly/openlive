/**
 * DeviceRack — bottom-panel device rack for the selected clip's track.
 * Owned by the Devices feature agent. See `src/features/CONTRACT.md`.
 *
 * - drumkit tracks → DrumRack pad grid (4×4, 7 active voices C1..B1)
 * - bass/keys tracks → SynthPanel macros (cutoff wired to filterFreq)
 * - all tracks → FxRack device chain (Reverb / Delay / Filter via setFxParam)
 *
 * Everything reads live store state for the track that owns the
 * currently selected clip; writes go through store actions only.
 */
import { useProjectStore } from '@/store/projectStore';
import DrumRack from './DrumRack';
import FxRack from './FxRack';
import SynthPanel from './SynthPanel';

export default function DeviceRack() {
  const clip = useProjectStore((s) => (s.selectedClipId ? s.clips[s.selectedClipId] : undefined));
  const track = useProjectStore((s) => s.tracks.find((t) => t.id === clip?.trackId));

  return (
    <div className="flex h-full flex-col border-l border-neutral-800 bg-[#1a1a1a]">
      {/* header: selected track identity */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 bg-[#222] px-2">
        {track ? (
          <>
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: track.color }} />
            <span className="truncate text-[10px] font-semibold tracking-wider text-neutral-200 uppercase">
              {track.name}
            </span>
            <span className="ml-auto shrink-0 text-[8px] tracking-widest text-neutral-500 uppercase">
              {track.instrument} · devices
            </span>
          </>
        ) : (
          <span className="text-[9px] tracking-widest text-neutral-500 uppercase">
            Devices
          </span>
        )}
      </div>

      {track ? (
        <div className="flex-1 overflow-y-auto">
          {track.instrument === 'drumkit' ? (
            <DrumRack track={track} clip={clip} />
          ) : (
            <SynthPanel track={track} />
          )}
          <FxRack track={track} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-[10px] leading-relaxed text-neutral-500">
            Select a clip to show
            <br />
            its track's devices.
          </p>
        </div>
      )}
    </div>
  );
}
