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
import type { ProjectContent, ProjectState, TrackFx } from '@/types/daw';

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

/**
 * Validate + normalize parsed JSON into a `ProjectContent`.
 * Throws `Error` with a human-readable message on anything unusable;
 * unknown extra fields are dropped, bad numeric ranges are clamped.
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

  return {
    bpm: clamp(Math.round(Number(c.bpm) || 124), 40, 240),
    metronome: c.metronome === true,
    swing: clamp(Number(c.swing) || 0, 0, 0.6),
    view: c.view === 'arrangement' ? 'arrangement' : 'session',
    loop,
    masterVolume: clamp(typeof c.masterVolume === 'number' ? c.masterVolume : 0.9, 0, 1),
    // Older files may predate newer TrackFx fields — fill defaults.
    tracks: (c.tracks as ProjectContent['tracks']).map((t) => ({
      ...t,
      fx: { ...DEFAULT_TRACK_FX, ...(isRecord(t.fx) ? (t.fx as Partial<TrackFx>) : {}) },
    })),
    clips: c.clips as ProjectContent['clips'],
    sessionMatrix: c.sessionMatrix as ProjectContent['sessionMatrix'],
    scenes: c.scenes as ProjectContent['scenes'],
    arrangementClips: c.arrangementClips as ProjectContent['arrangementClips'],
    selectedClipId: typeof c.selectedClipId === 'string' ? c.selectedClipId : null,
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
 */
export function hydrateFromStorage(): boolean {
  const s = storage();
  if (!s) return false;
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    useProjectStore.getState().loadProject(parseProjectFile(raw));
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
