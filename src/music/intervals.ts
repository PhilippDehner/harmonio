import { Pitch, PitchName, diatonicIndex, fromDiatonicIndex, toMidi } from './pitch';

/** Ein abfragbares Intervall (eine Antwortmöglichkeit). */
export interface IntervalDef {
  id: string;
  /** Kurzform für Buttons, z. B. „k3“ */
  short: string;
  /** Ausgeschrieben, z. B. „kleine Terz“ */
  long: string;
  semitones: number;
  /**
   * Mögliche Schreibweisen als diatonischer Abstand (Stammtonstufen).
   * Beim Tritonus: übermäßige Quarte (3) und verminderte Quinte (4).
   */
  steps: number[];
  /** Tastenkürzel, z. B. "3k" */
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
  def('k2', 'k2', 'kleine Sekunde', 1, [1], '2k'),
  def('g2', 'g2', 'große Sekunde', 2, [1], '2g'),
  def('k3', 'k3', 'kleine Terz', 3, [2], '3k'),
  def('g3', 'g3', 'große Terz', 4, [2], '3g'),
  def('r4', 'r4', 'reine Quarte', 5, [3], '4'),
  def('tt', 'Tritonus', 'Tritonus', 6, [3, 4], 't'),
  def('r5', 'r5', 'reine Quinte', 7, [4], '5'),
  def('k6', 'k6', 'kleine Sexte', 8, [5], '6k'),
  def('g6', 'g6', 'große Sexte', 9, [5], '6g'),
  def('k7', 'k7', 'kleine Septime', 10, [6], '7k'),
  def('g7', 'g7', 'große Septime', 11, [6], '7g'),
  def('r8', 'r8', 'reine Oktave', 12, [7], '8'),
  def('k9', 'k9', 'kleine None', 13, [8], '9k', true),
  def('g9', 'g9', 'große None', 14, [8], '9g', true),
  def('k10', 'k10', 'kleine Dezime', 15, [9], '10k', true),
  def('g10', 'g10', 'große Dezime', 16, [9], '10g', true),
  def('r11', 'r11', 'reine Undezime', 17, [10], '11', true),
  def('tt8', 'Trit.+8', 'Tritonus plus Oktave', 18, [10, 11], 'T', true),
  def('r12', 'r12', 'reine Duodezime', 19, [11], '12', true),
  def('k13', 'k13', 'kleine Tredezime', 20, [12], '13k', true),
  def('g13', 'g13', 'große Tredezime', 21, [12], '13g', true),
  def('k14', 'k14', 'kleine Quartdezime', 22, [13], '14k', true),
  def('g14', 'g14', 'große Quartdezime', 23, [13], '14g', true),
  def('r15', 'r15', 'Doppeloktave', 24, [14], '15', true),
];

export function intervalById(id: string): IntervalDef {
  const found = INTERVALS.find((i) => i.id === id);
  if (!found) throw new Error(`Unbekanntes Intervall: ${id}`);
  return found;
}

export function availableIntervals(extended: boolean): IntervalDef[] {
  return INTERVALS.filter((i) => extended || !i.extended);
}

/**
 * Transponiert einen Ton um einen diatonischen Abstand und eine Anzahl
 * Halbtöne, auf- oder abwärts, mit korrekter Schreibweise.
 */
export function transpose(p: Pitch, steps: number, semitones: number, up = true): Pitch {
  const sign = up ? 1 : -1;
  const target = fromDiatonicIndex(diatonicIndex(p) + sign * steps);
  const naturalMidi = toMidi(target);
  const wantedMidi = toMidi(p) + sign * semitones;
  return { ...target, alter: wantedMidi - naturalMidi };
}

/** Diatonischer Abstand und Halbtöne zwischen zwei Tönen (b − a). */
export function intervalBetween(a: Pitch, b: Pitch): { steps: number; semitones: number } {
  return {
    steps: diatonicIndex(b) - diatonicIndex(a),
    semitones: toMidi(b) - toMidi(a),
  };
}

/** Alle korrekten Schreibweisen des Zieltons (Tritonus: zwei). */
export function correctSecondNotes(start: Pitch, interval: IntervalDef, up: boolean): Pitch[] {
  return interval.steps.map((s) => transpose(start, s, interval.semitones, up));
}

/** Prüft, ob ein benannter Ton (ohne Oktave) eine richtige Lösung ist. */
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

/** Erkennt ein Intervall anhand einer Tastenfolge, z. B. "3k", "4", "t". */
export function intervalFromShortcut(buffer: string, extended: boolean): IntervalDef | undefined {
  return availableIntervals(extended).find((i) => i.shortcut === buffer);
}

/** Ist der Tastenpuffer Anfang eines gültigen Kürzels? */
export function isShortcutPrefix(buffer: string, extended: boolean): boolean {
  return availableIntervals(extended).some(
    (i) => i.shortcut.startsWith(buffer) && i.shortcut !== buffer,
  );
}
