import { freqToMidi, VoiceType } from '../audio/pitchDetect';
import { ChordType, Inversion } from './chords';
import { Pitch, germanName, mod, toMidi } from './pitch';
import { ChordTask, Rng, makeChordTask, pick } from './tasks';

/** Pitch giving: major and minor chords in any inversion. */
export function makePitchGivingTask(rng: Rng = Math.random): ChordTask {
  const type = pick<ChordType>(['major', 'minor'], rng);
  const inversion = pick<Inversion>(['root', 'first', 'second'], rng);
  return makeChordTask(type, inversion, rng);
}

/** Singing order: bottom to top (indices into `voicing.notes`). */
export const SING_ORDER = [3, 2, 1, 0] as const;

/** Voice part names in German (UI), indexed like `voicing.notes`. */
export const VOICE_NAMES = ['Sopran', 'Alt', 'Tenor', 'Bass'] as const;

export const VOICE_LABEL: Record<VoiceType, string> = { male: 'Männerstimme', female: 'Frauenstimme' };

/**
 * Expected pitch for the singer's own voice type: men sing soprano and alto
 * an octave lower, women sing tenor and bass an octave higher.
 */
export function expectedMidi(p: Pitch, voiceIndex: number, voice: VoiceType): number {
  const m = toMidi(p);
  if (voice === 'male' && voiceIndex <= 1) return m - 12;
  if (voice === 'female' && voiceIndex >= 2) return m + 12;
  return m;
}

export interface SungResult {
  freq: number;
  /** Deviation from the target in cents (octave-independent, −600 … +600) */
  cents: number;
  /** Sung octave relative to the expected one (e.g. −1 = one octave lower) */
  octaveShift: number;
  correct: boolean;
}

/** Tolerance in cents within which a note counts as correct (= nearest semitone). */
export const TOLERANCE_CENTS = 50;

/** Evaluates a sung note; the octave does not count as an error. */
export function evaluateSung(freq: number, expected: number): SungResult {
  const diff = freqToMidi(freq) - expected;
  const octaveShift = Math.round(diff / 12);
  const cents = Math.round((diff - 12 * octaveShift) * 100);
  return { freq, cents, octaveShift, correct: Math.abs(cents) <= TOLERANCE_CENTS };
}

const NAMES: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

/** German name of the nearest key, e.g. "Fis", "B", "Es". */
export function nearestNoteName(midi: number): string {
  const [step, alter] = NAMES[mod(Math.round(midi), 12)];
  return germanName({ step, alter });
}

/** Signed cents for live display, e.g. "+12 Cent". */
export function formatCents(cents: number): string {
  if (cents === 0) return '±0 Cent';
  return `${cents > 0 ? '+' : '−'}${Math.abs(cents)} Cent`;
}

/** Intonation of a correct note in words, e.g. "12 Cent zu hoch". */
export function describeIntonation(cents: number): string {
  if (cents === 0) return 'genau getroffen';
  return `${Math.abs(cents)} Cent zu ${cents > 0 ? 'hoch' : 'tief'}`;
}
