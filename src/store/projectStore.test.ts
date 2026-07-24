/**
 * Store integrity tests — every action that touches cross-referenced
 * state (clip pool ↔ matrix ↔ scenes ↔ arrangement ↔ playing map) must
 * leave no dangling references behind.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoContent, useProjectStore } from '@/store/projectStore';

const resetStore = () => {
  useProjectStore.setState({
    ...createDemoContent(),
    isPlaying: false,
    playingClipByTrack: {},
  });
};

const S = () => useProjectStore.getState();

beforeEach(resetStore);

describe('demo seed', () => {
  it('has 4 tracks, 9 clips, 3 scenes and an arrangement', () => {
    expect(S().tracks).toHaveLength(4);
    expect(Object.keys(S().clips)).toHaveLength(9);
    expect(S().scenes).toHaveLength(3);
    expect(S().arrangementClips.length).toBeGreaterThan(0);
    expect(S().masterVolume).toBeCloseTo(0.9);
  });
});

describe('tracks', () => {
  it('addTrack appends a track and an 8-slot matrix row', () => {
    const id = S().addTrack({ name: 'Extra', instrument: 'bass' });
    const track = S().tracks.find((t) => t.id === id);
    expect(track?.name).toBe('Extra');
    expect(track?.instrument).toBe('bass');
    expect(S().sessionMatrix[id]).toEqual(Array(8).fill(null));
  });

  it('removeTrack cleans clips, matrix, scenes, arrangement and playing map', () => {
    const drums = 'track-drums';
    S().launchClip(drums, 'clip-beat-a');
    S().removeTrack(drums);
    expect(S().tracks.some((t) => t.id === drums)).toBe(false);
    expect(S().sessionMatrix[drums]).toBeUndefined();
    expect(Object.values(S().clips).some((c) => c.trackId === drums)).toBe(false);
    expect(S().arrangementClips.some((a) => a.trackId === drums)).toBe(false);
    expect(S().playingClipByTrack[drums]).toBeUndefined();
    for (const scene of S().scenes) expect(drums in scene.slotByTrack).toBe(false);
  });

  it('setVolume / setPan / setFxParam clamp their ranges', () => {
    S().setVolume('track-bass', 4);
    S().setPan('track-bass', -7);
    S().setFxParam('track-bass', 'reverb', 9);
    S().setFxParam('track-bass', 'filterFreq', 5);
    const bass = S().tracks.find((t) => t.id === 'track-bass')!;
    expect(bass.volume).toBe(1);
    expect(bass.pan).toBe(-1);
    expect(bass.fx.reverb).toBe(1);
    expect(bass.fx.filterFreq).toBe(20);
  });

  it('setTrackFx toggles device power, clamps macros, leaves other fields alone', () => {
    S().setTrackFx('track-keys', { reverbOn: false, reverbDecay: 4, delayFeedback: -1 });
    const keys = S().tracks.find((t) => t.id === 'track-keys')!;
    expect(keys.fx.reverbOn).toBe(false);
    expect(keys.fx.reverbDecay).toBe(1);
    expect(keys.fx.delayFeedback).toBe(0);
    expect(keys.fx.reverb).toBe(0.35);
    expect(keys.fx.delayOn).toBe(true);
  });
});

describe('clips', () => {
  it('createClip drops the clip into the requested slot and selects it', () => {
    const id = S().createClip('track-keys', 5, { name: 'Riff' });
    expect(S().clips[id]?.name).toBe('Riff');
    expect(S().sessionMatrix['track-keys']?.[5]).toBe(id);
    expect(S().selectedClipId).toBe(id);
  });

  it('deleteClip removes every reference to the clip', () => {
    S().launchClip('track-drums', 'clip-beat-a');
    S().selectClip('clip-beat-a');
    S().deleteClip('clip-beat-a');
    expect(S().clips['clip-beat-a']).toBeUndefined();
    expect(S().sessionMatrix['track-drums']).not.toContain('clip-beat-a');
    expect(S().arrangementClips.some((a) => a.clipId === 'clip-beat-a')).toBe(false);
    expect(S().playingClipByTrack['track-drums']).toBeNull();
    expect(S().selectedClipId).toBeNull();
    for (const scene of S().scenes) {
      expect(Object.values(scene.slotByTrack)).not.toContain('clip-beat-a');
    }
  });

  it('setClipColor recolors; unknown clip is a no-op', () => {
    S().setClipColor('clip-beat-a', '#123456');
    expect(S().clips['clip-beat-a']?.color).toBe('#123456');
    const before = S().clips;
    S().setClipColor('nope', '#fff');
    expect(S().clips).toBe(before);
  });
});

describe('session launching', () => {
  it('launchClip ignores unknown clips', () => {
    S().launchClip('track-drums', 'ghost');
    expect(S().playingClipByTrack['track-drums']).toBeUndefined();
  });

  it('launchScene reads the matrix row; null slots stop the track', () => {
    S().launchScene(1);
    expect(S().playingClipByTrack).toMatchObject({
      'track-drums': 'clip-beat-b',
      'track-bass': 'clip-bass-b',
      'track-keys': 'clip-stabs-b',
      'track-lead': 'clip-lead-a',
    });
    S().launchScene(3); // demo row 3: only drums has a fill
    expect(S().playingClipByTrack).toMatchObject({
      'track-drums': 'clip-beat-fill',
      'track-bass': null,
      'track-keys': null,
      'track-lead': null,
    });
  });

  it('stopAllClips nulls every playing slot', () => {
    S().launchScene(0);
    S().stopAllClips();
    expect(Object.values(S().playingClipByTrack).every((v) => v === null)).toBe(true);
  });

  it('addScene extends every matrix row and appends a launchable scene', () => {
    const index = S().addScene('Drop');
    expect(index).toBe(4); // demo matrices already have 4 rows
    for (const t of S().tracks) {
      expect(S().sessionMatrix[t.id]?.length).toBeGreaterThan(index);
    }
    expect(S().scenes[index]?.name).toBe('Drop');
    // The new row is empty → launching it stops everything.
    S().launchScene(0);
    S().launchScene(index);
    expect(Object.values(S().playingClipByTrack).every((v) => v === null)).toBe(true);
  });
});

describe('transport / meta', () => {
  it('setBpm rounds and clamps to 40..240', () => {
    S().setBpm(500);
    expect(S().bpm).toBe(240);
    S().setBpm(33.4);
    expect(S().bpm).toBe(40);
    S().setBpm(128.6);
    expect(S().bpm).toBe(129);
  });

  it('setLoop floors bars and enforces a 1-bar minimum', () => {
    S().setLoop({ startBar: 2.9, lengthBars: 0.2 });
    expect(S().loop).toEqual({ startBar: 2, lengthBars: 1 });
    S().setLoop(null);
    expect(S().loop).toBeNull();
  });

  it('setMasterVolume clamps 0..1', () => {
    S().setMasterVolume(3);
    expect(S().masterVolume).toBe(1);
    S().setMasterVolume(-1);
    expect(S().masterVolume).toBe(0);
  });
});

describe('project lifecycle', () => {
  it('loadProject replaces content and resets playback state', () => {
    S().launchScene(0);
    useProjectStore.setState({ isPlaying: true });
    const content = { ...createDemoContent(), bpm: 99 };
    S().loadProject(content);
    expect(S().bpm).toBe(99);
    expect(S().isPlaying).toBe(false);
    expect(S().playingClipByTrack).toEqual({});
  });

  it('resetToDemo restores the seeded project', () => {
    S().removeTrack('track-drums');
    S().setBpm(80);
    S().resetToDemo();
    expect(S().bpm).toBe(124);
    expect(S().tracks).toHaveLength(4);
    expect(S().clips['clip-beat-a']).toBeDefined();
  });

  it('createDemoContent returns unshared copies', () => {
    const a = createDemoContent();
    const b = createDemoContent();
    expect(a).not.toBe(b);
    expect(a.tracks).not.toBe(b.tracks);
    expect(a).toEqual(b);
  });
});
