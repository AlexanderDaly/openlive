/**
 * Project file round-trip, validation and localStorage autosave.
 * Runs in node — localStorage is stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoContent, useProjectStore } from '@/store/projectStore';
import {
  STORAGE_KEY,
  coerceProjectFile,
  hydrateFromStorage,
  parseProjectFile,
  pickContent,
  saveToStorage,
  serializeProject,
  startAutosave,
} from './persistence';

const resetStore = () => {
  useProjectStore.setState({
    ...createDemoContent(),
    isPlaying: false,
    playingClipByTrack: {},
  });
};

/** Minimal localStorage stand-in for the node test environment. */
const installStorage = () => {
  const map = new Map<string, string>();
  const stub = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', stub);
  return map;
};

beforeEach(resetStore);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('serialize / parse round-trip', () => {
  it('preserves the full content slice', () => {
    const state = useProjectStore.getState();
    const json = JSON.stringify(serializeProject(state));
    expect(parseProjectFile(json)).toEqual(pickContent(state));
  });

  it('stamps app + version', () => {
    const file = serializeProject(useProjectStore.getState());
    expect(file.app).toBe('openlive');
    expect(file.version).toBe(1);
    expect(typeof file.savedAt).toBe('string');
  });
});

describe('validation', () => {
  const wrap = (content: unknown) => ({ app: 'openlive', version: 1, content });

  it('rejects non-project JSON', () => {
    expect(() => parseProjectFile('not json at all')).toThrow(/JSON/);
    expect(() => parseProjectFile('42')).toThrow();
    expect(() => parseProjectFile('{"app":"other","version":1}')).toThrow(/OpenLive/);
  });

  it('rejects newer file versions', () => {
    const file = { ...serializeProject(useProjectStore.getState()), version: 99 };
    expect(() => coerceProjectFile(file)).toThrow(/version/);
  });

  it('rejects missing structural fields', () => {
    expect(() => coerceProjectFile(wrap({ clips: {} }))).toThrow(/tracks/);
  });

  it('clamps and defaults scalar fields', () => {
    const content = {
      ...pickContent(useProjectStore.getState()),
      bpm: 999,
      swing: 7,
      view: 'sideways',
      masterVolume: undefined,
      loop: { startBar: -3, lengthBars: 0 },
    };
    const coerced = coerceProjectFile(wrap(content));
    expect(coerced.bpm).toBe(240);
    expect(coerced.swing).toBe(0.6);
    expect(coerced.view).toBe('session');
    expect(coerced.masterVolume).toBeCloseTo(0.9);
    expect(coerced.loop).toEqual({ startBar: 0, lengthBars: 1 });
  });

  it('back-fills TrackFx fields missing from older files', () => {
    const content = pickContent(useProjectStore.getState());
    content.tracks = content.tracks.map((t) => ({
      ...t,
      fx: { reverb: 0.4, delay: 0.1, filterFreq: 9000 } as typeof t.fx,
    }));
    const coerced = coerceProjectFile(wrap(content));
    for (const t of coerced.tracks) {
      expect(t.fx.reverbOn).toBe(true);
      expect(t.fx.delayOn).toBe(true);
      expect(t.fx.filterOn).toBe(true);
      expect(t.fx.reverbDecay).toBeCloseTo(0.5);
    }
    expect(coerced.tracks[0]?.fx.reverb).toBe(0.4);
  });
});

