/**
 * Pitch helpers + fresh-state clip patch helpers.
 * The drum map here is a FIXED contract with the audio engine.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoContent, useProjectStore } from '@/store/projectStore';
import {
  DRUM_VOICES,
  hasClipNote,
  midiToNote,
  noteToMidi,
  patchClipNotes,
} from './noteUtils';

beforeEach(() => {
  useProjectStore.setState({
    ...createDemoContent(),
    isPlaying: false,
    playingClipByTrack: {},
  });
});

describe('noteToMidi / midiToNote', () => {
  it('maps reference pitches', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A1')).toBe(33);
    expect(noteToMidi('F#3')).toBe(54);
    expect(midiToNote(60)).toBe('C4');
    expect(midiToNote(33)).toBe('A1');
    expect(midiToNote(54)).toBe('F#3');
  });

  it('round-trips every midi note in the app range', () => {
    for (let m = 12; m <= 96; m++) {
      expect(noteToMidi(midiToNote(m))).toBe(m);
    }
  });

  it('falls back to C4 (60) on garbage input', () => {
    expect(noteToMidi('')).toBe(60);
    expect(noteToMidi('H9')).toBe(60);
    expect(noteToMidi('c4')).toBe(60);
  });
});

describe('drum voice map', () => {
  it('matches the engine contract order (C1..B1)', () => {
    expect(DRUM_VOICES.map((v) => v.note)).toEqual([
      'C1',
      'D1',
      'E1',
      'F#1',
      'G1',
      'A1',
      'B1',
    ]);
  });
});

describe('patchClipNotes / hasClipNote', () => {
  it('reads fresh state — rapid sequential patches never drop notes', () => {
    const clipId = useProjectStore.getState().createClip('track-drums', 4);
    // Simulate a drag-paint burst: many patches inside one event turn.
    for (let step = 0; step < 8; step++) {
      patchClipNotes(clipId, (notes) => [
        ...notes,
        { step, note: 'C1', velocity: 0.9, duration: 1 },
      ]);
    }
    expect(useProjectStore.getState().clips[clipId]?.notes).toHaveLength(8);
    expect(hasClipNote(clipId, 'C1', 5)).toBe(true);
    expect(hasClipNote(clipId, 'D1', 5)).toBe(false);
  });

  it('is a no-op for unknown clip ids', () => {
    const before = useProjectStore.getState().clips;
    patchClipNotes('ghost', (notes) => [...notes, { step: 0, note: 'C1', velocity: 1 }]);
    expect(useProjectStore.getState().clips).toBe(before);
  });
});
