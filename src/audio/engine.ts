/**
 * OpenLive — audio engine (Tone.js singleton, framework-free).
 *
 * SYNC DIRECTION (fixed):  store  ──subscribe──▶  engine
 * The engine NEVER writes to the store. UI/feature code calls store
 * actions only; the engine reacts to store changes via
 * `useProjectStore.subscribe` and always reads fresh state with
 * `useProjectStore.getState()` (no stale closures).
 * The only engine API UI code may call directly:
 *   - `engine.ensureStarted()`  (from a user gesture, before playing)
 *   - `engine.previewNote(trackId, note, velocity?)` (one-shot audition)
 *   - `engine.previewClip(clipId)` (one-shot clip audition, transport-free)
 *   - `engine.getTrackMeter(id)` / `engine.getMasterMeter()` (read-only)
 *   - `engine.getTransportPosition()` / `engine.getTransportStep()` (read-only)
 *   - `engine.isStarted()` (read-only)
 *
 * All timing is expressed in Transport TICKS ("<n>i"), so patterns
 * stay correct when the BPM changes mid-playback.
 */
import * as Tone from 'tone';
import { useProjectStore } from '@/store/projectStore';
import type { Clip, NoteEvent, ProjectState, Track } from '@/types/daw';
import { STEPS_PER_BAR } from '@/types/daw';

/* ------------------------------------------------------------------ */
/* Instruments (pure Tone.js synths, no samples)                       */
/* ------------------------------------------------------------------ */

interface InstrumentVoice {
  /** Node that feeds the track chain (filter input). */
  readonly output: Tone.Gain;
  trigger(note: string, durationSec: number, velocity: number, time: number): void;
  dispose(): void;
}

/** 'drumkit': C1 kick, D1 snare, E1 clap, F#1 closed hat, G1 low tom, A1 open hat, B1 high tom. */
class DrumKit implements InstrumentVoice {
  readonly output = new Tone.Gain(1);

  private kick = new Tone.MembraneSynth({
    pitchDecay: 0.045,
    octaves: 7,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.4 },
  });
  private snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.17, sustain: 0 },
  });
  private clapFilter = new Tone.Filter(1400, 'bandpass');
  private clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.002, decay: 0.15, sustain: 0 },
  });
  private closedHat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  });
  private openHat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.3, release: 0.05 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  });
  private lowTom = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.25, sustain: 0.01, release: 0.2 },
  });
  private highTom = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.22, sustain: 0.01, release: 0.18 },
  });

  constructor() {
    this.closedHat.volume.value = -12;
    this.openHat.volume.value = -12;
    this.kick.connect(this.output);
    this.snare.connect(this.output);
    this.clap.connect(this.clapFilter);
    this.clapFilter.connect(this.output);
    this.closedHat.connect(this.output);
    this.openHat.connect(this.output);
    this.lowTom.connect(this.output);
    this.highTom.connect(this.output);
  }

  trigger(note: string, durationSec: number, velocity: number, time: number): void {
    switch (note) {
      case 'C1':
        this.kick.triggerAttackRelease('C1', Math.max(durationSec, 0.2), time, velocity);
        break;
      case 'D1':
        this.snare.triggerAttackRelease(Math.max(durationSec, 0.15), time, velocity);
        break;
      case 'E1':
        this.clap.triggerAttackRelease(Math.max(durationSec, 0.12), time, velocity);
        break;
      case 'F#1':
        this.closedHat.triggerAttackRelease('F#5', 0.05, time, velocity);
        break;
      case 'A1':
        this.openHat.triggerAttackRelease('A5', Math.max(durationSec, 0.25), time, velocity);
        break;
      case 'G1':
        this.lowTom.triggerAttackRelease('G2', durationSec, time, velocity);
        break;
      case 'B1':
        this.highTom.triggerAttackRelease('B2', durationSec, time, velocity);
        break;
      default:
        // Fall back to treating it as a pitched tom hit.
        this.lowTom.triggerAttackRelease(note, durationSec, time, velocity);
    }
  }

  dispose(): void {
    for (const n of [
      this.kick,
      this.snare,
      this.clap,
      this.clapFilter,
      this.closedHat,
      this.openHat,
      this.lowTom,
      this.highTom,
      this.output,
    ]) {
      n.dispose();
    }
  }
}

