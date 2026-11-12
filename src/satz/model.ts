import { Pitch } from '../music/pitch';
import { DNote, Duration, Measure, durationTicks, newId } from '../dictation/model';

/** Voices of the four-part setting, top to bottom. */
export const VOICES = ['soprano', 'alto', 'tenor', 'bass'] as const;
export type VoiceIndex = 0 | 1 | 2 | 3;
export const SOPRANO = 0;
export const ALTO = 1;
export const TENOR = 2;
export const BASS = 3;

export const VOICE_LABELS = ['Sopran', 'Alt', 'Tenor', 'Bass'] as const;
export const VOICE_SHORT = ['S', 'A', 'T', 'B'] as const;

/** Note of a four-part setting: a rest has `rest: true` (its pitch is ignored). */
export interface SNote extends DNote {
  rest?: boolean;
  /** Tied to the next note of the same voice (same pitch) */
  tie?: boolean;
  fermata?: boolean;
  /** Lyric syllable (melody only, first verse) */
  lyric?: string;
}

export type SatzMode = 'choir' | 'organ';
export const MODE_LABELS: Record<SatzMode, string> = { choir: 'Chorsatz', organ: 'Orgelsatz' };

/** A song (task): melody and optionally a complete setting as example solution. */
export interface Song {
  id: string;
  title: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  /** Quarter notes per minute, null if the file has no tempo */
  tempo: number | null;
  measures: Measure[];
  melody: SNote[];
  /** Complete setting [S, A, T, B] if the file contains one */
  solution: SNote[][] | null;
  uploaded?: boolean;
}

/** Default playback tempo if the file has none. */
export const DEFAULT_SATZ_TEMPO = 72;

export function noteEndS(n: SNote): number {
  return n.start + durationTicks(n.dur);
}

export function sortByStart<T extends { start: number }>(notes: T[]): T[] {
  return [...notes].sort((a, b) => a.start - b.start);
}

/** Note of a voice sounding at a tick (rests included), or undefined. */
export function noteAt(voice: SNote[], tick: number): SNote | undefined {
  return voice.find((n) => n.start <= tick && tick < noteEndS(n));
}

/** All onsets of all voices, sorted. */
export function onsets(voices: SNote[][]): number[] {
  return Array.from(new Set(voices.flatMap((v) => v.map((n) => n.start)))).sort((a, b) => a - b);
}

export function emptySetting(song: Song): SNote[][] {
  return [song.melody.map((n) => ({ ...n, given: true })), [], [], []];
}

export function cloneNote(n: SNote, patch: Partial<SNote> = {}): SNote {
  return { ...n, pitch: { ...n.pitch }, dur: { ...n.dur }, ...patch };
}

export function makeNote(start: number, dur: Duration, pitch: Pitch, patch: Partial<SNote> = {}): SNote {
  return { id: newId('s'), start, dur, pitch, ...patch };
}

/** Placeholder pitch for rests. */
export const REST_PITCH: Pitch = { step: 6, alter: 0, octave: 4 };
