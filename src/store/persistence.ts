/**
 * OpenLive — project persistence (part of the foundation).
 *
 * Three responsibilities, all built on the store's `ProjectContent` slice:
 *   1. JSON project files — `serializeProject` / `parseProjectFile` plus
 *      browser download (`exportProjectFile`) and upload (`importProjectFile`).
 *   2. localStorage autosave — `startAutosave()` debounces content changes
 *      and writes the current project; `hydrateFromStorage()` restores it
 *      on boot (called from `main.tsx` before the first render).
 *   3. Versioning — files carry `{ app, version }` so future migrations
 *      have something to dispatch on.
 *
 * Loading always goes through the store's `loadProject` action, so the
 * audio engine follows automatically (store → engine, never the reverse).
 */
import { useProjectStore } from '@/store/projectStore';
import { DEFAULT_TRACK_FX } from '@/types/daw';
import type {
  ArrangementClip,
  Clip,
  InstrumentKind,
  NoteEvent,
  ProjectContent,
  ProjectState,
  Scene,
  Track,
  TrackFx,
  TrackType,
} from '@/types/daw';

export const PROJECT_FILE_VERSION = 1;
export const STORAGE_KEY = 'openlive.project.v1';

/** Shape of a saved `.json` project file (and the localStorage payload). */
export interface ProjectFile {
  app: 'openlive';
  version: number;
  savedAt: string;
  content: ProjectContent;
}

/* ------------------------------------------------------------------ */
/* Serialize / validate                                                */
/* ------------------------------------------------------------------ */

const CONTENT_KEYS: (keyof ProjectContent)[] = [
  'bpm',
  'metronome',
  'swing',
  'view',
  'loop',
  'masterVolume',
  'tracks',
  'clips',
  'sessionMatrix',
  'scenes',
  'arrangementClips',
  'selectedClipId',
];

/** Pick the serializable content slice from a full store state. */
export function pickContent(s: ProjectState | ProjectContent): ProjectContent {
  return {
    bpm: s.bpm,
    metronome: s.metronome,
    swing: s.swing,
    view: s.view,
    loop: s.loop,
    masterVolume: s.masterVolume,
    tracks: s.tracks,
    clips: s.clips,
    sessionMatrix: s.sessionMatrix,
    scenes: s.scenes,
    arrangementClips: s.arrangementClips,
    selectedClipId: s.selectedClipId,
  };
}

