/**
 * ClipEditor — bottom-panel clip detail view.
 * Step sequencer (drums) / mini piano-roll (melodic) for the clip
 * referenced by the store's `selectedClipId`. All pattern writes go
 * through `updateClipNotes`; naming through `renameClip`; audition via
 * `launchClip` / `stopTrackClip` (the engine syncs from the store).
 * Clip color has no contract action, so a local store-level workaround
 * (`./clipColor`) patches it through zustand's public setState.
 */
import { useState } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';
import { STEPS_PER_BAR } from '@/types/daw';
import { setClipColor } from './clipColor';
import DrumGrid from './DrumGrid';
import MelodicGrid from './MelodicGrid';
import { usePlayheadStep } from './usePlayhead';

const CLIP_COLORS = [
  '#e05c5c',
  '#e07a45',
  '#e0a43c',
  '#5cb56a',
  '#4a90d9',
  '#b06fc9',
  '#ff8c2e',
  '#8a8a8a',
];

export default function ClipEditor() {
  const clip = useProjectStore((s) => (s.selectedClipId ? s.clips[s.selectedClipId] : undefined));
  const track = useProjectStore((s) => {
    const c = s.selectedClipId ? s.clips[s.selectedClipId] : undefined;
    return c ? s.tracks.find((t) => t.id === c.trackId) : undefined;
  });
  const isClipPlaying = useProjectStore((s) => {
    const c = s.selectedClipId ? s.clips[s.selectedClipId] : undefined;
    return c ? s.playingClipByTrack[c.trackId] === c.id : false;
  });
  const renameClip = useProjectStore((s) => s.renameClip);
  const launchClip = useProjectStore((s) => s.launchClip);
  const stopTrackClip = useProjectStore((s) => s.stopTrackClip);
  const togglePlay = useProjectStore((s) => s.togglePlay);

  const [draftName, setDraftName] = useState<string | null>(null);
  const playheadStep = usePlayheadStep(clip?.lengthSteps ?? STEPS_PER_BAR);

  /* ---------------- empty state ---------------- */
  if (!clip || !track) {
    return (
      <div className="flex h-full items-center justify-center bg-[#161616]">
        <div className="text-center">
          <div className="mx-auto mb-3 grid w-fit grid-cols-4 gap-[3px] opacity-40">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-[2px] ${
                  i % 5 === 0 ? 'bg-[#ff8c2e]' : 'bg-[#2c2c2c]'
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            No clip selected
          </p>
          <p className="mt-1 text-[10px] text-neutral-600">
            Select a clip in the session or arrangement view to edit its pattern
          </p>
        </div>
      </div>
    );
  }

  /* ---------------- header handlers ---------------- */
  const commitName = () => {
    if (draftName !== null) {
      const name = draftName.trim();
      if (name && name !== clip.name) renameClip(clip.id, name);
    }
    setDraftName(null);
  };

  const onAudition = () => {
    if (isClipPlaying) {
      stopTrackClip(clip.trackId);
      return;
    }
    void engine
      .ensureStarted()
      .then(() => {
        launchClip(clip.trackId, clip.id);
        if (!useProjectStore.getState().isPlaying) togglePlay();
      })
      .catch(() => {
        /* audio unlock failed — stay silent */
      });
  };

  const bars = clip.lengthSteps / STEPS_PER_BAR;
  const isDrums = track.type === 'drums' || track.instrument === 'drumkit';

  return (
    <div className="flex h-full flex-col bg-[#161616] text-neutral-300">
      {/* ---------- header ---------- */}
      <div className="flex items-center gap-2 border-b border-[#2c2c2c] bg-[#1b1b1b] px-3 py-1.5">
        <span className="text-[9px] uppercase tracking-[0.18em] text-neutral-600">Clip</span>
        <span
          className="h-3 w-3 shrink-0 rounded-[2px]"
          style={{ backgroundColor: clip.color }}
        />
        <input
          value={draftName ?? clip.name}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitName();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setDraftName(null);
              e.currentTarget.blur();
            }
          }}
          spellCheck={false}
          className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium text-neutral-200 outline-none hover:border-[#333] focus:border-[#ff8c2e]"
        />
        <div className="flex items-center gap-1">
          {CLIP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setClipColor(clip.id, c)}
              className={`h-3.5 w-3.5 rounded-[2px] transition-transform hover:scale-110 ${
                clip.color.toLowerCase() === c.toLowerCase()
                  ? 'ring-1 ring-white/70'
                  : 'ring-1 ring-black/40'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <span className="ml-2 text-[9px] uppercase tracking-wider text-neutral-600">
          {bars} {bars === 1 ? 'bar' : 'bars'} · {clip.lengthSteps} steps · {clip.notes.length}{' '}
          notes
        </span>
        <span className="text-[9px] uppercase tracking-wider text-neutral-700">
          {track.name} · {track.instrument}
        </span>
        <button
          type="button"
          onClick={onAudition}
          className={`ml-auto flex h-6 items-center gap-1.5 rounded border px-2 text-[10px] uppercase tracking-wider transition-colors ${
            isClipPlaying
              ? 'border-[#ff8c2e] text-[#ff8c2e] hover:bg-[#ff8c2e]/10'
              : 'border-[#333] text-neutral-400 hover:border-[#444] hover:text-neutral-200'
          }`}
        >
          <span className="text-[9px]">{isClipPlaying ? '■' : '▶'}</span>
          {isClipPlaying ? 'Stop' : 'Play'}
        </button>
      </div>

      {/* ---------- grid ---------- */}
      {isDrums ? (
        <DrumGrid clip={clip} playheadStep={playheadStep} />
      ) : (
        <MelodicGrid clip={clip} track={track} playheadStep={playheadStep} />
      )}
    </div>
  );
}
