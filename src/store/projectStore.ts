/**
 * OpenLive — project store (zustand).
 *
 * SINGLE SOURCE OF TRUTH for all project state. The audio engine
 * (`@/audio/engine`) SUBSCRIBES to this store; UI code only ever
 * calls store actions, never engine methods (except meters).
 *
 * Usage:  const bpm = useProjectStore((s) => s.bpm);
 *         const launchClip = useProjectStore((s) => s.launchClip);
 *
 * This file is part of the fixed contract — feature agents must not edit it.
 */
import { create } from 'zustand';
import type {
  ArrangementClip,
  Clip,
  FxParam,
  NoteEvent,
  ProjectState,
  Scene,
  Track,
  ViewMode,
} from '@/types/daw';

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------------ */
/* Demo project seed — 4 tracks, coherent scenes, small arrangement.  */
/* Key: A minor. Groove: basic house/techno at 124 bpm.               */
/* ------------------------------------------------------------------ */

const TRACK_IDS = {
  drums: 'track-drums',
  bass: 'track-bass',
  keys: 'track-keys',
  lead: 'track-lead',
} as const;

const demoTracks: Track[] = [
  {
    id: TRACK_IDS.drums, name: 'Drums', type: 'drums', color: '#e05c5c',
    volume: 0.9, pan: 0, muted: false, soloed: false, instrument: 'drumkit',
    fx: { reverb: 0.15, delay: 0, filterFreq: 18000 },
  },
  {
    id: TRACK_IDS.bass, name: 'Bass', type: 'midi', color: '#e0a43c',
    volume: 0.8, pan: 0, muted: false, soloed: false, instrument: 'bass',
    fx: { reverb: 0.05, delay: 0, filterFreq: 12000 },
  },
  {
    id: TRACK_IDS.keys, name: 'Keys', type: 'midi', color: '#5cb56a',
    volume: 0.75, pan: -0.1, muted: false, soloed: false, instrument: 'keys',
    fx: { reverb: 0.35, delay: 0.25, filterFreq: 18000 },
  },
  {
    id: TRACK_IDS.lead, name: 'Lead', type: 'midi', color: '#b06fc9',
    volume: 0.7, pan: 0.15, muted: false, soloed: false, instrument: 'keys',
    fx: { reverb: 0.3, delay: 0.4, filterFreq: 16000 },
  },
];

const N = (step: number, note: string, velocity = 0.9, duration = 1): NoteEvent => ({
  step, note, velocity, duration,
});

