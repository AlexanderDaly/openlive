/**
 * OpenLive — core project model.
 *
 * These types are the FIXED contract between the audio engine
 * (`@/audio/engine`), the zustand store (`@/store/projectStore`)
 * and the five feature folders (`@/features/*`).
 * Feature agents must NOT change this file.
 */

/** Steps in one bar. All patterns are step-based at 16 steps per bar. */
export const STEPS_PER_BAR = 16;

export type TrackType = 'midi' | 'drums';

export type InstrumentKind = 'drumkit' | 'bass' | 'keys';

export type ViewMode = 'session' | 'arrangement';

export type FxParam = 'reverb' | 'delay' | 'filterFreq';

/** A single note inside a step-based clip pattern. */
export interface NoteEvent {
  /** Step index inside the clip (0 .. lengthSteps-1). */
  step: number;
  /**
   * Note name. Melodic: 'A1', 'C4', 'F#3', ...
   * Drumkit map: 'C1' = kick, 'D1' = snare, 'E1' = clap,
   * 'F#1' = closed hat, 'G1' = low tom, 'A1' = open hat, 'B1' = high tom.
   */
  note: string;
  /** 0 .. 1 */
  velocity: number;
  /** Length in steps. Defaults to 1 when omitted. */
  duration?: number;
}

/** A session clip: a loopable step pattern living in the clip pool. */
export interface Clip {
  id: string;
  trackId: string;
  name: string;
  /** CSS color, used for clip headers / grid cells. */
  color: string;
  /** Pattern length in steps (usually 16, 32 or 64). */
  lengthSteps: number;
  notes: NoteEvent[];
}

/** An instance of a pool clip placed on the arrangement timeline. */
export interface ArrangementClip {
  id: string;
  /** References Clip.id in the clip pool. */
  clipId: string;
  trackId: string;
  startBar: number;
  lengthBars: number;
}

export interface TrackFx {
  /** Reverb send amount 0 .. 1 */
  reverb: number;
  /** Delay send amount 0 .. 1 */
  delay: number;
  /** Low-pass filter cutoff in Hz (20 .. 18000). Default 18000 = open. */
  filterFreq: number;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  /** CSS color for headers / clip tinting. */
  color: string;
  /** Linear gain 0 .. 1 (engine converts to dB). */
  volume: number;
  /** -1 (left) .. 1 (right). */
  pan: number;
  muted: boolean;
  soloed: boolean;
  instrument: InstrumentKind;
  fx: TrackFx;
}

/** A scene = one row of the session matrix (one clip slot per track). */
export interface Scene {
  id: string;
  name: string;
  /** Which clip (or empty slot) this scene triggers per track. */
  slotByTrack: Record<string, string | null>;
}

/**
 * The SERIALIZABLE core of a project — everything that belongs in a saved
 * file / localStorage / the undo history. Runtime playback state
 * (`isPlaying`, `playingClipByTrack`) deliberately lives outside of this.
 */
export interface ProjectContent {
  // ---- transport / meta ----
  bpm: number;
  metronome: boolean;
  /** 0 .. 0.6, applied to the 16n grid. */
  swing: number;
  view: ViewMode;
  /**
   * Arrangement loop region in whole bars, or null when disabled.
   * `lengthBars` is always >= 1 when set. Engine maps this onto Tone.Transport.
   */
  loop: { startBar: number; lengthBars: number } | null;
  /** Master output gain 0 .. 1 (linear, engine master Gain node). */
  masterVolume: number;

  // ---- content ----
  tracks: Track[];
  /** Clip pool, addressed by Clip.id. */
  clips: Record<string, Clip>;
  /**
   * Session matrix: per track, an array of clip slots.
   * `sessionMatrix[trackId][slotIndex]` = clipId | null.
   */
  sessionMatrix: Record<string, (string | null)[]>;
  scenes: Scene[];
  arrangementClips: ArrangementClip[];

  // ---- selection ----
  selectedClipId: string | null;
}

/**
 * Full project state. Shape of the zustand store in
 * `@/store/projectStore` (`useProjectStore`).
 *
 * Actions are plain functions on the same store:
 * `const setBpm = useProjectStore((s) => s.setBpm)`.
 */
export interface ProjectState extends ProjectContent {
  // ---- runtime playback state (never serialized) ----
  isPlaying: boolean;
  /** Ableton rule: at most ONE playing clip per track. */
  playingClipByTrack: Record<string, string | null>;

  // ---- track actions ----
  addTrack: (init?: Partial<Omit<Track, 'id'>>) => string;
  removeTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  setVolume: (trackId: string, volume: number) => void;
  setPan: (trackId: string, pan: number) => void;
  toggleMute: (trackId: string) => void;
  toggleSolo: (trackId: string) => void;
  setFxParam: (trackId: string, param: FxParam, value: number) => void;

  // ---- clip actions ----
  /** Creates a clip in the pool and (optionally) drops it into a session slot. */
  createClip: (trackId: string, slotIndex?: number, init?: Partial<Omit<Clip, 'id' | 'trackId'>>) => string;
  deleteClip: (clipId: string) => void;
  updateClipNotes: (clipId: string, notes: NoteEvent[]) => void;
  renameClip: (clipId: string, name: string) => void;
  setClipColor: (clipId: string, color: string) => void;
  selectClip: (clipId: string | null) => void;
  /** Write (or clear with null) a session slot directly. */
  setSlot: (trackId: string, slotIndex: number, clipId: string | null) => void;

  // ---- session launching ----
  launchClip: (trackId: string, clipId: string) => void;
  stopTrackClip: (trackId: string) => void;
  /** Launch the session-matrix row (scene). Null slots stop that track. */
  launchScene: (sceneIndex: number) => void;
  stopAllClips: () => void;
  /** Append an empty scene row across all tracks; returns the new scene index. */
  addScene: (name?: string) => number;
  renameScene: (sceneIndex: number, name: string) => void;

  // ---- arrangement ----
  addToArrangement: (clipId: string, trackId: string, startBar: number, lengthBars: number) => string;
  moveArrangementClip: (arrangementClipId: string, startBar: number, trackId?: string) => void;
  resizeArrangementClip: (arrangementClipId: string, lengthBars: number) => void;
  removeArrangementClip: (arrangementClipId: string) => void;

  // ---- transport actions ----
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  togglePlay: () => void;
  toggleMetronome: () => void;
  setView: (view: ViewMode) => void;
  /** Set or clear the arrangement loop region (whole bars). */
  setLoop: (loop: { startBar: number; lengthBars: number } | null) => void;
  /** Master output gain 0 .. 1. */
  setMasterVolume: (volume: number) => void;

  // ---- project lifecycle ----
  /**
   * Replace the whole project content (open / import / undo-restore).
   * Playback stops; runtime state resets. The engine follows automatically.
   */
  loadProject: (content: ProjectContent) => void;
  /** Restore the seeded demo project. */
  resetToDemo: () => void;
}
