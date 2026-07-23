/**
 * Shared note/pitch helpers for the clip editor.
 * Drum voice map matches the fixed engine contract:
 * C1 kick, D1 snare, E1 clap, F#1 closed hat, G1 low tom, A1 open hat, B1 high tom.
 */
import type { NoteEvent } from '@/types/daw';
import { useProjectStore } from '@/store/projectStore';

export const DRUM_VOICES = [
  { note: 'C1', label: 'KICK' },
  { note: 'D1', label: 'SNARE' },
  { note: 'E1', label: 'CLAP' },
  { note: 'F#1', label: 'CL HAT' },
  { note: 'G1', label: 'LOW TOM' },
  { note: 'A1', label: 'OP HAT' },
  { note: 'B1', label: 'HI TOM' },
] as const;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NOTE_BASE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** 'A1' -> 33, 'C4' -> 60, 'F#3' -> 54. Falls back to 60 (C4) on garbage input. */
export function noteToMidi(note: string): number {
  const m = /^([A-G])(#?)(-?\d+)$/.exec(note);
  if (!m) return 60;
  const base = NOTE_BASE[m[1] ?? 'C'] ?? 0;
  const sharp = m[2] === '#' ? 1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + base + sharp;
}

/** 33 -> 'A1', 60 -> 'C4'. */
export function midiToNote(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc] ?? 'C'}${octave}`;
}

/** Pitch classes of the A natural minor scale. */
export const A_MINOR_PCS: ReadonlySet<number> = new Set([9, 11, 0, 2, 4, 5, 7]);

/** Pitch classes that are "black keys". */
export const BLACK_KEY_PCS: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

/**
 * Apply a pure transform to a clip's notes using fresh store state.
 * Avoids stale-closure bugs when drag-painting multiple cells in one gesture.
 */
export function patchClipNotes(
  clipId: string,
  mutate: (notes: NoteEvent[]) => NoteEvent[],
): void {
  const state = useProjectStore.getState();
  const clip = state.clips[clipId];
  if (!clip) return;
  state.updateClipNotes(clipId, mutate(clip.notes));
}

/** True if the clip currently has a note at (note, step) — reads live store. */
export function hasClipNote(clipId: string, note: string, step: number): boolean {
  const clip = useProjectStore.getState().clips[clipId];
  return !!clip?.notes.some((n) => n.note === note && n.step === step);
}