const demoClips: Record<string, Clip> = {
  // ---- Drums ----
  'clip-beat-a': {
    id: 'clip-beat-a', trackId: TRACK_IDS.drums, name: 'Beat A', color: '#e05c5c', lengthSteps: 16,
    notes: [
      N(0, 'C1', 1), N(4, 'C1', 1), N(8, 'C1', 1), N(12, 'C1', 1), // four-on-the-floor kick
      N(4, 'D1', 0.95), N(12, 'D1', 0.95),                        // snare on 2 & 4
      N(2, 'F#1', 0.55), N(6, 'F#1', 0.55), N(10, 'F#1', 0.55), N(14, 'F#1', 0.55), // offbeat hats
      N(0, 'F#1', 0.3), N(8, 'F#1', 0.3),
    ],
  },
  'clip-beat-b': {
    id: 'clip-beat-b', trackId: TRACK_IDS.drums, name: 'Beat B', color: '#e07a45', lengthSteps: 16,
    notes: [
      N(0, 'C1', 1), N(4, 'C1', 1), N(8, 'C1', 1), N(12, 'C1', 1), N(14, 'C1', 0.7),
      N(4, 'E1', 0.9), N(12, 'E1', 0.9),                          // claps
      N(2, 'F#1', 0.5), N(4, 'F#1', 0.35), N(6, 'F#1', 0.5), N(10, 'F#1', 0.5), N(12, 'F#1', 0.35),
      N(15, 'A1', 0.7),                                           // open hat pickup
    ],
  },
  'clip-beat-fill': {
    id: 'clip-beat-fill', trackId: TRACK_IDS.drums, name: 'Fill', color: '#c94f4f', lengthSteps: 16,
    notes: [
      N(0, 'C1', 1), N(4, 'C1', 1), N(8, 'C1', 1),
      N(4, 'D1', 0.9), N(10, 'D1', 0.6), N(12, 'D1', 0.7), N(13, 'D1', 0.8), N(14, 'E1', 0.9), N(15, 'E1', 1),
      N(2, 'F#1', 0.5), N(6, 'F#1', 0.5),
    ],
  },
  // ---- Bass (A minor) ----
  'clip-bass-a': {
    id: 'clip-bass-a', trackId: TRACK_IDS.bass, name: 'Bass A', color: '#e0a43c', lengthSteps: 16,
    notes: [
      N(0, 'A1', 0.95, 2), N(3, 'A1', 0.7), N(6, 'G1', 0.8), N(8, 'A1', 0.95, 2),
      N(11, 'C2', 0.8), N(14, 'E2', 0.85),
    ],
  },
  'clip-bass-b': {
    id: 'clip-bass-b', trackId: TRACK_IDS.bass, name: 'Bass B', color: '#c98a2e', lengthSteps: 16,
    notes: [
      N(0, 'A1', 0.9), N(2, 'A1', 0.6), N(4, 'G1', 0.8), N(6, 'A1', 0.85),
      N(8, 'F1', 0.9, 2), N(10, 'G1', 0.7), N(12, 'A1', 0.95, 2), N(14, 'E1', 0.75),
    ],
  },
  // ---- Keys (Am chord stabs) ----
  'clip-stabs-a': {
    id: 'clip-stabs-a', trackId: TRACK_IDS.keys, name: 'Stabs A', color: '#5cb56a', lengthSteps: 16,
    notes: [
      N(2, 'A3', 0.65), N(2, 'C4', 0.65), N(2, 'E4', 0.65),       // Am
      N(6, 'F3', 0.6), N(6, 'A3', 0.6), N(6, 'C4', 0.6),          // F
      N(10, 'A3', 0.65), N(10, 'C4', 0.65), N(10, 'E4', 0.65),    // Am
      N(14, 'G3', 0.6), N(14, 'B3', 0.6), N(14, 'D4', 0.6),       // G
    ],
  },
  'clip-stabs-b': {
    id: 'clip-stabs-b', trackId: TRACK_IDS.keys, name: 'Stabs B', color: '#4a9e58', lengthSteps: 16,
    notes: [
      N(0, 'A3', 0.6, 2), N(0, 'C4', 0.6, 2), N(0, 'E4', 0.6, 2),
      N(4, 'G3', 0.6, 2), N(4, 'B3', 0.6, 2), N(4, 'D4', 0.6, 2),
      N(8, 'F3', 0.6, 2), N(8, 'A3', 0.6, 2), N(8, 'C4', 0.6, 2),
      N(12, 'E3', 0.55, 2), N(12, 'G3', 0.55, 2), N(12, 'B3', 0.55, 2),
    ],
  },
  // ---- Lead (arp / line in A minor) ----
  'clip-lead-a': {
    id: 'clip-lead-a', trackId: TRACK_IDS.lead, name: 'Lead A', color: '#b06fc9', lengthSteps: 16,
    notes: [
      N(0, 'A4', 0.55), N(2, 'C5', 0.55), N(4, 'E5', 0.6), N(6, 'A5', 0.6),
      N(8, 'E5', 0.55), N(10, 'C5', 0.55), N(12, 'E5', 0.6), N(14, 'A4', 0.55),
    ],
  },
  'clip-lead-b': {
    id: 'clip-lead-b', trackId: TRACK_IDS.lead, name: 'Lead B', color: '#9a5cb5', lengthSteps: 16,
    notes: [
      N(0, 'E5', 0.6, 2), N(4, 'D5', 0.55), N(6, 'C5', 0.55),
      N(8, 'D5', 0.6, 2), N(12, 'A4', 0.65, 3),
    ],
  },
};

