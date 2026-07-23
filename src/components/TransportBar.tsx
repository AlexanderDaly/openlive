/**
 * TransportBar — top bar of the DAW shell (owned by the foundation).
 * Play/stop, BPM, swing, metronome, ASCII master wave, view tabs, app title.
 */
import { useState } from 'react';
import { Play, Square } from 'lucide-react';
import { engine } from '@/audio/engine';
import AsciiWave from '@/components/AsciiWave';
import { useProjectStore } from '@/store/projectStore';
import type { ViewMode } from '@/types/daw';

function ViewTab({ mode, label }: { mode: ViewMode; label: string }) {
  const view = useProjectStore((s) => s.view);
  const setView = useProjectStore((s) => s.setView);
  const active = view === mode;
  return (
    <button
      onClick={() => setView(mode)}
      className={`px-3 py-1 text-xs font-medium tracking-wide transition-colors ${
        active
          ? 'bg-[#ff8c2e] text-black'
          : 'bg-[#2b2b2b] text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {label}
    </button>
  );
}

export default function TransportBar() {
  const bpm = useProjectStore((s) => s.bpm);
  const swing = useProjectStore((s) => s.swing);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const metronome = useProjectStore((s) => s.metronome);
  const setBpm = useProjectStore((s) => s.setBpm);
  const setSwing = useProjectStore((s) => s.setSwing);
  const togglePlay = useProjectStore((s) => s.togglePlay);
  const toggleMetronome = useProjectStore((s) => s.toggleMetronome);

  // Draft only while editing — avoids setState-in-effect when store bpm changes.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  const bpmText = bpmDraft ?? String(bpm);

  const commitBpm = () => {
    const parsed = Number(bpmText);
    if (Number.isFinite(parsed)) setBpm(parsed);
    setBpmDraft(null);
  };

  const onPlayToggle = async () => {
    await engine.ensureStarted();
    togglePlay();
  };

  return (
    <header className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-[#242424] px-3">
      <span className="mr-2 whitespace-nowrap text-sm font-semibold tracking-wide text-neutral-200">
        Open<span className="text-[#ff8c2e]">Live</span>
        <span className="ml-2 hidden text-[10px] font-normal text-neutral-500 sm:inline">
          open source
        </span>
      </span>

      <button
        onClick={onPlayToggle}
        aria-label={isPlaying ? 'Stop' : 'Play'}
        className={`flex h-8 w-8 items-center justify-center rounded-sm transition-colors ${
          isPlaying
            ? 'bg-[#ff8c2e] text-black hover:bg-[#ff9d4d]'
            : 'bg-[#2b2b2b] text-[#ff8c2e] hover:bg-neutral-700'
        }`}
      >
        {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>

      <button
        onClick={toggleMetronome}
        title="Metronome"
        className={`h-8 rounded-sm px-2 text-[10px] font-bold tracking-widest transition-colors ${
          metronome
            ? 'bg-[#ff8c2e] text-black'
            : 'bg-[#2b2b2b] text-neutral-500 hover:text-neutral-300'
        }`}
      >
        MET
      </button>

      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
        BPM
        <input
          type="number"
          min={40}
          max={240}
          value={bpmText}
          onChange={(e) => setBpmDraft(e.target.value)}
          onFocus={() => setBpmDraft(String(bpm))}
          onBlur={commitBpm}
          onKeyDown={(e) => e.key === 'Enter' && commitBpm()}
          className="h-7 w-14 rounded-sm border border-neutral-700 bg-[#1a1a1a] px-1.5 text-center text-xs text-neutral-200 outline-none focus:border-[#ff8c2e]"
        />
      </label>

      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
        Swing
        <input
          type="range"
          min={0}
          max={0.6}
          step={0.01}
          value={swing}
          onChange={(e) => setSwing(Number(e.target.value))}
          className="h-1 w-20 accent-[#ff8c2e]"
        />
        <span className="w-8 text-right text-neutral-400">{Math.round(swing * 100)}%</span>
      </label>

      <div className="mx-2 h-5 w-px bg-neutral-800" />

      <div className="flex overflow-hidden rounded-sm">
        <ViewTab mode="session" label="Session" />
        <ViewTab mode="arrangement" label="Arrangement" />
      </div>

      <div className="ml-auto hidden min-w-0 max-w-md flex-1 items-center justify-end pl-3 sm:flex">
        <AsciiWave compact className="w-full max-w-sm" />
      </div>
    </header>
  );
}