class MonoVoice implements InstrumentVoice {
  readonly output = new Tone.Gain(1);
  private synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.1 },
    filterEnvelope: { attack: 0.001, decay: 0.12, sustain: 0.3, baseFrequency: 120, octaves: 3.5 },
  });
  constructor() {
    this.synth.connect(this.output);
  }
  trigger(note: string, durationSec: number, velocity: number, time: number): void {
    this.synth.triggerAttackRelease(note, durationSec, time, velocity);
  }
  dispose(): void {
    this.synth.dispose();
    this.output.dispose();
  }
}

class PolyVoice implements InstrumentVoice {
  readonly output = new Tone.Gain(1);
  private synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 },
  });
  constructor() {
    this.synth.connect(this.output);
  }
  trigger(note: string, durationSec: number, velocity: number, time: number): void {
    this.synth.triggerAttackRelease(note, durationSec, time, velocity);
  }
  dispose(): void {
    this.synth.releaseAll();
    this.synth.dispose();
    this.output.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Track chain                                                         */
/* ------------------------------------------------------------------ */

interface TrackChain {
  voice: InstrumentVoice;
  filter: Tone.Filter;
  reverbSend: Tone.Gain;
  delaySend: Tone.Gain;
  reverb: Tone.Reverb;
  delay: Tone.FeedbackDelay;
  channel: Tone.Channel;
  meter: Tone.Meter;
}

/** A NoteEvent decorated with its Transport time (ticks string) for Tone.Part. */
type ClipPartEvent = NoteEvent & { time: string };

interface PlayingPart {
  clipId: string;
  part: Tone.Part<ClipPartEvent>;
  /** Pending scheduleOnce id while waiting for the next bar boundary. */
  scheduleId: number | null;
}

const volumeToDb = (v: number): number =>
  v <= 0.0001 ? -Infinity : Tone.gainToDb(Math.min(1, Math.max(0, v)));

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** TrackFx 0..1 macro → reverb tail in seconds. */
const decaySeconds = (v: number): number => 0.3 + clamp01(v) * 7.7;
/** TrackFx 0..1 macro → delay time in seconds. */
const delaySeconds = (v: number): number => 0.05 + clamp01(v) * 0.7;
/** TrackFx 0..1 macro → filter Q. */
const resoToQ = (v: number): number => 0.2 + clamp01(v) * 11.8;
/** Filter "bypass" = fully open cutoff (keeps the node in the chain). */
const FILTER_OPEN_HZ = 18000;

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

class AudioEngine {
  private started = false;
  private startPromise: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;

  private master: Tone.Gain | null = null;
  private masterMeter: Tone.Meter | null = null;
  private limiter: Tone.Limiter | null = null;

  private chains = new Map<string, TrackChain>();
  private playing = new Map<string, PlayingPart>();

  private metSynth: Tone.MembraneSynth | null = null;

  /** Public singleton — constructor does NOT create Tone nodes. */
  constructor() {
    // Node creation is deferred to ensureStarted() (first user gesture).
  }

  isStarted(): boolean {
    return this.started;
  }

  /**
   * Call from a user gesture (e.g. the play button) before playback.
   * Safe to call repeatedly — and safe to call CONCURRENTLY: overlapping
   * calls share one init promise, so nodes/scheduleRepeats are only ever
   * created once (a double-init used to double-trigger every note).
   */
  async ensureStarted(): Promise<void> {
    if (!this.startPromise) {
      this.startPromise = (async () => {
        await Tone.start();
        this.initNodes();
        this.started = true;
        this.subscribeToStore();
        this.fullSync();
      })();
      // If unlock failed (no valid gesture), allow a later retry.
      this.startPromise.catch(() => {
        this.startPromise = null;
        this.started = false;
      });
    }
    await this.startPromise;
    const ctx = Tone.getContext();
    if (ctx.state !== 'running') await ctx.resume();
  }

  /** Meter tapped off the track channel (post-fader). Undefined until ensureStarted() + track exists. */
  getTrackMeter(trackId: string): Tone.Meter | undefined {
    return this.chains.get(trackId)?.meter;
  }

  getMasterMeter(): Tone.Meter | undefined {
    return this.masterMeter ?? undefined;
  }

  /** Transport position as 'bars:beats:sixteenths' (only meaningful while playing). */
  getTransportPosition(): string {
    return String(Tone.getTransport().position);
  }

  /**
   * Absolute 16th-note step derived from transport ticks (0 before unlock).
   * Prefer this over parsing getTransportPosition() — tick math stays
   * correct for non-bar-aligned clips and mid-play BPM changes.
   */
  getTransportStep(): number {
    if (!this.started) return 0;
    return Math.floor(Tone.getTransport().ticks / this.sixteenthTicks());
  }

  /**
   * One-shot audition of a note through the track's existing chain
   * (instrument → filter → channel/sends → master), so mute/solo/fx apply.
   * Safe no-op before `ensureStarted()` or for an unknown track id.
   * Call from a user gesture; chain after `ensureStarted()` if audio may
   * not be unlocked yet.
   */
  previewNote(trackId: string, note: string, velocity = 0.9): void {
    if (!this.started) return;
    const chain = this.chains.get(trackId);
    if (!chain) return;
    chain.voice.trigger(note, 0.3, velocity, Tone.now());
  }

  /**
   * One-shot audition of a whole clip through the track's real chain,
   * scheduled independently of the transport (used by the clip editor in
   * arrangement view, where ▶ must audition, not start timeline playback).
   * Safe no-op before `ensureStarted()` or for an unknown clip id.
   */
  previewClip(clipId: string): void {
    if (!this.started) return;
    const clip = useProjectStore.getState().clips[clipId];
    const chain = clip ? this.chains.get(clip.trackId) : undefined;
    if (!clip || !chain) return;
    const now = Tone.now();
    const secPerStep = this.stepSeconds(1);
    for (const n of clip.notes) {
      chain.voice.trigger(n.note, this.stepSeconds(n.duration ?? 1), n.velocity, now + n.step * secPerStep);
    }
  }

  /* ---------------- internal ---------------- */

  private sixteenthTicks(): number {
    return Tone.getTransport().PPQ / 4;
  }

  private stepSeconds(steps: number): number {
    return Tone.Time(`${steps * this.sixteenthTicks()}i`).toSeconds();
  }

  private initNodes(): void {
    this.master = new Tone.Gain(useProjectStore.getState().masterVolume);
    this.masterMeter = new Tone.Meter({ normalRange: true, smoothing: 0.8 });
    this.limiter = new Tone.Limiter(-1);
    this.master.connect(this.masterMeter);
    this.master.connect(this.limiter);
    this.limiter.toDestination();

    // Metronome voice.
    this.metSynth = new Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
    });
    this.metSynth.volume.value = -10;
    this.metSynth.connect(this.master);

    const transport = Tone.getTransport();
    transport.swingSubdivision = '16n';

    // Metronome tick on every beat; reads fresh store state each tick.
    // The beat number is derived from the transport position (not a local
    // counter), so the accent always lands on the bar downbeat even when
    // the metronome is toggled mid-playback or the transport loops.
    transport.scheduleRepeat((time) => {
      const s = useProjectStore.getState();
      if (!s.metronome || !s.isPlaying) return;
      const t = Tone.getTransport();
      const beat = Math.floor(t.getTicksAtTime(time) / t.PPQ) % 4;
      this.metSynth?.triggerAttackRelease(beat === 0 ? 'A5' : 'E5', 0.05, time, beat === 0 ? 0.9 : 0.5);
    }, '4n');

    // Arrangement playback: every 16th, look up which arrangement clips are
    // active at the current position and trigger their notes for this step.
    transport.scheduleRepeat((time) => {
      const s = useProjectStore.getState();
      if (s.view !== 'arrangement' || !s.isPlaying) return;
      const ticks = Tone.getTransport().getTicksAtTime(time);
      const step = Math.floor(ticks / this.sixteenthTicks());
      const bar = Math.floor(step / STEPS_PER_BAR);
      for (const a of s.arrangementClips) {
        if (bar < a.startBar || bar >= a.startBar + a.lengthBars) continue;
        const clip = s.clips[a.clipId];
        const chain = this.chains.get(a.trackId);
        if (!clip || !chain) continue;
        const stepInClip = (step - a.startBar * STEPS_PER_BAR) % clip.lengthSteps;
        for (const n of clip.notes) {
          if (n.step === stepInClip) {
            chain.voice.trigger(n.note, this.stepSeconds(n.duration ?? 1), n.velocity, time);
          }
        }
      }
    }, '16n');
  }

  private buildVoice(track: Track): InstrumentVoice {
    switch (track.instrument) {
      case 'drumkit':
        return new DrumKit();
      case 'bass':
        return new MonoVoice();
      default:
        return new PolyVoice();
    }
  }

  private buildChain(track: Track): TrackChain {
    if (!this.master) throw new Error('engine not started');
    const voice = this.buildVoice(track);
    const filter = new Tone.Filter(track.fx.filterFreq, 'lowpass');
    filter.Q.value = resoToQ(track.fx.filterReso);
    const channel = new Tone.Channel({ volume: volumeToDb(track.volume), pan: track.pan });
    const meter = new Tone.Meter({ normalRange: true, smoothing: 0.8 });

    const reverb = new Tone.Reverb({ decay: decaySeconds(track.fx.reverbDecay), wet: 1 });
    // Generate IR asynchronously; send stays silent until ready (no click/glitch).
    void reverb.generate();
    const delay = new Tone.FeedbackDelay(delaySeconds(track.fx.delayTime), clamp01(track.fx.delayFeedback) * 0.95);
    delay.wet.value = 1;
    const reverbSend = new Tone.Gain(track.fx.reverb);
    const delaySend = new Tone.Gain(track.fx.delay);

    // instrument -> filter -> channel -> meter tap + master
    voice.output.connect(filter);
    filter.connect(channel);
    channel.connect(meter);
    channel.connect(this.master);
    // sends: filter -> sendGain -> fx -> master
    filter.connect(reverbSend);
    reverbSend.connect(reverb);
    reverb.connect(this.master);
    filter.connect(delaySend);
    delaySend.connect(delay);
    delay.connect(this.master);

    return { voice, filter, reverbSend, delaySend, reverb, delay, channel, meter };
  }

  /** Map store loop region onto Tone.Transport (bars → bars:beats:sixteenths). */
  private applyLoop(state: ProjectState): void {
    const transport = Tone.getTransport();
    // Loop only applies in arrangement; session clip Parts manage their own looping.
    if (!state.loop || state.view !== 'arrangement') {
      transport.loop = false;
      return;
    }
    const start = Math.max(0, state.loop.startBar);
    const end = start + Math.max(1, state.loop.lengthBars);
    transport.loop = true;
    transport.loopStart = `${start}:0:0`;
    transport.loopEnd = `${end}:0:0`;
  }

  private applyTrackParams(track: Track, chain: TrackChain, anySolo: boolean): void {
    const fx = track.fx;
    chain.channel.volume.value = volumeToDb(track.volume);
    chain.channel.pan.value = track.pan;
    // Ableton-style solo: if anything is soloed, all non-soloed tracks are muted.
    const effectiveMute = track.muted || (anySolo && !track.soloed);
    chain.channel.mute = effectiveMute;
    chain.filter.frequency.value = fx.filterOn ? fx.filterFreq : FILTER_OPEN_HZ;
    chain.filter.Q.value = resoToQ(fx.filterReso);
    // The sends tap the chain BEFORE the channel (pre-fader), so muting the
    // channel alone would still leak reverb/delay from a muted track. Gate
    // the send gains with the same effective-mute flag (and device power).
    chain.reverbSend.gain.value = effectiveMute || !fx.reverbOn ? 0 : fx.reverb;
    chain.delaySend.gain.value = effectiveMute || !fx.delayOn ? 0 : fx.delay;
    // Reverb.decay regenerates the impulse response on assignment — only
    // touch it when the value actually changed (volume drags would
    // otherwise trigger an IR regen storm).
    const decay = decaySeconds(fx.reverbDecay);
    if (chain.reverb.decay !== decay) chain.reverb.decay = decay;
    chain.delay.delayTime.value = delaySeconds(fx.delayTime);
    // Feedback capped below self-oscillation even at macro = 1.
    chain.delay.feedback.value = clamp01(fx.delayFeedback) * 0.95;
  }

  private disposeChain(chain: TrackChain): void {
    chain.voice.dispose();
    for (const n of [chain.filter, chain.reverbSend, chain.delaySend, chain.reverb, chain.delay, chain.channel, chain.meter]) {
      n.dispose();
    }
  }

  /** Create/update/remove chains so they match the store's track list. */
  private syncTracks(state: ProjectState): void {
    const anySolo = state.tracks.some((t) => t.soloed);
    const alive = new Set(state.tracks.map((t) => t.id));

    for (const [trackId, chain] of [...this.chains]) {
      if (!alive.has(trackId)) {
        this.stopPart(trackId);
        this.disposeChain(chain);
        this.chains.delete(trackId);
      }
    }

    for (const track of state.tracks) {
      let chain = this.chains.get(track.id);
      if (!chain) {
        chain = this.buildChain(track);
        this.chains.set(track.id, chain);
      }
      this.applyTrackParams(track, chain, anySolo);
    }
  }

  private stopPart(trackId: string): void {
    const entry = this.playing.get(trackId);
    if (!entry) return;
    if (entry.scheduleId !== null) Tone.getTransport().clear(entry.scheduleId);
    entry.part.stop();
    entry.part.dispose();
    this.playing.delete(trackId);
  }

  private stopAllParts(): void {
    for (const trackId of [...this.playing.keys()]) this.stopPart(trackId);
  }

  /**
   * Schedule a clip to start looping.
   * - `'@1m'` (default): Ableton-style bar-quantized launch.
   * - `'@16n'`: near-immediate start at the next 16th, phase-aligned to the
   *   transport — used when a PLAYING clip's notes are edited, so the loop
   *   keeps running seamlessly instead of dropping out until the next bar.
   */
  private launchPart(trackId: string, clip: Clip, quantize: '@1m' | '@16n' = '@1m'): void {
    this.stopPart(trackId);
    const chain = this.chains.get(trackId);
    if (!chain) return;

    const six = this.sixteenthTicks();
    const events: ClipPartEvent[] = clip.notes.map((n) => ({ time: `${n.step * six}i`, ...n }));
    const part = new Tone.Part<ClipPartEvent>((time, n) => {
      chain.voice.trigger(n.note, this.stepSeconds(n.duration ?? 1), n.velocity, time);
    }, events);
    part.loop = true;
    part.loopEnd = `${clip.lengthSteps * six}i`;

    const entry: PlayingPart = { clipId: clip.id, part, scheduleId: null };
    const transport = Tone.getTransport();
    entry.scheduleId = transport.scheduleOnce((time) => {
      if (quantize === '@16n') {
        // Resume mid-pattern: offset the part by the transport's phase
        // within the clip loop so edits never restart the pattern.
        const loopTicks = Math.max(1, clip.lengthSteps * six);
        const offset = transport.getTicksAtTime(time) % loopTicks;
        part.start(time, `${offset}i`);
      } else {
        part.start(time);
      }
      if (this.playing.get(trackId) === entry) entry.scheduleId = null;
    }, quantize);
    this.playing.set(trackId, entry);
  }

  /** Launch everything in playingClipByTrack (used on play / view switch). */
  private launchAllPlaying(state: ProjectState): void {
    for (const [trackId, clipId] of Object.entries(state.playingClipByTrack)) {
      if (!clipId) continue;
      const clip = state.clips[clipId];
      if (clip) this.launchPart(trackId, clip);
    }
  }

  /** React to playingClipByTrack changes (launch / replace / stop per track). */
  private syncPlayingClips(state: ProjectState): void {
    const trackIds = new Set([...Object.keys(state.playingClipByTrack), ...this.playing.keys()]);
    for (const trackId of trackIds) {
      const want = state.playingClipByTrack[trackId] ?? null;
      const cur = this.playing.get(trackId) ?? null;
      if (want && cur?.clipId !== want) {
        const clip = state.clips[want];
        if (clip) this.launchPart(trackId, clip);
      } else if (!want && cur) {
        this.stopPart(trackId);
      }
    }
  }

  private fullSync(): void {
    const state = useProjectStore.getState();
    const transport = Tone.getTransport();
    transport.bpm.value = state.bpm;
    transport.swing = state.swing;
    if (this.master) this.master.gain.value = state.masterVolume;
    this.applyLoop(state);
    this.syncTracks(state);
    if (state.isPlaying) {
      transport.start();
      if (state.view === 'session') this.launchAllPlaying(state);
    }
  }

  private subscribeToStore(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (!this.started) return;
      const transport = Tone.getTransport();

      if (state.bpm !== prev.bpm) transport.bpm.rampTo(state.bpm, 0.1);
      if (state.swing !== prev.swing) transport.swing = state.swing;
      if (state.masterVolume !== prev.masterVolume)
        this.master?.gain.rampTo(state.masterVolume, 0.05);
      if (state.tracks !== prev.tracks) this.syncTracks(state);
      if (state.loop !== prev.loop) this.applyLoop(state);

      if (state.view !== prev.view) {
        this.applyLoop(state);
        // Session parts only make sense in session view.
        if (state.view === 'arrangement') {
          this.stopAllParts();
        } else if (state.isPlaying) {
          this.launchAllPlaying(state);
        }
      }

      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) {
          transport.start();
          if (state.view === 'session') this.launchAllPlaying(state);
        } else {
          this.stopAllParts();
          transport.stop();
        }
      }

      if (
        state.view === 'session' &&
        state.isPlaying &&
        state.playingClipByTrack !== prev.playingClipByTrack
      ) {
        this.syncPlayingClips(state);
      }

      // Notes of a currently-playing clip were edited → rebuild its part.
      if (state.view === 'session' && state.isPlaying && state.clips !== prev.clips) {
        for (const [trackId, entry] of [...this.playing]) {
          const clip = state.clips[entry.clipId];
          const prevClip = prev.clips[entry.clipId];
          if (!clip) {
            this.stopPart(trackId);
          } else if (clip !== prevClip) {
            // Only rebuild when the PATTERN changed (rename/recolor keep the
            // same notes array — no need to touch audio for those).
            const patternChanged =
              !prevClip || clip.notes !== prevClip.notes || clip.lengthSteps !== prevClip.lengthSteps;
            if (patternChanged) {
              // If the part is still waiting on its bar-quantized launch,
              // keep that quantize; otherwise resume in phase at the next 16th.
              const stillPending = entry.scheduleId !== null;
              this.launchPart(trackId, clip, stillPending ? '@1m' : '@16n');
            } else {
              entry.clipId = clip.id; // no-op keep — nothing audible changed
            }
          }
        }
      }
    });
  }
}

/** Singleton engine instance. Import as: `import { engine } from '@/audio/engine'`. */
export const engine = new AudioEngine();

export type { InstrumentVoice, TrackChain };
