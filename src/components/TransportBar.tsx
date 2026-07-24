/**
 * TransportBar — top bar of the DAW shell (owned by the foundation).
 * Play/stop, BPM, swing, metronome, undo/redo, project save/load/reset,
 * ASCII master wave, view tabs, app title.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, Play, RotateCcw, Square, Undo2, Redo2, Upload } from 'lucide-react';
import { engine } from '@/audio/engine';
import AsciiWave from '@/components/AsciiWave';
import { useProjectStore } from '@/store/projectStore';
import { redo, undo, useCanRedo, useCanUndo } from '@/store/history';
import { exportProjectFile, importProjectFile } from '@/store/persistence';
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

/** Small square icon button used for undo/redo + project actions. */
function BarButton({
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-7 items-center justify-center rounded-sm transition-colors ${
        disabled
          ? 'cursor-default bg-[#242424] text-neutral-700'
          : 'bg-[#2b2b2b] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
      }`}
    >
      {children}
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
  const resetToDemo = useProjectStore((s) => s.resetToDemo);

  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Draft only while editing — avoids setState-in-effect when store bpm changes.
  const [bpmDraft, setBpmDraft] = useState<string | null>(null);
  const bpmText = bpmDraft ?? String(bpm);

  // Project actions: hidden file input + two-click reset + transient status.
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const statusTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    },
    [],
  );

  const flash = (text: string, error = false) => {
    setStatus({ text, error });
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
  };

  const commitBpm = () => {
    const parsed = Number(bpmText);
    if (Number.isFinite(parsed)) setBpm(parsed);
    setBpmDraft(null);
  };

  const onPlayToggle = async () => {
    await engine.ensureStarted();
    togglePlay();
  };

  const onImportPicked = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importProjectFile(file);
      flash('Project loaded');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not load file', true);
    }
  };

  const onReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setResetArmed(false), 2500);
      return;
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    setResetArmed(false);
    resetToDemo();
    flash('Demo project restored');
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

      <div className="mx-2 h-5 w-px bg-neutral-800" />

      {/* undo / redo */}
      <div className="flex gap-1">
        <BarButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={13} />
        </BarButton>
        <BarButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
          <Redo2 size={13} />
        </BarButton>
      </div>

      {/* project: export / import / reset */}
      <div className="flex gap-1">
        <BarButton onClick={exportProjectFile} title="Save project file (.json)">
          <Download size={13} />
        </BarButton>
        <BarButton onClick={() => fileRef.current?.click()} title="Load project file (.json)">
          <Upload size={13} />
        </BarButton>
        <button
          type="button"
          onClick={onReset}
          title={resetArmed ? 'Click again to confirm' : 'Reset to the demo project'}
          className={`flex h-8 items-center justify-center gap-1 rounded-sm px-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
            resetArmed
              ? 'bg-[#e0483c] text-black'
              : 'bg-[#2b2b2b] text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300'
          }`}
        >
          <RotateCcw size={12} />
          {resetArmed ? 'Sure?' : null}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void onImportPicked(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {status && (
        <span
          className={`max-w-40 truncate text-[10px] ${
            status.error ? 'text-[#e0483c]' : 'text-[#5cb56a]'
          }`}
          title={status.text}
        >
          {status.text}
        </span>
      )}

      <div className="ml-auto hidden min-w-0 max-w-md flex-1 items-center justify-end pl-3 sm:flex">
        <AsciiWave compact className="w-full max-w-sm" />
      </div>
    </header>
  );
}
