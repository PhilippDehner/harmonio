import { transpose as transposePitch } from '../music/intervals';
import { SNote, Song } from './model';
import { fifthsOfKey, keyFromFifths, Key } from './theory';

export interface TransposeInterval {
  id: string;
  label: string;
  steps: number;
  semitones: number;
}

/** Intervals offered for transposition (up or down). */
export const TRANSPOSE_INTERVALS: TransposeInterval[] = [
  { id: 'A1', label: 'übermäßige Prime', steps: 0, semitones: 1 },
  { id: 'm2', label: 'kleine Sekunde', steps: 1, semitones: 1 },
  { id: 'M2', label: 'große Sekunde', steps: 1, semitones: 2 },
  { id: 'm3', label: 'kleine Terz', steps: 2, semitones: 3 },
  { id: 'M3', label: 'große Terz', steps: 2, semitones: 4 },
  { id: 'P4', label: 'reine Quarte', steps: 3, semitones: 5 },
  { id: 'A4', label: 'übermäßige Quarte', steps: 3, semitones: 6 },
  { id: 'd5', label: 'verminderte Quinte', steps: 4, semitones: 6 },
  { id: 'P5', label: 'reine Quinte', steps: 4, semitones: 7 },
  { id: 'm6', label: 'kleine Sexte', steps: 5, semitones: 8 },
  { id: 'M6', label: 'große Sexte', steps: 5, semitones: 9 },
  { id: 'm7', label: 'kleine Septime', steps: 6, semitones: 10 },
  { id: 'M7', label: 'große Septime', steps: 6, semitones: 11 },
  { id: 'P8', label: 'Oktave', steps: 7, semitones: 12 },
];

export interface Transposition {
  interval: string;
  up: boolean;
}

export function intervalOf(t: Transposition): TransposeInterval | undefined {
  return TRANSPOSE_INTERVALS.find((i) => i.id === t.interval);
}

export function transpositionLabel(t: Transposition | null): string {
  if (!t) return 'Originaltonart';
  const i = intervalOf(t);
  return i ? `${i.label} ${t.up ? 'aufwärts' : 'abwärts'}` : 'Originaltonart';
}

export function transposeNotes(notes: SNote[], t: Transposition | null, inverse = false): SNote[] {
  const i = t ? intervalOf(t) : undefined;
  if (!t || !i) return notes;
  const up = inverse ? !t.up : t.up;
  return notes.map((n) => (n.rest ? n : { ...n, pitch: transposePitch(n.pitch, i.steps, i.semitones, up) }));
}

export function transposeVoices(voices: SNote[][], t: Transposition | null, inverse = false): SNote[][] {
  return voices.map((v) => transposeNotes(v, t, inverse));
}

/** Key signature after transposing, or null if it would need more than 7 accidentals. */
export function transposedFifths(keyFifths: number, t: Transposition | null): number | null {
  const i = t ? intervalOf(t) : undefined;
  if (!t || !i) return keyFifths;
  const key = keyFromFifths(keyFifths);
  const tonic = transposePitch({ ...key.tonic, octave: 4 }, i.steps, i.semitones, t.up);
  const next: Key = { tonic: { step: tonic.step, alter: tonic.alter }, minor: false };
  return fifthsOfKey(next);
}

/** The song in the chosen key (melody and example solution). */
export function transposeSong(song: Song, t: Transposition | null): Song {
  const fifths = transposedFifths(song.keyFifths, t);
  if (fifths === null || !t) return song;
  return {
    ...song,
    keyFifths: fifths,
    melody: transposeNotes(song.melody, t),
    solution: song.solution ? transposeVoices(song.solution, t) : null,
  };
}
