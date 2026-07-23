/**
 * Drum step sequencer: one row per drum voice (kick/snare/clap/hats/toms),
 * `clip.lengthSteps` columns (16 = one bar). Left-click toggles a step,
 * shift-click / right-click cycles velocity, drag paints. Clicking a row
 * label selects the voice shown in the velocity lane below.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip } from '@/types/daw';
import { engine } from '@/audio/engine';
import StepCell from './StepCell';
import StepHeader from './StepHeader';
import VelocityLane from './VelocityLane';
import { DRUM_VOICES, hasClipNote, patchClipNotes } from './noteUtils';

const VELOCITY_CYCLE = [1, 0.75, 0.5, 0.3];
const keyOf = (note: string, step: number) => `${note}|${step}`;

interface DrumGridProps {
  clip: Clip;
  playheadStep: number;
}

export default function DrumGrid({ clip, playheadStep }: DrumGridProps) {
  const [activeRow, setActiveRow] = useState<string>(DRUM_VOICES[0].note);
  /** null = not painting, true = painting notes ON, false = painting OFF. */
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

  const addNote = (note: string, step: number, velocity = 0.9) =>
    patchClipNotes(clip.id, (notes) => {
      if (notes.some((n) => n.note === note && n.step === step)) return notes;
      return [...notes, { step, note, velocity, duration: 1 }];
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
      void engine.ensureStarted().then(() => engine.previewNote(clip.trackId, note));
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

  const setLaneVelocity = (step: number, value: number | null) => {
    if (value === null) {
      removeNote(activeRow, step);
      return;
    }
    patchClipNotes(clip.id, (notes) => {
      const existing = notes.find((n) => n.note === activeRow && n.step === step);
      if (existing) {
        return notes.map((n) =>
          n.note === activeRow && n.step === step ? { ...n, velocity: value } : n,
        );
      }
      return [...notes, { step, note: activeRow, velocity: value, duration: 1 }];
    });
  };

  return (
    <div className="flex-1 select-none overflow-auto p-2">
      <StepHeader steps={steps} labelWidthClass="w-16" />
      {DRUM_VOICES.map((voice) => (
        <div key={voice.note} className="mb-[3px] flex items-center">
          <button
            type="button"
            onClick={() => {
              setActiveRow(voice.note);
              void engine.ensureStarted().then(() => engine.previewNote(clip.trackId, voice.note));
            }}
            className={`w-16 shrink-0 pr-2 text-left text-[9px] uppercase tracking-wider transition-colors ${
              activeRow === voice.note ? 'text-[#ff8c2e]' : 'text-neutral-500 hover:text-neutral-300'
            }`}
            title={`${voice.label} (${voice.note}) — click to edit velocity`}
          >
            {voice.label}
          </button>
          <div className="flex gap-[3px]">
            {Array.from({ length: steps }, (_, step) => {
              const ev = noteMap.get(keyOf(voice.note, step));
              return (
                <StepCell
                  key={step}
                  active={!!ev}
                  velocity={ev?.velocity ?? 0}
                  color={clip.color}
                  highlight={step === playheadStep}
                  beatStart={step % 4 === 0 && step > 0}
                  size="md"
                  inactiveClassName="bg-[#242424] hover:bg-[#303030]"
                  onToggle={() => toggle(voice.note, step)}
                  onCycleVelocity={() => cycleVelocity(voice.note, step)}
                  onPaintEnter={() => paintEnter(voice.note, step)}
                />
              );
            })}
          </div>
        </div>
      ))}
      <VelocityLane
        steps={steps}
        color={clip.color}
        labelWidthClass="w-16"
        highlightStep={playheadStep}
        valueAt={(step) => noteMap.get(keyOf(activeRow, step))?.velocity ?? null}
        onSet={setLaneVelocity}
      />
    </div>
  );
}
