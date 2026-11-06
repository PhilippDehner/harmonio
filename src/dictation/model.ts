import { Pitch } from '../music/pitch';

/** Ticks per quarter note. 24 is divisible by 2, 3 and 8 (eighths, triplets, dots). */
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
  /** Unique ID (for selection and error marking) */
  id: string;
  /** Start in ticks from the beginning of the piece (pickup starts at 0) */
  start: number;
  dur: Duration;
  pitch: Pitch;
  /** Given note, cannot be changed */
  given?: boolean;
}

export function noteEnd(n: DNote): number {
  return n.start + durationTicks(n.dur);
}

export type DictationKind = 'monophonic' | 'two-part' | 'four-part';

export const KIND_LABELS: Record<DictationKind, string> = {
  monophonic: 'Einstimmiges Diktat',
  'two-part': 'Zweistimmiges Diktat',
  'four-part': 'Vierstimmiger Satz',
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
  /** Quarter notes per minute */
  tempo: number;
  /** Measures (for four-part chorales: chords) */
  measures: Measure[];
  /** Voices from top to bottom */
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

/** Splits a gap into representable note values (for invisible placeholders). */
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

export interface RestSlot {
  /** Start in ticks from the beginning of the piece */
  start: number;
  dur: Duration;
  /** Whole-measure rest (centered) */
  wholeMeasure: boolean;
}

const REST_OPTIONS: Duration[] = [
  { base: 'w', dotted: false, triplet: false },
  { base: 'h', dotted: false, triplet: false },
  { base: 'q', dotted: false, triplet: false },
  { base: '8', dotted: false, triplet: false },
  { base: '8', dotted: false, triplet: true },
];

/**
 * Rests for the gaps in a measure. `notes` are the notes of one staff
 * (multiple voices allowed). An empty measure gets a whole-measure rest;
 * otherwise gaps are split into rest values aligned to the measure.
 */
export function restsInMeasure(notes: DNote[], m: Measure): RestSlot[] {
  const end = m.start + m.ticks;
  const inMeasure = sortNotes(notes.filter((n) => n.start >= m.start && n.start < end));
  if (inMeasure.length === 0) {
    return [{ start: m.start, dur: { base: 'w', dotted: false, triplet: false }, wholeMeasure: true }];
  }
  const gaps: [number, number][] = [];
  let pos = m.start;
  for (const n of inMeasure) {
    if (n.start > pos) gaps.push([pos, n.start]);
    pos = Math.max(pos, noteEnd(n));
  }
  if (pos < end) gaps.push([pos, end]);
  const out: RestSlot[] = [];
  for (const [from, to] of gaps) {
    let p = from;
    while (p < to) {
      const rem = to - p;
      const rel = p - m.start;
      const d =
        REST_OPTIONS.find((o) => durationTicks(o) <= rem && rel % durationTicks(o) === 0) ??
        REST_OPTIONS.find((o) => durationTicks(o) <= rem);
      if (!d) break;
      out.push({ start: p, dur: d, wholeMeasure: false });
      p += durationTicks(d);
    }
  }
  return out;
}
