import { Pitch } from '../music/pitch';

/** Ticks pro Viertel. 24 ist durch 2, 3 und 8 teilbar (Achtel, Triolen, Punktierungen). */
export const TICKS_PER_QUARTER = 24;

export type BaseValue = 'w' | 'h' | 'q' | '8';

export interface Duration {
  base: BaseValue;
  dotted: boolean;
  triplet: boolean;
}

const BASE_TICKS: Record<BaseValue, number> = {
  w: 96,
  h: 48,
  q: 24,
  '8': 12,
};

export const BASE_LABELS: Record<BaseValue, string> = {
  w: 'Ganze',
  h: 'Halbe',
  q: 'Viertel',
  '8': 'Achtel',
};

export function durationTicks(d: Duration): number {
  let t = BASE_TICKS[d.base];
  if (d.triplet) t = (t * 2) / 3;
  if (d.dotted) t = t * 1.5;
  return t;
}

export function durationLabel(d: Duration): string {
  let s = BASE_LABELS[d.base];
  if (d.dotted) s = 'punktierte ' + s;
  if (d.triplet) s += '-Triole';
  return s;
}

export interface DNote {
  /** Eindeutige ID (für Auswahl und Fehlermarkierung) */
  id: string;
  /** Beginn in Ticks ab Stückanfang (Auftakt beginnt bei 0) */
  start: number;
  dur: Duration;
  pitch: Pitch;
  /** Vorgegebene Note, nicht änderbar */
  given?: boolean;
}

export function noteEnd(n: DNote): number {
  return n.start + durationTicks(n.dur);
}

export type DictationKind = 'einstimmig' | 'zweistimmig' | 'vierstimmig';

export const KIND_LABELS: Record<DictationKind, string> = {
  einstimmig: 'Einstimmiges Diktat',
  zweistimmig: 'Zweistimmiges Diktat',
  vierstimmig: 'Vierstimmiger Satz',
};

export interface Measure {
  start: number;
  ticks: number;
}

export interface Dictation {
  id: string;
  kind: DictationKind;
  number: number;
  keyFifths: number;
  minor: boolean;
  beats: number;
  beatType: number;
  /** Viertel pro Minute */
  tempo: number;
  /** Takte (bzw. beim vierstimmigen Satz: Akkorde) */
  measures: Measure[];
  /** Stimmen von oben nach unten */
  voices: DNote[][];
}

export function measureTicks(beats: number, beatType: number): number {
  return (beats * TICKS_PER_QUARTER * 4) / beatType;
}

export function beatTicks(beatType: number): number {
  return (TICKS_PER_QUARTER * 4) / beatType;
}

export function totalTicks(d: { measures: Measure[] }): number {
  const last = d.measures[d.measures.length - 1];
  return last ? last.start + last.ticks : 0;
}

export function measureIndexAt(measures: Measure[], tick: number): number {
  for (let i = measures.length - 1; i >= 0; i--) {
    if (tick >= measures[i].start) return i;
  }
  return 0;
}

export function sortNotes(notes: DNote[]): DNote[] {
  return [...notes].sort((a, b) => a.start - b.start);
}

let idCounter = 0;
export function newId(prefix = 'n'): string {
  idCounter++;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Zerlegt eine Lücke in darstellbare Notenwerte (für unsichtbare Platzhalter). */
export function splitTicks(ticks: number): Duration[] {
  const options: Duration[] = [
    { base: 'w', dotted: true, triplet: false },
    { base: 'w', dotted: false, triplet: false },
    { base: 'h', dotted: true, triplet: false },
    { base: 'h', dotted: false, triplet: false },
    { base: 'q', dotted: true, triplet: false },
    { base: 'q', dotted: false, triplet: false },
    { base: '8', dotted: true, triplet: false },
    { base: '8', dotted: false, triplet: false },
    { base: '8', dotted: false, triplet: true },
  ];
  const out: Duration[] = [];
  let rest = ticks;
  while (rest > 0) {
    const d = options.find((o) => durationTicks(o) <= rest);
    if (!d) break;
    out.push(d);
    rest -= durationTicks(d);
  }
  return out;
}
