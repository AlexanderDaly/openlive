/**
 * OpenLive — undo/redo history (part of the foundation).
 *
 * Records immutable snapshots of the MUSICAL content slice of the store:
 * tracks, clips, session matrix, scenes, arrangement, bpm, swing, loop,
 * master volume. UI-ish state (view, metronome, selection) and runtime
 * playback state are deliberately NOT part of history — undo should never
 * flip your view or stop your transport.
 *
 * Mechanics:
 * - `startHistory()` subscribes to the store. On the first content change
 *   of a burst it pushes the PREVIOUS snapshot onto the undo stack; rapid
 *   follow-up changes (< COALESCE_MS apart, e.g. drag-painting steps or
 *   riding a fader) coalesce into that same undo step.
 * - `undo()` / `redo()` swap snapshots through `setState` with a guard so
 *   the restore itself is not recorded. The audio engine follows the store
 *   subscription as usual, so undoing pattern edits is audible immediately.
 */
import { useSyncExternalStore } from 'react';
import { useProjectStore } from '@/store/projectStore';
import type { ProjectState } from '@/types/daw';

/** Fields captured per undo step. */
export interface HistorySnapshot {
  bpm: number;
  swing: number;
  loop: ProjectState['loop'];
  masterVolume: number;
  tracks: ProjectState['tracks'];
  clips: ProjectState['clips'];
  sessionMatrix: ProjectState['sessionMatrix'];
  scenes: ProjectState['scenes'];
  arrangementClips: ProjectState['arrangementClips'];
}

const KEYS: (keyof HistorySnapshot)[] = [
  'bpm',
  'swing',
  'loop',
  'masterVolume',
  'tracks',
  'clips',
  'sessionMatrix',
  'scenes',
  'arrangementClips',
];

/** Changes closer together than this merge into one undo step. */
export const COALESCE_MS = 350;
/** Maximum retained undo depth. */
export const HISTORY_LIMIT = 100;

let past: HistorySnapshot[] = [];
let future: HistorySnapshot[] = [];
let restoring = false;
let lastChangeAt = -Infinity;
let stopped = true;

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());

const take = (s: ProjectState): HistorySnapshot => ({
  bpm: s.bpm,
  swing: s.swing,
  loop: s.loop,
  masterVolume: s.masterVolume,
  tracks: s.tracks,
  clips: s.clips,
  sessionMatrix: s.sessionMatrix,
  scenes: s.scenes,
  arrangementClips: s.arrangementClips,
});

const differs = (a: HistorySnapshot, b: HistorySnapshot): boolean =>
  KEYS.some((k) => a[k] !== b[k]);

/**
 * Begin recording. Call once on boot (after any storage hydration so the
 * restored project becomes the baseline). Returns a cleanup function that
 * stops recording and clears the stacks.
 */
export function startHistory(): () => void {
  stopped = false;
  const unsub = useProjectStore.subscribe((state, prev) => {
    if (restoring || stopped) return;
    const before = take(prev);
    if (!differs(before, take(state))) return;
    const now = Date.now();
    if (now - lastChangeAt > COALESCE_MS) {
      past.push(before);
      if (past.length > HISTORY_LIMIT) past.shift();
    }
    lastChangeAt = now;
    if (future.length) future = [];
    notify();
  });
  return () => {
    stopped = true;
    past = [];
    future = [];
    lastChangeAt = -Infinity;
    notify();
    unsub();
  };
}

function apply(snapshot: HistorySnapshot): void {
  restoring = true;
  try {
    useProjectStore.setState(snapshot);
  } finally {
    restoring = false;
  }
  // The next real edit must start a fresh undo step, never coalesce
  // into the restore we just performed.
  lastChangeAt = -Infinity;
  notify();
}

export function undo(): void {
  const snapshot = past.pop();
  if (!snapshot) return;
  future.push(take(useProjectStore.getState()));
  apply(snapshot);
}

export function redo(): void {
  const snapshot = future.pop();
  if (!snapshot) return;
  past.push(take(useProjectStore.getState()));
  if (past.length > HISTORY_LIMIT) past.shift();
  apply(snapshot);
}

export const canUndo = (): boolean => past.length > 0;
export const canRedo = (): boolean => future.length > 0;

/** Depths exposed for tests / debugging. */
export const historyDepth = (): { past: number; future: number } => ({
  past: past.length,
  future: future.length,
});

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Reactive `canUndo` for UI buttons. */
export const useCanUndo = (): boolean => useSyncExternalStore(subscribe, canUndo);
/** Reactive `canRedo` for UI buttons. */
export const useCanRedo = (): boolean => useSyncExternalStore(subscribe, canRedo);
