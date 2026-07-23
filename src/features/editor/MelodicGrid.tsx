/**
 * Melodic mini piano-roll: a 2-octave window (24 semitones) over
 * `clip.lengthSteps` steps. A-minor scale rows are highlighted; octave
 * shift buttons move the window. Left-click toggles a note, shift-click /
 * right-click cycles velocity, drag paints. The velocity lane below edits
 * all notes at a step together.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Track } from '@/types/daw';
import { engine } from '@/audio/engine';
import StepCell from './StepCell';
import StepHeader from './StepHeader';
import VelocityLane from './VelocityLane';
import {
  A_MINOR_PCS,
  BLACK_KEY_PCS,
  hasClipNote,
  midiToNote,
  patchClipNotes,
} from './noteUtils';

const VELOCITY_CYCLE = [1, 0.75, 0.5, 0.3];
const ROWS = 24; // two octaves
const keyOf = (note: string, step: number) => `${note}|${step}`;

interface MelodicGridProps {
  clip: Clip;
  track: Track;
  playheadStep: number;
}

export default function MelodicGrid({ clip, track, playheadStep }: MelodicGridProps) {
  // Bass defaults to the A1 octave window, keys/lead to A3.
  const [baseMidi, setBaseMidi] = useState(() => (track.instrument === 'bass' ? 33 : 57));
  const paintRef = useRef<boolean | null>(null);

  useEffect(() => {
    const clear = () => {
      paintRef.current = null;
    };
    window.addEventListener('pointerup', clear);
    return () => window.removeEventListener('pointerup', clear);
  }, []);

  const noteMap = useMemo(() => {
    const m = new Map<string, { velocity: number }>();
    for (const n of clip.notes) m.set(keyOf(n.note, n.step), n);
    return m;
  }, [clip.notes]);

  const steps = clip.lengthSteps;

  // Rendered top-down: highest pitch first.
  const rows = useMemo(
    () => Array.from({ length: ROWS }, (_, i) => baseMidi + ROWS - 1 - i),
    [baseMidi],
  );

  const addNote = (note: string, step: number) =>
    patchClipNotes(clip.id, (notes) => {
      if (notes.some((n) => n.note === note && n.step === step)) return notes;
      return [...notes, { step, note, velocity: 0.85, duration: 1 }];
    });

  const removeNote = (note: string, step: number) =>
    patchClipNotes(clip.id, (notes) => notes.filter((n) => !(n.note === note && n.step === step)));

  const toggle = (note: string, step: number) => {
    const exists = hasClipNote(clip.id, note, step);
    paintRef.current = !exists;
    if (exists) {
      removeNote(note, step);
    } else {
      addNote(note, step);
      void engine.ensureStarted().then(() => engine.previewNote(track.id, note, 0.85));
    }
  };

  const paintEnter = (note: string, step: number) => {
    const mode = paintRef.current;
    if (mode === null) return;
    const exists = hasClipNote(clip.id, note, step);
    if (mode && !exists) addNote(note, step);
    else if (!mode && exists) removeNote(note, step);
  };

  const cycleVelocity = (note: string, step: number) => {
    patchClipNotes(clip.id, (notes) => {
      const existing = notes.find((n) => n.note === note && n.step === step);
      if (!existing) return notes;
      const idx = VELOCITY_CYCLE.findIndex((v) => Math.abs(v - existing.velocity) < 0.01);
      const next = VELOCITY_CYCLE[(idx + 1) % VELOCITY_CYCLE.length] ?? 1;
      return notes.map((n) => (n.note === note && n.step === step ? { ...n, velocity: next } : n));
    });
  };

  /** Lane value = loudest note at that step. Drag sets all notes at the step; bottom removes them. */
  const laneValueAt = (step: number): number | null => {
    let max: number | null = null;
    for (const n of clip.notes) {
      if (n.step === step) max = max === null ? n.velocity : Math.max(max, n.velocity);
    }
    return max;
  };

  const setLaneVelocity = (step: number, value: number | null) => {
    patchClipNotes(clip.id, (notes) => {
      if (value === null) return notes.filter((n) => n.step !== step);
      if (!notes.some((n) => n.step === step)) return notes;
      return notes.map((n) => (n.step === step ? { ...n, velocity: value } : n));
    });
  };

  const shiftOctave = (dir: number) =>
    setBaseMidi((b) => Math.min(96, Math.max(12, b + dir * 12)));

  return (
    <div className="flex-1 select-none overflow-auto p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="w-10 shrink-0" />
        <button
          type="button"
          onClick={() => shiftOctave(-1)}
          className="rounded border border-[#333] px-1.5 py-px text-[9px] uppercase tracking-wider text-neutral-500 hover:border-[#444] hover:text-neutral-200"
        >
          - oct
        </button>
        <button
          type="button"
          onClick={() => shiftOctave(1)}
          className="rounded border border-[#333] px-1.5 py-px text-[9px] uppercase tracking-wider text-neutral-500 hover:border-[#444] hover:text-neutral-200"
        >
          + oct
        </button>
        <span className="text-[9px] uppercase tracking-wider text-neutral-600">
          {midiToNote(baseMidi)} – {midiToNote(baseMidi + ROWS - 1)} · a minor highlighted
        </span>
      </div>
      <StepHeader steps={steps} labelWidthClass="w-10" />
      {rows.map((midi) => {
        const pc = ((midi % 12) + 12) % 12;
        const inScale = A_MINOR_PCS.has(pc);
        const black = BLACK_KEY_PCS.has(pc);
        const noteName = midiToNote(midi);
        const inactive = black
          ? 'bg-[#181818] hover:bg-[#2a2a2a]'
          : inScale
            ? 'bg-[#232323] hover:bg-[#2e2e2e]'
            : 'bg-[#1c1c1c] hover:bg-[#2a2a2a]';
        return (
          <div key={midi} className="mb-[2px] flex items-center">
            <div
              className={`w-10 shrink-0 pr-1.5 text-right text-[9px] tabular-nums ${
                inScale ? 'text-neutral-500' : 'text-neutral-700'
              } ${pc === 9 || pc === 0 ? 'font-semibold text-neutral-400' : ''}`}
            >
              {noteName}
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: steps }, (_, step) => {
                const ev = noteMap.get(keyOf(noteName, step));
                return (
                  <StepCell
                    key={step}
                    active={!!ev}
                    velocity={ev?.velocity ?? 0}
                    color={clip.color}
                    highlight={step === playheadStep}
                    beatStart={step % 4 === 0 && step > 0}
                    size="sm"
                    inactiveClassName={inactive}
                    onToggle={() => toggle(noteName, step)}
                    onCycleVelocity={() => cycleVelocity(noteName, step)}
                    onPaintEnter={() => paintEnter(noteName, step)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <VelocityLane
        steps={steps}
        color={clip.color}
        labelWidthClass="w-10"
        highlightStep={playheadStep}
        valueAt={laneValueAt}
        onSet={setLaneVelocity}
      />
    </div>
  );
}
