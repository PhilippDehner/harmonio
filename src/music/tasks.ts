import { IntervalDef, transpose } from './intervals';
import { Pitch, toMidi, simpleSpellings } from './pitch';
import { ChordType, Inversion, Voicing, allVoicings, chordTones } from './chords';

export type Rng = () => number;

export function pick<T>(items: readonly T[], rng: Rng = Math.random): T {
  return items[Math.floor(rng() * items.length)];
}

/** Gewichtete Zufallsauswahl. */
export function pickWeighted<T>(items: readonly T[], weights: number[], rng: Rng = Math.random): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(items, rng);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export interface AnswerCounts {
  correct: number;
  wrong: number;
}

/**
 * Gewicht für die adaptive Auswahl: Je höher die (geglättete) Fehlerquote,
 * desto häufiger kommt die Aufgabe dran. Unbekannte Aufgaben liegen in der Mitte.
 */
export function adaptiveWeight(c: AnswerCounts | undefined): number {
  const correct = c?.correct ?? 0;
  const wrong = c?.wrong ?? 0;
  const errorRate = (wrong + 1) / (correct + wrong + 2);
  return 0.25 + 3 * errorRate;
}

export function chooseAdaptive<T extends string>(
  ids: readonly T[],
  counts: Record<string, AnswerCounts | undefined>,
  adaptive: boolean,
  rng: Rng = Math.random,
): T {
  if (!adaptive) return pick(ids, rng);
  return pickWeighted(
    ids,
    ids.map((id) => adaptiveWeight(counts[id])),
    rng,
  );
}

/** Ausgangston mit höchstens einem Vorzeichen, zufällig geschrieben. */
export function randomSpelling(midi: number, rng: Rng = Math.random): Pitch {
  const options = simpleSpellings(midi);
  const natural = options.find((p) => p.alter === 0);
  if (natural) return natural; // weiße Tasten ohne Vorzeichen
  return pick(options, rng);
}

export type IntervalPlayMode = 'harmonisch' | 'aufwaerts' | 'abwaerts';

export interface IntervalTask {
  interval: IntervalDef;
  /** Tatsächlich gewählte Schreibweise (Index in interval.steps) */
  stepsUsed: number;
  start: Pitch;
  second: Pitch;
  up: boolean;
}

export function makeIntervalTask(
  interval: IntervalDef,
  mode: IntervalPlayMode,
  range: [number, number],
  rng: Rng = Math.random,
): IntervalTask {
  const up = mode !== 'abwaerts';
  const [lo, hi] = range;
  const startLo = up ? lo : lo + interval.semitones;
  const startHi = up ? hi - interval.semitones : hi;
  for (let attempt = 0; attempt < 100; attempt++) {
    let startMidi: number;
    if (startHi >= startLo) {
      startMidi = startLo + Math.floor(rng() * (startHi - startLo + 1));
    } else {
      // Intervall größer als der Tonumfang: um die Mitte legen
      const mid = Math.round((lo + hi) / 2);
      startMidi = up ? mid - Math.floor(interval.semitones / 2) : mid + Math.ceil(interval.semitones / 2);
    }
    const start = randomSpelling(startMidi, rng);
    const stepsUsed = pick(interval.steps, rng);
    const second = transpose(start, stepsUsed, interval.semitones, up);
    if (Math.abs(second.alter) <= 2) {
      return { interval, stepsUsed, start, second, up };
    }
  }
  throw new Error('Keine Aufgabe gefunden');
}

export interface ChordTask {
  type: ChordType;
  inversion: Inversion;
  root: Pitch;
  voicing: Voicing;
}

const ROOT_CANDIDATES: Pitch[] = (() => {
  const out: Pitch[] = [];
  for (let step = 0; step < 7; step++) {
    for (const alter of [-1, 0, 1]) out.push({ step, alter, octave: 3 });
  }
  return out;
})();

export function makeChordTask(type: ChordType, inversion: Inversion, rng: Rng = Math.random): ChordTask {
  const roots = ROOT_CANDIDATES.filter((r) =>
    chordTones(r, type).every((p) => Math.abs(p.alter) <= 2),
  );
  for (let attempt = 0; attempt < 50; attempt++) {
    const root = pick(roots, rng);
    const voicings = allVoicings(root, type, inversion);
    if (voicings.length > 0) {
      return { type, inversion, root, voicing: pick(voicings, rng) };
    }
  }
  throw new Error('Kein Akkord gefunden');
}

export function midiOf(p: Pitch): number {
  return toMidi(p);
}

/**
 * Lage einer falschen Akkordantwort zum Vergleich: gleicher Grundton,
 * gewählter Typ und gewählte Umkehrung, Lage möglichst nah an der Aufgabe.
 */
export function answerChordVoicing(task: ChordTask, type: ChordType, inversion: Inversion): Pitch[] {
  const target = task.voicing.notes.map(toMidi);
  let best: Pitch[] | null = null;
  let bestCost = Infinity;
  for (const v of allVoicings(task.root, type, inversion)) {
    const cost = v.notes.reduce((s, p, i) => s + Math.abs(toMidi(p) - target[i]), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = v.notes;
    }
  }
  return best ?? chordTones(task.root, type);
}

/** Klang einer falschen Akkordantwort (MIDI), siehe answerChordVoicing. */
export function answerChordMidi(task: ChordTask, type: ChordType, inversion: Inversion): number[] {
  return answerChordVoicing(task, type, inversion).map(toMidi);
}