const demoSessionMatrix: Record<string, (string | null)[]> = {
  [TRACK_IDS.drums]: ['clip-beat-a', 'clip-beat-b', null, 'clip-beat-fill'],
  [TRACK_IDS.bass]: ['clip-bass-a', 'clip-bass-b', 'clip-bass-b', null],
  [TRACK_IDS.keys]: ['clip-stabs-a', 'clip-stabs-b', 'clip-stabs-a', null],
  [TRACK_IDS.lead]: [null, 'clip-lead-a', 'clip-lead-b', null],
};

const slotFor = (slotIndex: number): Record<string, string | null> =>
  Object.fromEntries(
    Object.values(TRACK_IDS).map((tid) => [tid, demoSessionMatrix[tid]?.[slotIndex] ?? null]),
  );

const demoScenes: Scene[] = [
  { id: 'scene-a', name: 'A', slotByTrack: slotFor(0) },
  { id: 'scene-b', name: 'B', slotByTrack: slotFor(1) },
  { id: 'scene-break', name: 'Break', slotByTrack: slotFor(2) },
];

let arrId = 0;
const AC = (clipId: string, trackId: string, startBar: number, lengthBars: number): ArrangementClip => ({
  id: `arr-${++arrId}`, clipId, trackId, startBar, lengthBars,
});

const demoArrangement: ArrangementClip[] = [
  AC('clip-beat-a', TRACK_IDS.drums, 0, 8),
  AC('clip-bass-a', TRACK_IDS.bass, 4, 4),
  AC('clip-beat-b', TRACK_IDS.drums, 8, 8),
  AC('clip-bass-b', TRACK_IDS.bass, 8, 8),
  AC('clip-stabs-a', TRACK_IDS.keys, 8, 8),
  AC('clip-lead-a', TRACK_IDS.lead, 12, 4),
];

/* ------------------------------------------------------------------ */

