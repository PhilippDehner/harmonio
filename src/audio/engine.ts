import * as Tone from 'tone';
import { midiToFreq } from './pitchDetect';

/** Available Salamander samples (every minor third); the rest is interpolated. */
const SAMPLE_NOTES: string[] = (() => {
  const names: string[] = [];
  for (let o = 1; o <= 6; o++) for (const n of ['C', 'Ds', 'Fs', 'A']) names.push(`${n}${o}`);
  names.push('C7');
  return names;
})();

let sampler: Tone.Sampler | null = null;
let click: Tone.Synth | null = null;
let loadPromise: Promise<void> | null = null;

function createInstruments() {
  if (sampler) return;
  const urls: Record<string, string> = {};
  for (const n of SAMPLE_NOTES) urls[n.replace('s', '#')] = `${n}.mp3`;
  sampler = new Tone.Sampler({
    urls,
    baseUrl: `${import.meta.env.BASE_URL}samples/salamander/`,
    release: 0.6,
  }).toDestination();
  click = new Tone.Synth({
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume: -12,
  }).toDestination();
  loadPromise = Tone.loaded();
}

export function isAudioRunning(): boolean {
  return Tone.getContext().state === 'running';
}

/** Must be called from a click/key handler. */
export async function unlockAudio(): Promise<void> {
  if (!isAudioRunning()) await Tone.start();
  createInstruments();
  notifyState();
}

export async function ready(): Promise<void> {
  createInstruments();
  await loadPromise;
}

/* ---------- State for the UI ---------- */

type Listener = () => void;
const listeners = new Set<Listener>();
let playing = false;

function notifyState() {
  listeners.forEach((l) => l());
}

export function onAudioState(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isPlaying(): boolean {
  return playing;
}

/* ---------- Playback ---------- */

export interface SoundEvent {
  /** Seconds from start */
  time: number;
  midi: number[];
  /** Sounding duration in seconds; if omitted the note rings like a held key */
  duration?: number;
}

export interface ClickEvent {
  time: number;
  accent: boolean;
}

/** Stops all sounds and scheduled events. */
export function stopAll() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  sampler?.releaseAll(Tone.now());
  if (playing) {
    playing = false;
    notifyState();
  }
}

export interface PlayOptions {
  sounds: SoundEvent[];
  clicks?: ClickEvent[];
  /** Start position in seconds (earlier events are skipped) */
  from?: number;
  onEnd?: () => void;
}

let endCallback: (() => void) | undefined;

/** Plays a sequence of sounds; any previous playback is stopped. */
export async function play(opts: PlayOptions): Promise<void> {
  stopAll();
  await unlockAudio();
  await ready();
  const transport = Tone.getTransport();
  const from = opts.from ?? 0;
  let end = 0;
  for (const s of opts.sounds) {
    if (s.time < from - 1e-6) continue;
    const at = s.time - from;
    // Frequencies in Hz, so the configured concert pitch is applied
    const names = s.midi.map((m) => midiToFreq(m));
    transport.schedule((time) => {
      if (s.duration !== undefined) sampler!.triggerAttackRelease(names, s.duration, time, 0.8);
      else sampler!.triggerAttack(names, time, 0.8);
    }, at);
    end = Math.max(end, at + (s.duration ?? 1.5));
  }
  for (const c of opts.clicks ?? []) {
    if (c.time < from - 1e-6) continue;
    const at = c.time - from;
    transport.schedule((time) => {
      click!.triggerAttackRelease(c.accent ? 'C7' : 'G6', 0.03, time, c.accent ? 1 : 0.6);
    }, at);
    end = Math.max(end, at + 0.1);
  }
  endCallback = opts.onEnd;
  transport.schedule(() => {
    Tone.getDraw().schedule(() => {
      playing = false;
      notifyState();
      const cb = endCallback;
      endCallback = undefined;
      cb?.();
    }, Tone.now());
  }, end);
  playing = true;
  notifyState();
  transport.start('+0.05');
}

/** Current playback position (seconds since playback started). */
export function transportSeconds(): number {
  return Tone.getTransport().seconds;
}

/** Plays a single key immediately (e.g. from the on-screen keyboard), independent of the transport. */
export async function playKey(midi: number, duration = 1.5): Promise<void> {
  await unlockAudio();
  await ready();
  sampler!.triggerAttackRelease(midiToFreq(midi), duration, Tone.now(), 0.8);
}
