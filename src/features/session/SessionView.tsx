/**
 * SessionView — OpenLive Session View (clip-launching grid).
 *
 * Owned by the Session feature agent. Everything lives inside
 * `src/features/session/`; the store/engine contract is read-only here
 * (store actions are called, the engine is only used for meters and
 * `ensureStarted()` from user gestures). See `src/features/CONTRACT.md`.
 *
 * Store reads : tracks, clips, sessionMatrix, scenes, playingClipByTrack,
 *               selectedClipId.
 * Store writes: createClip, deleteClip, renameClip, selectClip, setSlot,
 *               launchClip, stopTrackClip, addScene, renameScene, launchScene,
 *               stopAllClips.
 */
import { useEffect, useRef, useState } from 'react';
import { Drum, Music, Piano, Play, Plus, Square, Waves, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';
import type { Clip, InstrumentKind, Track } from '@/types/daw';

/** Minimum visible scene rows (Ableton-style empty rows below content). */
const MIN_ROWS = 8;

/** Append a hex alpha to a #rrggbb color; graceful fallback otherwise. */
const tint = (color: string, alpha: string): string =>
  /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alpha}` : 'rgba(255,140,46,0.12)';

/* ------------------------------------------------------------------ */
/* Instrument icon                                                     */
/* ------------------------------------------------------------------ */

function InstrumentIcon({ kind, className }: { kind: InstrumentKind; className?: string }) {
  switch (kind) {
    case 'drumkit':
      return <Drum className={className} />;
    case 'bass':
      return <Waves className={className} />;
    case 'keys':
      return <Piano className={className} />;
    default:
      return <Music className={className} />;
  }
}

/* ------------------------------------------------------------------ */
/* Track meter — reads engine.getTrackMeter(trackId) every animation   */
/* frame; renders silently as zero until the engine is started.        */
/* ------------------------------------------------------------------ */

function TrackMeter({ trackId }: { trackId: string }) {
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      let level = 0;
      const meter = engine.getTrackMeter(trackId);
      if (meter) {
        const v = meter.getValue();
        const n = typeof v === 'number' ? v : Array.isArray(v) ? (v[0] ?? 0) : 0;
        level = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${level})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trackId]);

  return (
    <div className="h-1 w-full overflow-hidden rounded-[2px] bg-[#101010]">
      <div
        ref={fillRef}
        className="h-full w-full origin-left bg-[#ff8c2e]"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clip slot cell                                                      */
/* ------------------------------------------------------------------ */

interface ClipCellProps {
  track: Track;
  clip: Clip;
  isPlaying: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  renameValue: string;
  onLaunch: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onRenameChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}

function ClipCell({
  track,
  clip,
  isPlaying,
  isSelected,
  isRenaming,
  renameValue,
  onLaunch,
  onSelect,
  onDelete,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onCancelRename,
}: ClipCellProps) {
  const bars = clip.lengthSteps / 16;
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative flex h-14 cursor-pointer select-none items-center gap-1 border-b border-[#262626] px-1',
        isPlaying
          ? 'ring-1 ring-inset ring-green-500'
          : isSelected
            ? 'ring-1 ring-inset ring-[#ff8c2e]'
            : 'hover:ring-1 hover:ring-inset hover:ring-[#3a3a3a]',
      )}
      style={{ backgroundColor: tint(clip.color, isPlaying ? '2e' : '1f') }}
      title={`${track.name} — ${clip.name}`}
    >
      {/* clip color spine */}
      <span
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ backgroundColor: clip.color }}
      />

      {/* play / stop affordance */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onLaunch();
        }}
        title={isPlaying ? 'Stop clip' : 'Launch clip (bar-quantized)'}
        className={cn(
          'ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-black/40',
          isPlaying
            ? 'bg-green-600 text-white hover:bg-green-500'
            : 'bg-black/30 text-neutral-300 hover:bg-black/60 hover:text-white',
        )}
      >
        {isPlaying ? (
          <Square className="h-2.5 w-2.5 fill-current" />
        ) : (
          <Play className="h-3 w-3 fill-current" />
        )}
      </button>

      {/* name / inline rename */}
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-full min-w-0 rounded-[3px] border border-[#ff8c2e] bg-[#111] px-1 text-[11px] text-neutral-100 outline-none"
        />
      ) : (
        <div
          className="min-w-0 flex-1"
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          title="Double-click to rename"
        >
          <p className="truncate text-[11px] font-medium leading-tight text-neutral-100">
            {clip.name}
          </p>
          <p className="text-[9px] uppercase tracking-wider text-neutral-400">
            {bars} {bars === 1 ? 'bar' : 'bars'}
          </p>
        </div>
      )}

      {/* hover delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete clip"
        className="absolute right-0.5 top-0.5 hidden rounded-[3px] bg-black/40 p-0.5 text-neutral-400 hover:bg-black/70 hover:text-white group-hover:block"
      >
        <X className="h-3 w-3" />
      </button>

      {/* playing pulse indicator */}
      {isPlaying && (
        <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SessionView                                                         */
/* ------------------------------------------------------------------ */

export default function SessionView() {
  // ---- store subscriptions ----
  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const sessionMatrix = useProjectStore((s) => s.sessionMatrix);
  const scenes = useProjectStore((s) => s.scenes);
  const playingClipByTrack = useProjectStore((s) => s.playingClipByTrack);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);

  const createClip = useProjectStore((s) => s.createClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const renameClip = useProjectStore((s) => s.renameClip);
  const selectClip = useProjectStore((s) => s.selectClip);
  const launchClip = useProjectStore((s) => s.launchClip);
  const stopTrackClip = useProjectStore((s) => s.stopTrackClip);
  const launchScene = useProjectStore((s) => s.launchScene);
  const stopAllClips = useProjectStore((s) => s.stopAllClips);
  const addScene = useProjectStore((s) => s.addScene);
  const renameScene = useProjectStore((s) => s.renameScene);
  const isTransportPlaying = useProjectStore((s) => s.isPlaying);
  const togglePlay = useProjectStore((s) => s.togglePlay);

  // ---- local UI state ----
  const [clipRename, setClipRename] = useState<{ id: string; value: string } | null>(null);
  const [sceneRename, setSceneRename] = useState<{ index: number; value: string } | null>(null);

  const rowCount = Math.max(
    MIN_ROWS,
    scenes.length,
    ...tracks.map((t) => sessionMatrix[t.id]?.length ?? 0),
  );
  const rowIndices = Array.from({ length: rowCount }, (_, i) => i);

  /** Unlock the audio context from a user gesture (safe to repeat). */
  const unlock = () => {
    void engine.ensureStarted().catch(() => {});
  };

  /**
   * Ableton behavior: launching a clip/scene IS a play command. Unlock
   * audio from this gesture, run the launch, then make sure the transport
   * is rolling (launches stay bar-quantized inside the engine).
   */
  const launchAndRoll = (launch: () => void) => {
    void engine
      .ensureStarted()
      .then(() => {
        launch();
        if (!useProjectStore.getState().isPlaying) togglePlay();
      })
      .catch(() => {});
  };

  const commitClipRename = () => {
    if (!clipRename) return;
    const name = clipRename.value.trim();
    if (name) renameClip(clipRename.id, name);
    setClipRename(null);
  };

  const commitSceneRename = () => {
    if (!sceneRename) return;
    const name = sceneRename.value.trim();
    if (name) renameScene(sceneRename.index, name);
    setSceneRename(null);
  };

  const anyPlaying = Object.values(playingClipByTrack).some(Boolean);

  return (
    <div className="h-full w-full overflow-auto bg-[#141414]">
      <div className="flex min-w-max items-start">
        {/* ---------------- track columns ---------------- */}
        {tracks.map((track) => {
          const playingId = playingClipByTrack[track.id] ?? null;
          return (
            <div
              key={track.id}
              className="flex w-36 shrink-0 flex-col border-r border-[#2b2b2b] bg-[#181818]"
            >
              {/* header: name + color chip + instrument icon + meter */}
              <div className="sticky top-0 z-10 flex h-16 flex-col justify-between border-b border-[#333] bg-[#1e1e1e] px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: track.color }}
                  />
                  <InstrumentIcon
                    kind={track.instrument}
                    className="h-3.5 w-3.5 shrink-0 text-neutral-400"
                  />
                  <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-neutral-200">
                    {track.name}
                  </span>
                </div>
                <TrackMeter trackId={track.id} />
              </div>

              {/* clip slots */}
              {rowIndices.map((rowIndex) => {
                const clipId = sessionMatrix[track.id]?.[rowIndex] ?? null;
                const clip = clipId ? clips[clipId] : undefined;
                if (!clip) {
                  return (
                    <button
                      key={rowIndex}
                      onClick={() => createClip(track.id, rowIndex)}
                      title="Create empty clip"
                      className="group flex h-14 w-full items-center justify-center border-b border-[#262626] text-neutral-600 hover:bg-[#1f1f1f]"
                    >
                      <Plus className="h-3.5 w-3.5 opacity-30 transition-opacity group-hover:text-[#ff8c2e] group-hover:opacity-100" />
                    </button>
                  );
                }
                // Only show active playing ring while transport is running.
                // Launched clips stay in playingClipByTrack so Play can resume them.
                const isPlaying = isTransportPlaying && playingId === clip.id;
                return (
                  <ClipCell
                    key={rowIndex}
                    track={track}
                    clip={clip}
                    isPlaying={isPlaying}
                    isSelected={selectedClipId === clip.id}
                    isRenaming={clipRename?.id === clip.id}
                    renameValue={clipRename?.id === clip.id ? clipRename.value : clip.name}
                    onLaunch={() => {
                      if (isPlaying) {
                        unlock();
                        stopTrackClip(track.id);
                      } else {
                        launchAndRoll(() => launchClip(track.id, clip.id));
                      }
                    }}
                    onSelect={() => selectClip(clip.id)}
                    onDelete={() => deleteClip(clip.id)}
                    onStartRename={() => setClipRename({ id: clip.id, value: clip.name })}
                    onRenameChange={(value) => setClipRename({ id: clip.id, value })}
                    onCommitRename={commitClipRename}
                    onCancelRename={() => setClipRename(null)}
                  />
                );
              })}

              {/* footer: per-track stop */}
              <div className="sticky bottom-0 z-10 flex h-10 items-center justify-center border-t border-[#333] bg-[#1c1c1c]">
                <button
                  onClick={() => {
                    unlock();
                    stopTrackClip(track.id);
                  }}
                  disabled={!playingId}
                  title="Stop track clip"
                  className={cn(
                    'flex h-6 w-10 items-center justify-center rounded-[3px] border',
                    playingId
                      ? 'border-[#444] bg-[#2a2a2a] text-neutral-200 hover:bg-[#333] hover:text-white'
                      : 'cursor-default border-[#2b2b2b] bg-[#1a1a1a] text-neutral-700',
                  )}
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                </button>
              </div>
            </div>
          );
        })}

        {/* ---------------- scene column (far right) ---------------- */}
        <div className="sticky right-0 z-20 flex w-32 shrink-0 flex-col border-l border-[#333] bg-[#1a1a1a] shadow-[-4px_0_8px_rgba(0,0,0,0.35)]">
          <div className="sticky top-0 flex h-16 items-center justify-center border-b border-[#333] bg-[#1e1e1e]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Scenes
            </span>
          </div>

          {rowIndices.map((rowIndex) => {
            const sceneName = scenes[rowIndex]?.name ?? `Scene ${rowIndex + 1}`;
            const isRenaming = sceneRename?.index === rowIndex;
            return (
              <div
                key={rowIndex}
                className="flex h-14 items-center gap-1.5 border-b border-[#262626] px-2"
              >
                <button
                  onClick={() => launchAndRoll(() => launchScene(rowIndex))}
                  title={`Launch scene "${sceneName}"`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-[#3a3a3a] bg-[#242424] text-[#ff8c2e] hover:border-[#ff8c2e] hover:bg-[#2b2b2b]"
                >
                  <Play className="h-3 w-3 fill-current" />
                </button>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={sceneRename.value}
                    onChange={(e) => setSceneRename({ index: rowIndex, value: e.target.value })}
                    onBlur={commitSceneRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitSceneRename();
                      if (e.key === 'Escape') setSceneRename(null);
                    }}
                    className="h-5 w-full min-w-0 rounded-[3px] border border-[#ff8c2e] bg-[#111] px-1 text-[11px] text-neutral-100 outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={() => setSceneRename({ index: rowIndex, value: sceneName })}
                    title="Double-click to rename scene"
                    className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-300"
                  >
                    {sceneName}
                  </span>
                )}
              </div>
            );
          })}

          {/* add scene row affordance */}
          <button
            onClick={() => addScene()}
            disabled={tracks.length === 0}
            title="Add scene row"
            className="flex h-9 shrink-0 items-center justify-center gap-1 border-b border-[#262626] text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500 hover:bg-[#1f1f1f] hover:text-[#ff8c2e] disabled:cursor-default disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add Scene
          </button>

          {/* footer: global stop */}
          <div className="sticky bottom-0 flex h-10 items-center justify-center border-t border-[#333] bg-[#1c1c1c] px-2">
            <button
              onClick={() => {
                unlock();
                stopAllClips();
              }}
              disabled={!anyPlaying}
              title="Stop all clips"
              className={cn(
                'flex h-6 w-full items-center justify-center gap-1.5 rounded-[3px] border text-[9px] font-bold uppercase tracking-[0.15em]',
                anyPlaying
                  ? 'border-[#444] bg-[#2a2a2a] text-neutral-200 hover:bg-[#333] hover:text-white'
                  : 'cursor-default border-[#2b2b2b] bg-[#1a1a1a] text-neutral-700',
              )}
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
