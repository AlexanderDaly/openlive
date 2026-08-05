/**
 * Project file round-trip, validation and localStorage autosave.
 * Runs in node — localStorage is stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoContent, useProjectStore } from '@/store/projectStore';
import { LIMITS } from '@/types/daw';
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

describe('prototype-inherited keys', () => {
  const wrap = (content: unknown) => ({ app: 'openlive', version: 1, content });
  const base = {
    tracks: [{ id: 't1' }],
    clips: { c: { id: 'c', trackId: 't1' } },
    sessionMatrix: {},
    scenes: [],
    arrangementClips: [],
  };

  it('does not answer clip lookups from the prototype chain', () => {
    const { clips } = coerceProjectFile(wrap(base));
    // Before: `clips['constructor']` was Object — truthy, so every reference
    // check passed and the engine got a non-Clip (`clip.notes.map` → throw).
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect((clips as Record<string, unknown>)[key]).toBeUndefined();
    }
  });

  it('rejects inherited names used as slot / arrangement / selection references', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...base,
        sessionMatrix: { t1: ['constructor', 'toString', 'c'] },
        arrangementClips: [
          { id: 'a1', clipId: 'constructor', trackId: 't1' },
          { id: 'a2', clipId: 'c', trackId: 'toString' },
          { id: 'a3', clipId: 'c', trackId: 't1' },
        ],
        selectedClipId: 'toString',
      }),
    );
    expect(coerced.sessionMatrix.t1).toEqual([null, null, 'c']);
    expect(coerced.arrangementClips.map((a) => a.id)).toEqual(['a3']);
    expect(coerced.selectedClipId).toBeNull();
  });

  it('refuses reserved names as entity ids', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...base,
        tracks: [{ id: '__proto__' }, { id: 'constructor' }, { id: 't1' }],
        clips: {
          __proto__: { id: '__proto__', trackId: 't1' },
          constructor: { id: 'constructor', trackId: 't1' },
          c: { id: 'c', trackId: 't1' },
        },
      }),
    );
    expect(coerced.tracks.map((t) => t.id)).toEqual(['t1']);
    expect(Object.keys(coerced.clips)).toEqual(['c']);
    expect(Object.getPrototypeOf(coerced.clips)).toBeNull();
  });

  it('ignores an inherited session-matrix row', () => {
    // A REAL prototype link. `JSON.parse('{"__proto__":…}')` defines an own
    // property and leaves the prototype alone, so it would arm nothing and
    // this test would pass with or without the own-key guard.
    const hostile = Object.create({ t1: ['c'] }) as Record<string, unknown>;
    expect(hostile.t1).toEqual(['c']); // the trap is armed: a bracket read finds it
    expect(Object.hasOwn(hostile, 't1')).toBe(false);

    const coerced = coerceProjectFile(wrap({ ...base, sessionMatrix: hostile }));
    expect(coerced.sessionMatrix.t1).toEqual([]);
  });

  it('keeps entity ids unique when a file collides with a positional fallback', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...base,
        // The second block has no id, so it falls back to 'arr-2' — which the
        // first block already claimed.
        arrangementClips: [
          { id: 'arr-2', clipId: 'c', trackId: 't1' },
          { clipId: 'c', trackId: 't1' },
        ],
        scenes: [{ id: 'scene-2', name: 'A' }, { name: 'B' }],
      }),
    );
    const arrIds = coerced.arrangementClips.map((a) => a.id);
    expect(arrIds).toHaveLength(2);
    expect(new Set(arrIds).size).toBe(2);
    const sceneIds = coerced.scenes.map((s) => s.id);
    expect(new Set(sceneIds).size).toBe(sceneIds.length);
  });

  it('keeps the first of two tracks sharing an id', () => {
    const coerced = coerceProjectFile(
      wrap({
        ...base,
        tracks: [
          { id: 't1', name: 'First' },
          { id: 't1', name: 'Second' },
          { id: 't2', name: 'Other' },
        ],
      }),
    );
    // A repeated id would give two strips one matrix row and one React key,
    // and `removeTrack` would delete both.
    expect(coerced.tracks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(coerced.tracks[0]?.name).toBe('First');
  });
});

describe('geometry bounds', () => {
  const wrap = (content: unknown) => ({ app: 'openlive', version: 1, content });

  it('clamps arrangement blocks inside the timeline bound', () => {
    const { arrangementClips } = coerceProjectFile(
      wrap({
        tracks: [{ id: 't1' }],
        clips: { c: { id: 'c', trackId: 't1' } },
        sessionMatrix: {},
        scenes: [],
        arrangementClips: [{ id: 'a1', clipId: 'c', trackId: 't1', startBar: 1e9, lengthBars: 1e6 }],
      }),
    );
    const a = arrangementClips[0]!;
    // ArrangementView renders one ruler cell per bar of `startBar + lengthBars`.
    expect(a.startBar).toBeLessThan(LIMITS.arrangementBars);
    expect(a.startBar + a.lengthBars).toBeLessThanOrEqual(LIMITS.arrangementBars);
  });

  it('clamps the loop region and keeps its end inside the bound', () => {
    const { loop } = coerceProjectFile(
      wrap({
        tracks: [],
        clips: {},
        sessionMatrix: {},
        scenes: [],
        arrangementClips: [],
        loop: { startBar: 5e8, lengthBars: 5e8 },
      }),
    );
    expect(loop!.startBar + loop!.lengthBars).toBeLessThanOrEqual(LIMITS.arrangementBars);
  });

  it('bounds clip length, note steps and note count', () => {
    const { clips } = coerceProjectFile(
      wrap({
        tracks: [{ id: 't1' }],
        clips: {
          c: {
            id: 'c',
            trackId: 't1',
            lengthSteps: 5e8,
            notes: [
              { step: 0, note: 'C1', duration: 1e9 },
              { step: 9e9, note: 'D1' }, // beyond the pattern — silent and invisible
              { step: -4, note: 'E1' },
            ],
          },
        },
        sessionMatrix: {},
        scenes: [],
        arrangementClips: [],
      }),
    );
    const clip = clips.c!;
    expect(clip.lengthSteps).toBe(LIMITS.clipSteps);
    expect(clip.notes).toHaveLength(1);
    expect(clip.notes[0]?.duration).toBeLessThanOrEqual(clip.lengthSteps);
  });

  it('caps the note count per clip', () => {
    // Each note becomes a scheduled Tone.Part event, so the per-clip cap is
    // what keeps a crafted pattern from flooding the transport.
    const { clips } = coerceProjectFile(
      wrap({
        tracks: [{ id: 't1' }],
        clips: {
          c: {
            id: 'c',
            trackId: 't1',
            lengthSteps: LIMITS.clipSteps,
            notes: Array.from({ length: LIMITS.notesPerClip + 500 }, (_, i) => ({
              step: i % LIMITS.clipSteps,
              note: 'C1',
            })),
          },
        },
        sessionMatrix: {},
        scenes: [],
        arrangementClips: [],
      }),
    );
    expect(clips.c?.notes).toHaveLength(LIMITS.notesPerClip);
  });

  it('truncates oversized collections', () => {
    const coerced = coerceProjectFile(
      wrap({
        tracks: Array.from({ length: 500 }, (_, i) => ({ id: `t${i}` })),
        clips: Object.fromEntries(
          Array.from({ length: 3000 }, (_, i) => [`c${i}`, { id: `c${i}`, trackId: 't0' }]),
        ),
        sessionMatrix: { t0: new Array(50_000).fill(null) },
        scenes: new Array(50_000).fill({ id: 's', name: 'x' }),
        arrangementClips: Array.from({ length: 5000 }, (_, i) => ({
          id: `a${i}`,
          clipId: 'c0',
          trackId: 't0',
        })),
      }),
    );
    expect(coerced.tracks).toHaveLength(LIMITS.tracks);
    expect(Object.keys(coerced.clips)).toHaveLength(LIMITS.poolClips);
    expect(coerced.sessionMatrix.t0).toHaveLength(LIMITS.sceneRows);
    expect(coerced.scenes).toHaveLength(LIMITS.sceneRows);
    expect(coerced.arrangementClips).toHaveLength(LIMITS.arrangementClips);
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