describe('hostile payloads', () => {
  const wrap = (content: unknown) => ({ app: 'openlive', version: 1, content });
  const empty = { tracks: [], clips: {}, sessionMatrix: {}, scenes: [], arrangementClips: [] };

  it('drops entities that cannot be repaired instead of passing them through', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...empty,
        tracks: [42, { name: 'no id' }, { id: 't1', volume: 'loud', instrument: 'tuba' }],
        clips: {
          ok: { id: 'ok', trackId: 't1', notes: [{ step: 0, note: 'C1', velocity: 5 }] },
          noNotes: { id: 'noNotes', trackId: 't1' },
          orphan: { id: 'orphan', trackId: 'gone' },
          junk: 7,
        },
      }),
    );

    expect(coerced.tracks).toHaveLength(1);
    expect(coerced.tracks[0]?.volume).toBe(0.8); // non-numeric → default
    expect(coerced.tracks[0]?.instrument).toBe('keys'); // unknown kind → default
    // Every surviving clip is renderable and playable.
    expect(Object.keys(coerced.clips).sort()).toEqual(['noNotes', 'ok']);
    for (const clip of Object.values(coerced.clips)) {
      expect(Array.isArray(clip.notes)).toBe(true);
      expect(clip.lengthSteps).toBeGreaterThan(0);
    }
    expect(coerced.clips.ok?.notes[0]?.velocity).toBe(1); // clamped
  });

  it('drops malformed notes but keeps the rest of the pattern', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...empty,
        tracks: [{ id: 't1' }],
        clips: {
          c: {
            id: 'c',
            trackId: 't1',
            notes: [
              { step: 0, note: 'C1', velocity: 0.5, duration: 2 },
              { step: 'nope', note: 'D1' },
              { step: 1 },
              null,
            ],
          },
        },
      }),
    );
    expect(coerced.clips.c?.notes).toEqual([
      { step: 0, note: 'C1', velocity: 0.5, duration: 2 },
    ]);
  });

  it('repairs matrix rows and removes dangling references', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...empty,
        tracks: [{ id: 't1' }],
        clips: { c: { id: 'c', trackId: 't1' } },
        sessionMatrix: { t1: 'not-an-array', ghost: ['c'] },
        arrangementClips: [
          { id: 'a1', clipId: 'c', trackId: 't1', startBar: -5, lengthBars: 0 },
          { id: 'a2', clipId: 'missing', trackId: 't1' },
        ],
        selectedClipId: 'missing',
      }),
    );
    expect(coerced.sessionMatrix).toEqual({ t1: [] }); // bad row emptied, ghost row gone
    expect(coerced.arrangementClips).toEqual([
      { id: 'a1', clipId: 'c', trackId: 't1', startBar: 0, lengthBars: 1 },
    ]);
    expect(coerced.selectedClipId).toBeNull();
  });

  it('rebuilds drifted scene snapshots from the matrix', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...empty,
        tracks: [{ id: 't1' }],
        clips: { c: { id: 'c', trackId: 't1' } },
        sessionMatrix: { t1: ['c', null] },
        scenes: [{ id: 's1', name: 'A', slotByTrack: { t1: 'stale' } }, 'junk'],
      }),
    );
    expect(coerced.scenes[0]?.slotByTrack).toEqual({ t1: 'c' });
    expect(coerced.scenes[1]).toEqual({ id: 'scene-2', name: 'Scene 2', slotByTrack: { t1: null } });
  });

  it('leaves the store usable after loading a hostile file', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...empty,
        tracks: [{ id: 't1' }, 'junk'],
        clips: { c: { id: 'c', trackId: 't1', notes: 'nope' } },
        sessionMatrix: { t1: 'not-an-array' },
      }),
    );
    useProjectStore.getState().loadProject(coerced);
    // These all walked straight into a TypeError before validation was deep.
    expect(() => useProjectStore.getState().deleteClip('c')).not.toThrow();
    expect(() => useProjectStore.getState().setSlot('t1', 2, null)).not.toThrow();
    expect(() => useProjectStore.getState().launchScene(0)).not.toThrow();
    expect(() => useProjectStore.getState().removeTrack('t1')).not.toThrow();
  });
});

describe('localStorage save / hydrate', () => {
  it('round-trips through storage and resets playback state', () => {
    installStorage();
    useProjectStore.getState().setBpm(200);
    expect(saveToStorage()).toBe(true);

    useProjectStore.getState().setBpm(60);
    useProjectStore.setState({ isPlaying: true });
    expect(hydrateFromStorage()).toBe(true);
    expect(useProjectStore.getState().bpm).toBe(200);
    expect(useProjectStore.getState().isPlaying).toBe(false);
  });

  it('re-arms scene row 1 so Play still has sound after a refresh', () => {
    installStorage();
    saveToStorage();
    useProjectStore.setState({ playingClipByTrack: {} });

    expect(hydrateFromStorage()).toBe(true);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(useProjectStore.getState().playingClipByTrack['track-drums']).toBe('clip-beat-a');
  });

  it('hydrate is safe with no/corrupt payload', () => {
    expect(hydrateFromStorage()).toBe(false); // no localStorage at all
    const map = installStorage();
    expect(hydrateFromStorage()).toBe(false); // empty storage
    map.set(STORAGE_KEY, '{broken');
    expect(hydrateFromStorage()).toBe(false); // corrupt payload keeps demo
    expect(useProjectStore.getState().bpm).toBe(124);
  });
});

describe('autosave subscription', () => {
  it('debounces content changes and ignores runtime-only changes', () => {
    const map = installStorage();
    vi.useFakeTimers();
    const stop = startAutosave(800);

    // Runtime-only change → no save.
    useProjectStore.setState({ isPlaying: true });
    vi.advanceTimersByTime(2000);
    expect(map.has(STORAGE_KEY)).toBe(false);

    // Content change → one save after the debounce window.
    useProjectStore.getState().setBpm(150);
    useProjectStore.getState().setBpm(151);
    vi.advanceTimersByTime(799);
    expect(map.has(STORAGE_KEY)).toBe(false);
    vi.advanceTimersByTime(2);
    expect(map.has(STORAGE_KEY)).toBe(true);
    const saved = JSON.parse(map.get(STORAGE_KEY) ?? '{}') as { content?: { bpm?: number } };
    expect(saved.content?.bpm).toBe(151);

    stop();
  });
});
