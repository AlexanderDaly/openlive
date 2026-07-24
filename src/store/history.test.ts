/**
 * Undo/redo semantics: snapshot on content change, burst coalescing,
 * future-stack invalidation, and UI-state isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoContent, useProjectStore } from '@/store/projectStore';
import {
  COALESCE_MS,
  canRedo,
  canUndo,
  historyDepth,
  redo,
  startHistory,
  undo,
} from './history';

let stopHistory: (() => void) | null = null;
let clock = 0;

const tick = (ms: number) => {
  clock += ms;
};

beforeEach(() => {
  useProjectStore.setState({
    ...createDemoContent(),
    isPlaying: false,
    playingClipByTrack: {},
  });
  clock = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  stopHistory = startHistory();
});

afterEach(() => {
  stopHistory?.();
  stopHistory = null;
  vi.restoreAllMocks();
});

const S = () => useProjectStore.getState();

describe('basic undo/redo', () => {
  it('undoes and redoes a bpm change', () => {
    expect(canUndo()).toBe(false);
    S().setBpm(140);
    expect(canUndo()).toBe(true);

    undo();
    expect(S().bpm).toBe(124);
    expect(canRedo()).toBe(true);

    redo();
    expect(S().bpm).toBe(140);
    expect(canRedo()).toBe(false);
  });

  it('undoes structural edits (deleteClip) in one step', () => {
    S().deleteClip('clip-beat-a');
    expect(S().clips['clip-beat-a']).toBeUndefined();
    undo();
    expect(S().clips['clip-beat-a']).toBeDefined();
    expect(S().sessionMatrix['track-drums']?.[0]).toBe('clip-beat-a');
    expect(S().arrangementClips.some((a) => a.clipId === 'clip-beat-a')).toBe(true);
  });

  it('undo/redo with empty stacks is a no-op', () => {
    expect(() => undo()).not.toThrow();
    expect(() => redo()).not.toThrow();
    expect(S().bpm).toBe(124);
  });
});

describe('coalescing', () => {
  it('merges rapid changes into one undo step', () => {
    S().setBpm(130);
    tick(COALESCE_MS - 50);
    S().setBpm(140);
    tick(COALESCE_MS - 50);
    S().setBpm(150);
    expect(historyDepth().past).toBe(1);

    undo();
    expect(S().bpm).toBe(124); // the whole burst reverted at once
  });

  it('separates changes spaced beyond the window', () => {
    S().setBpm(130);
    tick(COALESCE_MS + 10);
    S().setBpm(140);
    expect(historyDepth().past).toBe(2);

    undo();
    expect(S().bpm).toBe(130);
    undo();
    expect(S().bpm).toBe(124);
  });

  it('an edit right after undo starts a fresh step (never coalesces into the restore)', () => {
    S().setBpm(130);
    undo();
    S().setBpm(150); // same instant as the undo
    expect(canUndo()).toBe(true);
    undo();
    expect(S().bpm).toBe(124);
  });
});

describe('stack rules', () => {
  it('a new edit clears the redo stack', () => {
    S().setBpm(130);
    undo();
    expect(canRedo()).toBe(true);
    tick(COALESCE_MS + 10);
    S().setBpm(90);
    expect(canRedo()).toBe(false);
  });

  it('runtime and UI-only changes are not recorded', () => {
    useProjectStore.setState({ isPlaying: true });
    S().launchClip('track-drums', 'clip-beat-a');
    S().setView('arrangement');
    S().toggleMetronome();
    S().selectClip('clip-beat-a');
    expect(canUndo()).toBe(false);
  });

  it('undo restores content but leaves the current view alone', () => {
    S().setBpm(130);
    tick(COALESCE_MS + 10);
    S().setView('arrangement');
    undo();
    expect(S().bpm).toBe(124);
    expect(S().view).toBe('arrangement');
  });
});
