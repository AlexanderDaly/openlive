/**
 * DrumRack — 4×4 pad grid for drumkit tracks.
 * 7 active pads mapped to the engine's drum voices (C1..B1); the rest are
 * disabled-styled placeholders, Ableton Drum Rack style.
 *
 * - Pads flash when the currently playing clip triggers that voice
 *   (rAF-polled transport step vs. the playing clip's notes).
 * - Clicking a pad flashes it, auditions the voice one-shot via
 *   `engine.previewNote` (after `ensureStarted()` unlocks audio), and
 *   record-toggles that note into the selected clip at the current
 *   transport step (store → engine sync is automatic).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';
import type { Clip, Track } from '@/types/daw';
import { STEPS_PER_BAR } from '@/types/daw';
import { useTransportStep } from './useTransportStep';

interface DrumVoice {
  note: string;
  label: string;
}

/** Engine drum map: C1 kick, D1 snare, E1 clap, F#1 closed hat, G1 low tom, A1 open hat, B1 high tom. */
const VOICES: DrumVoice[] = [
  { note: 'C1', label: 'KICK' },
  { note: 'D1', label: 'SNARE' },
  { note: 'E1', label: 'CLAP' },
  { note: 'F#1', label: 'CHAT' },
  { note: 'G1', label: 'LTOM' },
  { note: 'A1', label: 'OHAT' },
  { note: 'B1', label: 'HTOM' },
];

/** 4×4 layout (top row first). Main voices on row 3, toms/open hat on the bottom row. */
const CELLS: (DrumVoice | null)[] = [
  null, null, null, null,
  null, null, null, null,
  VOICES[0] ?? null, VOICES[1] ?? null, VOICES[2] ?? null, VOICES[3] ?? null,
  VOICES[4] ?? null, VOICES[5] ?? null, VOICES[6] ?? null, null,
];

interface DrumRackProps {
  track: Track;
  clip: Clip | undefined;
}

export default function DrumRack({ track, clip }: DrumRackProps) {
  const view = useProjectStore((s) => s.view);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const playingClipId = useProjectStore((s) => s.playingClipByTrack[track.id] ?? null);
  const playingClip = useProjectStore((s) =>
    playingClipId ? s.clips[playingClipId] : undefined,
  );
  const arrangementClips = useProjectStore((s) => s.arrangementClips);
  const clips = useProjectStore((s) => s.clips);
  const updateClipNotes = useProjectStore((s) => s.updateClipNotes);

  const step = useTransportStep();

  // Voices triggered at the current transport step (session + arrangement).
  const sounding = useMemo(() => {
    if (!isPlaying) return new Set<string>();
    const active = new Set<string>();
    const collect = (c: Clip | undefined, stepInClip: number) => {
      if (!c) return;
      for (const n of c.notes) {
        if (n.step === stepInClip) active.add(n.note);
      }
    };
    if (view === 'session') {
      collect(playingClip, step % (playingClip?.lengthSteps ?? STEPS_PER_BAR));
    } else {
      const bar = Math.floor(step / STEPS_PER_BAR);
      for (const a of arrangementClips) {
        if (a.trackId !== track.id) continue;
        if (bar < a.startBar || bar >= a.startBar + a.lengthBars) continue;
        const c = clips[a.clipId];
        if (!c) continue;
        collect(c, (step - a.startBar * STEPS_PER_BAR) % c.lengthSteps);
      }
    }
    return active;
  }, [isPlaying, view, playingClip, arrangementClips, clips, step, track.id]);

  // Notes present anywhere in the selected clip → marker dot on the pad.
  const inClip = useMemo(() => {
    const set = new Set<string>();
    if (clip && clip.trackId === track.id) {
      for (const n of clip.notes) set.add(n.note);
    }
    return set;
  }, [clip, track.id]);

  // Click flash (short-lived, independent of playback flash).
  const [hitNote, setHitNote] = useState<string | null>(null);
  const hitTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hitTimer.current !== null) window.clearTimeout(hitTimer.current);
    },
    [],
  );

  const onPadClick = (voice: DrumVoice) => {
    // Unlock audio from this user gesture, then audition the pad one-shot
    // through the track's chain (safe no-op if the engine is not started).
    void engine.ensureStarted().then(() => engine.previewNote(track.id, voice.note));

    setHitNote(voice.note);
    if (hitTimer.current !== null) window.clearTimeout(hitTimer.current);
    hitTimer.current = window.setTimeout(() => setHitNote(null), 140);

    // Record-toggle the note into the selected clip at the current step.
    if (clip && clip.trackId === track.id) {
      const stepInClip = step % clip.lengthSteps;
      const exists = clip.notes.some((n) => n.step === stepInClip && n.note === voice.note);
      const notes = exists
        ? clip.notes.filter((n) => !(n.step === stepInClip && n.note === voice.note))
        : [...clip.notes, { step: stepInClip, note: voice.note, velocity: 0.9, duration: 1 }];
      updateClipNotes(clip.id, notes);
    }
  };

  return (
    <div className="border-b border-neutral-800 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-widest text-neutral-400 uppercase">
          Drum Rack
        </span>
        <span className="text-[8px] tracking-wider text-neutral-600 uppercase">
          {clip && clip.trackId === track.id ? 'click = toggle note @ step' : 'select a clip to record'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {CELLS.map((voice, i) => {
          if (!voice) {
            return (
              <div
                key={`pad-empty-${i}`}
                className="flex h-12 items-center justify-center rounded-sm border border-[#2a2a2a] bg-[#151515]"
              >
                <span className="h-1 w-1 rounded-full bg-[#262626]" />
              </div>
            );
          }
          const flashing = sounding.has(voice.note) || hitNote === voice.note;
          return (
            <button
              key={voice.note}
              type="button"
              onClick={() => onPadClick(voice)}
              className={`relative flex h-12 flex-col items-center justify-center rounded-sm border transition-colors duration-75 ${
                flashing
                  ? 'border-[#ff8c2e] bg-[#ff8c2e] text-black'
                  : 'border-[#333] bg-[#242424] text-neutral-300 hover:border-[#4a4a4a] hover:bg-[#2c2c2c]'
              }`}
              title={`${voice.label} (${voice.note})`}
            >
              <span
                className={`text-[9px] font-bold tracking-widest ${
                  flashing ? 'text-black' : 'text-neutral-300'
                }`}
              >
                {voice.label}
              </span>
              <span className={`text-[8px] ${flashing ? 'text-black/70' : 'text-neutral-600'}`}>
                {voice.note}
              </span>
              {inClip.has(voice.note) && (
                <span
                  className={`absolute top-1 right-1 h-1 w-1 rounded-full ${
                    flashing ? 'bg-black' : 'bg-[#ff8c2e]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