export function serializeProject(s: ProjectState | ProjectContent): ProjectFile {
  return {
    app: 'openlive',
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    content: pickContent(s),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------------ */
/* Per-entity coercion                                                 */
/*                                                                     */
/* Everything below is defensive on purpose: a project file (or a      */
/* localStorage payload) is untrusted input, and the app renders it    */
/* directly. Anything that cannot be repaired into a usable entity is  */
/* DROPPED rather than passed through — a malformed clip that reaches  */
/* the engine or the grid would throw during render, and a bad         */
/* autosave would then reproduce that crash on every reload.           */
/* ------------------------------------------------------------------ */

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

/** Non-empty string id, or null when unusable. */
const id = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const int = (v: unknown, fallback: number, min: number): number =>
  Math.max(min, Math.floor(num(v, fallback)));

const TRACK_TYPES: readonly TrackType[] = ['midi', 'drums'];
const INSTRUMENTS: readonly InstrumentKind[] = ['drumkit', 'bass', 'keys'];

const coerceFx = (raw: unknown): TrackFx => {
  const f = isRecord(raw) ? raw : {};
  return {
    reverb: clamp(num(f.reverb, DEFAULT_TRACK_FX.reverb), 0, 1),
    delay: clamp(num(f.delay, DEFAULT_TRACK_FX.delay), 0, 1),
    filterFreq: clamp(num(f.filterFreq, DEFAULT_TRACK_FX.filterFreq), 20, 18000),
    reverbOn: bool(f.reverbOn, DEFAULT_TRACK_FX.reverbOn),
    delayOn: bool(f.delayOn, DEFAULT_TRACK_FX.delayOn),
    filterOn: bool(f.filterOn, DEFAULT_TRACK_FX.filterOn),
    reverbDecay: clamp(num(f.reverbDecay, DEFAULT_TRACK_FX.reverbDecay), 0, 1),
    delayTime: clamp(num(f.delayTime, DEFAULT_TRACK_FX.delayTime), 0, 1),
    delayFeedback: clamp(num(f.delayFeedback, DEFAULT_TRACK_FX.delayFeedback), 0, 1),
    filterReso: clamp(num(f.filterReso, DEFAULT_TRACK_FX.filterReso), 0, 1),
  };
};

/** A track without a usable id is unaddressable — drop it. */
const coerceTrack = (raw: unknown, index: number): Track | null => {
  if (!isRecord(raw)) return null;
  const trackId = id(raw.id);
  if (!trackId) return null;
  const type = TRACK_TYPES.find((t) => t === raw.type) ?? 'midi';
  const instrument = INSTRUMENTS.find((k) => k === raw.instrument) ?? 'keys';
  return {
    id: trackId,
    name: str(raw.name, `Track ${index + 1}`),
    type,
    color: str(raw.color, '#4a90d9'),
    volume: clamp(num(raw.volume, 0.8), 0, 1),
    pan: clamp(num(raw.pan, 0), -1, 1),
    muted: bool(raw.muted, false),
    soloed: bool(raw.soloed, false),
    instrument,
    fx: coerceFx(raw.fx),
  };
};

/** Notes are the hot path in the engine — a bad one is dropped, not repaired. */
const coerceNote = (raw: unknown): NoteEvent | null => {
  if (!isRecord(raw)) return null;
  const note = id(raw.note);
  if (!note || typeof raw.step !== 'number' || !Number.isFinite(raw.step)) return null;
  const event: NoteEvent = {
    step: Math.max(0, Math.floor(raw.step)),
    note,
    velocity: clamp(num(raw.velocity, 0.9), 0, 1),
  };
  // `duration` is optional in the model — only carry it when present.
  if (raw.duration !== undefined) event.duration = int(raw.duration, 1, 1);
  return event;
};

const coerceClip = (raw: unknown, key: string): Clip | null => {
  if (!isRecord(raw)) return null;
  const clipId = id(raw.id) ?? key;
  const trackId = id(raw.trackId);
  if (!clipId || !trackId) return null;
  const notes = Array.isArray(raw.notes)
    ? raw.notes.map(coerceNote).filter((n): n is NoteEvent => n !== null)
    : [];
  return {
    id: clipId,
    trackId,
    name: str(raw.name, 'Clip'),
    color: str(raw.color, '#4a90d9'),
    lengthSteps: int(raw.lengthSteps, 16, 1),
    notes,
  };
};

const coerceArrangementClip = (
  raw: unknown,
  index: number,
  clips: Record<string, Clip>,
  trackIds: ReadonlySet<string>,
): ArrangementClip | null => {
  if (!isRecord(raw)) return null;
  const clipId = id(raw.clipId);
  const trackId = id(raw.trackId);
  // A block pointing at a missing clip or track can never render or sound.
  if (!clipId || !trackId || !clips[clipId] || !trackIds.has(trackId)) return null;
  return {
    id: id(raw.id) ?? `arr-${index + 1}`,
    clipId,
    trackId,
    startBar: int(raw.startBar, 0, 0),
    lengthBars: int(raw.lengthBars, 1, 1),
  };
};

/**
 * Validate + normalize parsed JSON into a `ProjectContent`.
 * Throws `Error` with a human-readable message when the payload is not an
 * OpenLive project at all; anything salvageable is repaired in place —
 * unknown fields dropped, numeric ranges clamped, malformed entities and
 * dangling references removed.
 */
export function coerceProjectFile(data: unknown): ProjectContent {
  if (!isRecord(data)) throw new Error('Not a JSON object');
  if (data.app !== 'openlive') throw new Error('Not an OpenLive project file');
  if (typeof data.version !== 'number' || data.version > PROJECT_FILE_VERSION) {
    throw new Error(`Unsupported project version ${String(data.version)}`);
  }
  const c = data.content;
  if (!isRecord(c)) throw new Error('Missing project content');
  if (!Array.isArray(c.tracks)) throw new Error('Missing tracks');
  if (!isRecord(c.clips)) throw new Error('Missing clip pool');
  if (!isRecord(c.sessionMatrix)) throw new Error('Missing session matrix');
  if (!Array.isArray(c.scenes)) throw new Error('Missing scenes');
  if (!Array.isArray(c.arrangementClips)) throw new Error('Missing arrangement');

  const loop = isRecord(c.loop)
    ? {
        startBar: Math.max(0, Math.floor(Number(c.loop.startBar) || 0)),
        lengthBars: Math.max(1, Math.floor(Number(c.loop.lengthBars) || 1)),
      }
    : null;

  const tracks = c.tracks
    .map((t, i) => coerceTrack(t, i))
    .filter((t): t is Track => t !== null);
  const trackIds = new Set(tracks.map((t) => t.id));

  const clips: Record<string, Clip> = {};
  for (const [key, raw] of Object.entries(c.clips)) {
    const clip = coerceClip(raw, key);
    // Keep the pool addressable by the key the rest of the project uses.
    if (clip && trackIds.has(clip.trackId)) clips[key] = { ...clip, id: key };
  }

  // Rows only exist for live tracks; slots only point at live clips.
  const sessionMatrix: Record<string, (string | null)[]> = {};
  for (const track of tracks) {
    const row = c.sessionMatrix[track.id];
    sessionMatrix[track.id] = Array.isArray(row)
      ? row.map((slot) => (typeof slot === 'string' && clips[slot] ? slot : null))
      : [];
  }

  // `Scene.slotByTrack` is a projection of the matrix, never an independent
  // source of truth — rebuild it so a drifted file cannot lie about scenes.
  const scenes: Scene[] = c.scenes.map((raw, i) => {
    const s = isRecord(raw) ? raw : {};
    return {
      id: id(s.id) ?? `scene-${i + 1}`,
      name: str(s.name, `Scene ${i + 1}`),
      slotByTrack: Object.fromEntries(
        tracks.map((t) => [t.id, sessionMatrix[t.id]?.[i] ?? null]),
      ),
    };
  });

  const arrangementClips = c.arrangementClips
    .map((a, i) => coerceArrangementClip(a, i, clips, trackIds))
    .filter((a): a is ArrangementClip => a !== null);

  const selectedClipId = typeof c.selectedClipId === 'string' ? c.selectedClipId : null;

  return {
    bpm: clamp(Math.round(Number(c.bpm) || 124), 40, 240),
    metronome: c.metronome === true,
    swing: clamp(Number(c.swing) || 0, 0, 0.6),
    view: c.view === 'arrangement' ? 'arrangement' : 'session',
    loop,
    masterVolume: clamp(typeof c.masterVolume === 'number' ? c.masterVolume : 0.9, 0, 1),
    tracks,
    clips,
    sessionMatrix,
    scenes,
    arrangementClips,
    selectedClipId: selectedClipId && clips[selectedClipId] ? selectedClipId : null,
  };
}

/** Parse a project file's JSON text. Throws on invalid input. */
export function parseProjectFile(json: string): ProjectContent {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON');
  }
  return coerceProjectFile(data);
}

/* ------------------------------------------------------------------ */
/* localStorage autosave                                               */
/* ------------------------------------------------------------------ */

const storage = (): Storage | null =>
  typeof localStorage === 'undefined' ? null : localStorage;

export function saveToStorage(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(serializeProject(useProjectStore.getState())));
    return true;
  } catch {
    return false; // quota / privacy mode — autosave silently off
  }
}