export const useProjectStore = create<ProjectState>()((set) => ({
  // transport / meta
  bpm: 124,
  isPlaying: false,
  metronome: false,
  swing: 0,
  view: 'session',
  loop: null,

  // content
  tracks: demoTracks,
  clips: demoClips,
  sessionMatrix: demoSessionMatrix,
  scenes: demoScenes,
  arrangementClips: demoArrangement,

  // playback / selection
  playingClipByTrack: {},
  selectedClipId: null,

  // ---- track actions ----
  addTrack: (init) => {
    const id = uid();
    set((s) => ({
      tracks: [
        ...s.tracks,
        {
          id,
          name: init?.name ?? `Track ${s.tracks.length + 1}`,
          type: init?.type ?? 'midi',
          color: init?.color ?? '#4a90d9',
          volume: init?.volume ?? 0.8,
          pan: init?.pan ?? 0,
          muted: init?.muted ?? false,
          soloed: init?.soloed ?? false,
          instrument: init?.instrument ?? 'keys',
          fx: init?.fx ?? { reverb: 0.2, delay: 0, filterFreq: 18000 },
        },
      ],
      sessionMatrix: { ...s.sessionMatrix, [id]: Array(8).fill(null) },
    }));
    return id;
  },

  removeTrack: (trackId) =>
    set((s) => {
      const clips = Object.fromEntries(
        Object.entries(s.clips).filter(([, c]) => c.trackId !== trackId),
      );
      const sessionMatrix = { ...s.sessionMatrix };
      delete sessionMatrix[trackId];
      const playingClipByTrack = { ...s.playingClipByTrack };
      delete playingClipByTrack[trackId];
      return {
        tracks: s.tracks.filter((t) => t.id !== trackId),
        clips,
        sessionMatrix,
        playingClipByTrack,
        arrangementClips: s.arrangementClips.filter((a) => a.trackId !== trackId),
        scenes: s.scenes.map((sc) => {
          const slotByTrack = { ...sc.slotByTrack };
          delete slotByTrack[trackId];
          return { ...sc, slotByTrack };
        }),
        selectedClipId:
          s.selectedClipId && clips[s.selectedClipId] ? s.selectedClipId : null,
      };
    }),

  renameTrack: (trackId, name) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)),
    })),

  setVolume: (trackId, volume) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, volume: clamp(volume, 0, 1) } : t,
      ),
    })),

  setPan: (trackId, pan) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, pan: clamp(pan, -1, 1) } : t,
      ),
    })),

  toggleMute: (trackId) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      ),
    })),

  toggleSolo: (trackId) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, soloed: !t.soloed } : t,
      ),
    })),

  setFxParam: (trackId, param: FxParam, value) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              fx: {
                ...t.fx,
                [param]:
                  param === 'filterFreq' ? clamp(value, 20, 18000) : clamp(value, 0, 1),
              },
            }
          : t,
      ),
    })),

  // ---- clip actions ----
  createClip: (trackId, slotIndex, init) => {
    const id = uid();
    set((s) => {
      const track = s.tracks.find((t) => t.id === trackId);
      const clip: Clip = {
        id,
        trackId,
        name: init?.name ?? 'New Clip',
        color: init?.color ?? track?.color ?? '#4a90d9',
        lengthSteps: init?.lengthSteps ?? 16,
        notes: init?.notes ?? [],
      };
      const sessionMatrix = { ...s.sessionMatrix };
      if (slotIndex !== undefined) {
        const slots = [...(sessionMatrix[trackId] ?? [])];
        while (slots.length <= slotIndex) slots.push(null);
        slots[slotIndex] = id;
        sessionMatrix[trackId] = slots;
      }
      return {
        clips: { ...s.clips, [id]: clip },
        sessionMatrix,
        selectedClipId: id,
      };
    });
    return id;
  },

  deleteClip: (clipId) =>
    set((s) => {
      const clips = { ...s.clips };
      delete clips[clipId];
      const sessionMatrix = Object.fromEntries(
        Object.entries(s.sessionMatrix).map(([tid, slots]) => [
          tid,
          slots.map((c) => (c === clipId ? null : c)),
        ]),
      );
      const playingClipByTrack = Object.fromEntries(
        Object.entries(s.playingClipByTrack).map(([tid, c]) => [
          tid,
          c === clipId ? null : c,
        ]),
      );
      const scenes = s.scenes.map((sc) => ({
        ...sc,
        slotByTrack: Object.fromEntries(
          Object.entries(sc.slotByTrack).map(([tid, c]) => [tid, c === clipId ? null : c]),
        ),
      }));
      return {
        clips,
        sessionMatrix,
        playingClipByTrack,
        scenes,
        arrangementClips: s.arrangementClips.filter((a) => a.clipId !== clipId),
        selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      };
    }),

  updateClipNotes: (clipId, notes) =>
    set((s) => {
      const clip = s.clips[clipId];
      if (!clip) return s;
      return { clips: { ...s.clips, [clipId]: { ...clip, notes } } };
    }),

  renameClip: (clipId, name) =>
    set((s) => {
      const clip = s.clips[clipId];
      if (!clip) return s;
      return { clips: { ...s.clips, [clipId]: { ...clip, name } } };
    }),

  selectClip: (clipId) => set({ selectedClipId: clipId }),

  setSlot: (trackId, slotIndex, clipId) =>
    set((s) => {
      const slots = [...(s.sessionMatrix[trackId] ?? [])];
      while (slots.length <= slotIndex) slots.push(null);
      slots[slotIndex] = clipId;
      return { sessionMatrix: { ...s.sessionMatrix, [trackId]: slots } };
    }),

  // ---- session launching ----
  launchClip: (trackId, clipId) =>
    set((s) =>
      s.clips[clipId]
        ? { playingClipByTrack: { ...s.playingClipByTrack, [trackId]: clipId } }
        : s,
    ),

  stopTrackClip: (trackId) =>
    set((s) => ({ playingClipByTrack: { ...s.playingClipByTrack, [trackId]: null } })),

  // Session matrix is the source of truth for which clip each track fires.
  // Null slots explicitly stop that track (Ableton empty-slot behavior).
  launchScene: (sceneIndex) =>
    set((s) => {
      const playingClipByTrack: Record<string, string | null> = { ...s.playingClipByTrack };
      for (const t of s.tracks) {
        playingClipByTrack[t.id] = s.sessionMatrix[t.id]?.[sceneIndex] ?? null;
      }
      return { playingClipByTrack };
    }),

  stopAllClips: () =>
    set((s) => ({
      playingClipByTrack: Object.fromEntries(
        Object.keys(s.playingClipByTrack).map((tid) => [tid, null]),
      ),
    })),

  addScene: (name) => {
    let index = 0;
    set((s) => {
      const rowCount = Math.max(
        s.scenes.length,
        ...Object.values(s.sessionMatrix).map((slots) => slots.length),
        0,
      );
      index = rowCount;
      const sessionMatrix = { ...s.sessionMatrix };
      const slotByTrack: Record<string, string | null> = {};
      for (const t of s.tracks) {
        const slots = [...(sessionMatrix[t.id] ?? [])];
        while (slots.length <= index) slots.push(null);
        sessionMatrix[t.id] = slots;
        slotByTrack[t.id] = null;
      }
      const scene: Scene = {
        id: uid(),
        name: name?.trim() || `Scene ${index + 1}`,
        slotByTrack,
      };
      const scenes = [...s.scenes];
      while (scenes.length < index) {
        scenes.push({
          id: uid(),
          name: `Scene ${scenes.length + 1}`,
          slotByTrack: Object.fromEntries(s.tracks.map((t) => [t.id, null])),
        });
      }
      scenes[index] = scene;
      return { scenes, sessionMatrix };
    });
    return index;
  },

  renameScene: (sceneIndex, name) =>
    set((s) => {
      const trimmed = name.trim();
      if (!trimmed) return s;
      const scenes = [...s.scenes];
      if (scenes[sceneIndex]) {
        scenes[sceneIndex] = { ...scenes[sceneIndex], name: trimmed };
        return { scenes };
      }
      // Ensure a scene exists at this index (matrix row without scene entry).
      while (scenes.length < sceneIndex) {
        scenes.push({
          id: uid(),
          name: `Scene ${scenes.length + 1}`,
          slotByTrack: Object.fromEntries(s.tracks.map((t) => [t.id, null])),
        });
      }
      scenes[sceneIndex] = {
        id: uid(),
        name: trimmed,
        slotByTrack: Object.fromEntries(
          s.tracks.map((t) => [t.id, s.sessionMatrix[t.id]?.[sceneIndex] ?? null]),
        ),
      };
      return { scenes };
    }),

  // ---- arrangement ----
  addToArrangement: (clipId, trackId, startBar, lengthBars) => {
    const id = uid();
    set((s) => ({
      arrangementClips: [
        ...s.arrangementClips,
        { id, clipId, trackId, startBar: Math.max(0, startBar), lengthBars: Math.max(1, lengthBars) },
      ],
    }));
    return id;
  },

  moveArrangementClip: (arrangementClipId, startBar, trackId) =>
    set((s) => ({
      arrangementClips: s.arrangementClips.map((a) =>
        a.id === arrangementClipId
          ? { ...a, startBar: Math.max(0, startBar), trackId: trackId ?? a.trackId }
          : a,
      ),
    })),

  resizeArrangementClip: (arrangementClipId, lengthBars) =>
    set((s) => ({
      arrangementClips: s.arrangementClips.map((a) =>
        a.id === arrangementClipId ? { ...a, lengthBars: Math.max(1, lengthBars) } : a,
      ),
    })),

  removeArrangementClip: (arrangementClipId) =>
    set((s) => ({
      arrangementClips: s.arrangementClips.filter((a) => a.id !== arrangementClipId),
    })),

  // ---- transport actions ----
  setBpm: (bpm) => set({ bpm: clamp(Math.round(bpm), 40, 240) }),

  setSwing: (swing) => set({ swing: clamp(swing, 0, 0.6) }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  toggleMetronome: () => set((s) => ({ metronome: !s.metronome })),

  setView: (view: ViewMode) => set({ view }),

  setLoop: (loop) =>
    set({
      loop:
        loop === null
          ? null
          : {
              startBar: Math.max(0, Math.floor(loop.startBar)),
              lengthBars: Math.max(1, Math.floor(loop.lengthBars)),
            },
    }),
}));
