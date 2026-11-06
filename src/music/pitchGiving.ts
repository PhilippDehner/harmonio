import { freqToMidi, VoiceType } from '../audio/pitchDetect';
import { ChordType, Inversion } from './chords';
import { Pitch, germanName, mod, toMidi } from './pitch';
import { ChordTask, Rng, makeChordTask, pick } from './tasks';

/** Tonangabe: Dur- und Moll-Akkorde mit beliebiger Umkehrung. */
export function makePitchGivingTask(rng: Rng = Math.random): ChordTask {
  const type = pick<ChordType>(['dur', 'moll'], rng);
  const inversion = pick<Inversion>(['grund', 'sext', 'quartsext'], rng);
  return makeChordTask(type, inversion, rng);
}

/** Reihenfolge beim Singen: von unten nach oben (Indizes in `voicing.notes`). */
export const SING_ORDER = [3, 2, 1, 0] as const;
export const VOICE_LABEL: Record<VoiceType, string> = { mann: 'Männerstimme', frau: 'Frauenstimme' };

export const VOICE_NAMES = ['Sopran', 'Alt', 'Tenor', 'Bass'] as const;

/**
 * Erwartete Tonhöhe für die eigene Stimmlage: Männer singen Sopran und Alt
 * eine Oktave tiefer, Frauen Tenor und Bass eine Oktave höher.
 */
export function expectedMidi(p: Pitch, voiceIndex: number, voice: VoiceType): number {
  const m = toMidi(p);
  if (voice === 'mann' && voiceIndex <= 1) return m - 12;
  if (voice === 'frau' && voiceIndex >= 2) return m + 12;
  return m;
}

export interface SungResult {
  freq: number;
  /** Abweichung vom Zielton in Cent (oktavunabhängig, −600 … +600) */
  cents: number;
  /** Gesungene Oktave relativ zur erwarteten (z. B. −1 = eine Oktave tiefer) */
  octaveShift: number;
  correct: boolean;
}

/** Toleranz in Cent, innerhalb derer ein Ton als richtig gilt. */
export const TOLERANCE_CENTS = 50;

/** Bewertet einen gesungenen Ton; die Oktave zählt nicht als Fehler. */
export function evaluateSung(freq: number, expected: number): SungResult {
  const diff = freqToMidi(freq) - expected;
  const octaveShift = Math.round(diff / 12);
  const cents = Math.round((diff - 12 * octaveShift) * 100);
  return { freq, cents, octaveShift, correct: Math.abs(cents) <= TOLERANCE_CENTS };
}

const NAMES: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

/** Deutscher Name der nächstgelegenen Taste, z. B. „Fis“, „B“, „Es“. */
export function nearestNoteName(midi: number): string {
  const [step, alter] = NAMES[mod(Math.round(midi), 12)];
  return germanName({ step, alter });
}

export function formatCents(cents: number): string {
  if (cents === 0) return '±0 Cent';
  return `${cents > 0 ? '+' : '−'}${Math.abs(cents)} Cent`;
}
