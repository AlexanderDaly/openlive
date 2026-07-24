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
