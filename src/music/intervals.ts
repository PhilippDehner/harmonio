import { Pitch, PitchName, diatonicIndex, fromDiatonicIndex, toMidi } from './pitch';

/** An interval that can be asked for (one answer option). */
export interface IntervalDef {
  id: string;
  /** Short label for buttons (German), e.g. "k3" */
  short: string;
  /** Full name (German), e.g. "kleine Terz" */
  long: string;
  semitones: number;
  /**
   * Possible spellings as diatonic distance (staff steps).
   * Tritone: augmented fourth (3) and diminished fifth (4).
   */
  steps: number[];
  /** Keyboard shortcut, e.g. "3k" */
  shortcut: string;
  extended: boolean;
}

function def(
  id: string,
  short: string,
  long: string,
  semitones: number,
  steps: number[],
  shortcut: string,
  extended = false,
): IntervalDef {
  return { id, short, long, semitones, steps, shortcut, extended };
}

export const INTERVALS: IntervalDef[] = [
  def('m2', 'k2', 'kleine Sekunde', 1, [1], '2k'),
  def('M2', 'g2', 'große Sekunde', 2, [1], '2g'),
  def('m3', 'k3', 'kleine Terz', 3, [2], '3k'),
  def('M3', 'g3', 'große Terz', 4, [2], '3g'),
  def('P4', 'r4', 'reine Quarte', 5, [3], '4'),
  def('TT', 'Tritonus', 'Tritonus', 6, [3, 4], 't'),
  def('P5', 'r5', 'reine Quinte', 7, [4], '5'),
  def('m6', 'k6', 'kleine Sexte', 8, [5], '6k'),
  def('M6', 'g6', 'große Sexte', 9, [5], '6g'),
  def('m7', 'k7', 'kleine Septime', 10, [6], '7k'),
  def('M7', 'g7', 'große Septime', 11, [6], '7g'),
  def('P8', 'r8', 'reine Oktave', 12, [7], '8'),
  def('m9', 'k9', 'kleine None', 13, [8], '9k', true),
  def('M9', 'g9', 'große None', 14, [8], '9g', true),
  def('m10', 'k10', 'kleine Dezime', 15, [9], '10k', true),
  def('M10', 'g10', 'große Dezime', 16, [9], '10g', true),
  def('P11', 'r11', 'reine Undezime', 17, [10], '11', true),
  def('TT8', 'Trit.+8', 'Tritonus plus Oktave', 18, [10, 11], 'T', true),
  def('P12', 'r12', 'reine Duodezime', 19, [11], '12', true),
  def('m13', 'k13', 'kleine Tredezime', 20, [12], '13k', true),
  def('M13', 'g13', 'große Tredezime', 21, [12], '13g', true),
  def('m14', 'k14', 'kleine Quartdezime', 22, [13], '14k', true),
  def('M14', 'g14', 'große Quartdezime', 23, [13], '14g', true),
  def('P15', 'r15', 'Doppeloktave', 24, [14], '15', true),
];

export function intervalById(id: string): IntervalDef {
  const found = INTERVALS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown interval: ${id}`);
  return found;
}

export function availableIntervals(extended: boolean): IntervalDef[] {
  return INTERVALS.filter((i) => extended || !i.extended);
}

/**
 * Transposes a pitch by a diatonic distance and a number of semitones,
 * up or down, with correct spelling.
 */
export function transpose(p: Pitch, steps: number, semitones: number, up = true): Pitch {
  const sign = up ? 1 : -1;
  const target = fromDiatonicIndex(diatonicIndex(p) + sign * steps);
  const naturalMidi = toMidi(target);
  const wantedMidi = toMidi(p) + sign * semitones;
  return { ...target, alter: wantedMidi - naturalMidi };
}

/** Diatonic distance and semitones between two pitches (b − a). */
export function intervalBetween(a: Pitch, b: Pitch): { steps: number; semitones: number } {
  return {
    steps: diatonicIndex(b) - diatonicIndex(a),
    semitones: toMidi(b) - toMidi(a),
  };
}

/** All correct spellings of the target pitch (tritone: two). */
export function correctSecondNotes(start: Pitch, interval: IntervalDef, up: boolean): Pitch[] {
  return interval.steps.map((s) => transpose(start, s, interval.semitones, up));
}

/** Checks whether a named pitch (without octave) is a correct answer. */
export function isCorrectNaming(
  answer: PitchName,
  start: Pitch,
  interval: IntervalDef,
  up: boolean,
): boolean {
  return correctSecondNotes(start, interval, up).some(
    (p) => p.step === answer.step && p.alter === answer.alter,
  );
}

/** Recognizes an interval from a key sequence, e.g. "3k", "4", "t". */
export function intervalFromShortcut(buffer: string, extended: boolean): IntervalDef | undefined {
  return availableIntervals(extended).find((i) => i.shortcut === buffer);
}

/** Is the key buffer the beginning of a valid shortcut? */
export function isShortcutPrefix(buffer: string, extended: boolean): boolean {
  return availableIntervals(extended).some(
    (i) => i.shortcut.startsWith(buffer) && i.shortcut !== buffer,
  );
}