/**
 * Restore the autosaved project into the store, if one exists and parses.
 * Call once on boot BEFORE the first render. Returns true when restored.
 *
 * `loadProject` clears runtime playback state, which is right when opening
 * a foreign project but wrong for a page refresh: the fresh store arms
 * scene row 1 so the first Play always has sound, and a reload used to
 * silently drop that. Re-arm the first scene so refreshing your own
 * session behaves like starting one.
 */
export function hydrateFromStorage(): boolean {
  const s = storage();
  if (!s) return false;
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    useProjectStore.getState().loadProject(parseProjectFile(raw));
    useProjectStore.getState().launchScene(0);
    return true;
  } catch {
    return false; // corrupt payload — keep the demo project
  }
}

export function clearSavedProject(): void {
  storage()?.removeItem(STORAGE_KEY);
}

const contentChanged = (a: ProjectState, b: ProjectState): boolean =>
  CONTENT_KEYS.some((k) => a[k] !== b[k]);

/**
 * Subscribe to the store and autosave the project content (debounced).
 * Returns an unsubscribe/cleanup function. Runtime-only changes
 * (play state, launched clips) never trigger a save.
 */
export function startAutosave(debounceMs = 800): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useProjectStore.subscribe((state, prev) => {
    if (!contentChanged(state, prev)) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      saveToStorage();
    }, debounceMs);
  });
  return () => {
    if (timer !== null) clearTimeout(timer);
    unsub();
  };
}

/* ------------------------------------------------------------------ */
/* File download / upload (browser only)                               */
/* ------------------------------------------------------------------ */

/** Download the current project as `openlive-project-<stamp>.json`. */
export function exportProjectFile(): void {
  const file = serializeProject(useProjectStore.getState());
  const stamp = file.savedAt.slice(0, 16).replace(/[:T]/g, '-');
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `openlive-project-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Read + load a user-picked project file into the store.
 * Resolves when loaded; rejects with a readable Error on invalid files.
 */
export async function importProjectFile(file: File): Promise<void> {
  const text = await file.text();
  const content = parseProjectFile(text);
  useProjectStore.getState().loadProject(content);
  saveToStorage();
}
