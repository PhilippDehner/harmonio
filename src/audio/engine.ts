import * as Tone from 'tone';
import { midiToToneName } from '../music/pitch';

/** Vorhandene Salamander-Samples (alle kleinen Terzen), Rest wird interpoliert. */
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

/** Muss in einem Klick-/Tasten-Handler aufgerufen werden. */
export async function unlockAudio(): Promise<void> {
  if (!isAudioRunning()) await Tone.start();
  createInstruments();
  notifyState();
}

export async function ready(): Promise<void> {
  createInstruments();
  await loadPromise;
}

/* ---------- Zustand für die Oberfläche ---------- */

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

/* ---------- Wiedergabe ---------- */

export interface SoundEvent {
  /** Sekunden ab Beginn */
  time: number;
  midi: number[];
  /** Klingdauer in Sekunden; ohne Angabe klingt der Ton wie eine gehaltene Taste aus */
  duration?: number;
}

export interface ClickEvent {
  time: number;
  accent: boolean;
}

/** Bricht alle Klänge und geplanten Ereignisse ab. */
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
  /** Startposition in Sekunden (Ereignisse davor werden übersprungen) */
  from?: number;
  onEnd?: () => void;
}

let endCallback: (() => void) | undefined;

/** Spielt eine Folge von Klängen ab; vorherige Wiedergabe wird abgebrochen. */
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
    const names = s.midi.map(midiToToneName);
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

/** Aktuelle Wiedergabeposition (Sekunden seit Start der Wiedergabe). */
export function transportSeconds(): number {
  return Tone.getTransport().seconds;
}
