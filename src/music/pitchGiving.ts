import { freqToMidi, VoiceType } from '../audio/pitchDetect';
import { ChordType, Inversion, Voicing, allVoicings, chordTones } from './chords';
import { Pitch, PitchName, germanName, keyTonic, mod, spellForKey, toMidi } from './pitch';
import { ChordTask, Rng, pick } from './tasks';

/** Which chords the pitch-giving exercise uses. */
export interface PitchGivingOptions {
  /** Keys with up to 3 accidentals */
  fewAccidentals: boolean;
  /** Keys with 4–7 accidentals */
  manyAccidentals: boolean;
  major: boolean;
  minor: boolean;
  /** Also wide positions and notes far from a' (otherwise close positions in a middle range) */
  wide: boolean;
}

export const DEFAULT_PITCH_GIVING_OPTIONS: PitchGivingOptions = {
  fewAccidentals: true,
  manyAccidentals: false,
  major: true,
  minor: false,
  wide: false,
};

/** Accidentals that count as "few". */
export const FEW_ACCIDENTALS = 3;

/**
 * Middle ranges for the close setting (MIDI), close to the a the singer hears:
 * soprano d'–e'', alto g–a', tenor c–e', bass F–a.
 */
const MIDDLE_RANGES: [number, number][] = [
  [62, 76],
  [55, 69],
  [48, 64],
  [41, 57],
];

/**
 * Circle-of-fifths position of the key whose tonic is `tonic`
 * (major for major chords, minor for minor chords), or null if the key
 * would need more than 7 accidentals (e.g. Dis-Dur).
 */
export function keyFifthsOf(tonic: PitchName, minor: boolean): number | null {
  for (let f = -7; f <= 7; f++) {
    const t = keyTonic(f, minor);
    if (t.step === tonic.step && t.alter === tonic.alter) return f;
  }
  return null;
}

/** Close position: upper three voices within an octave and in a middle range (bass may be further away). */
export function isCloseVoicing(v: Voicing): boolean {
  const m = v.notes.map(toMidi);
  if (m[0] - m[2] > 12) return false;
  return m.every((x, i) => x >= MIDDLE_RANGES[i][0] && x <= MIDDLE_RANGES[i][1]);
}

const ROOTS: Pitch[] = [];
for (let step = 0; step < 7; step++) for (const alter of [-1, 0, 1]) ROOTS.push({ step, alter, octave: 3 });

const INVERSIONS: Inversion[] = ['root', 'first', 'second'];

/** Chord roots and types allowed by the options. */
export function pitchGivingChords(o: PitchGivingOptions): { root: Pitch; type: ChordType }[] {
  const types: ChordType[] = [...(o.major ? ['major' as const] : []), ...(o.minor ? ['minor' as const] : [])];
  const out: { root: Pitch; type: ChordType }[] = [];
  for (const type of types) {
    for (const root of ROOTS) {
      const f = keyFifthsOf(root, type === 'minor');
      if (f === null) continue;
      const few = Math.abs(f) <= FEW_ACCIDENTALS;
      if (few ? o.fewAccidentals : o.manyAccidentals) out.push({ root, type });
    }
  }
  return out;
}

/** Pitch giving: major and/or minor chords in any inversion, according to the options. */
export function makePitchGivingTask(
  options: PitchGivingOptions = DEFAULT_PITCH_GIVING_OPTIONS,
  rng: Rng = Math.random,
): ChordTask {
  let chords = pitchGivingChords(options);
  // Nothing selected (should not happen in the UI): fall back to the defaults
  if (chords.length === 0) chords = pitchGivingChords(DEFAULT_PITCH_GIVING_OPTIONS);
  for (let attempt = 0; attempt < 100; attempt++) {
    const { root, type } = pick(chords, rng);
    const inversion = pick(INVERSIONS, rng);
    let voicings = allVoicings(root, type, inversion);
    if (!options.wide) voicings = voicings.filter(isCloseVoicing);
    if (voicings.length > 0) return { type, inversion, root, voicing: pick(voicings, rng) };
  }
  throw new Error('No chord found');
}

/** Order in which the four notes are sung. */
export type SingOrder = 'up' | 'down' | 'function';

export const SING_ORDERS: { id: SingOrder; label: string; text: string }[] = [
  { id: 'up', label: 'von unten', text: 'von unten nach oben (Bass, Tenor, Alt, Sopran)' },
  { id: 'down', label: 'von oben', text: 'von oben nach unten (Sopran, Alt, Tenor, Bass)' },
  { id: 'function', label: 'Grundton, Quinte, Terz', text: 'nach Funktion: Grundton, Quinte, Terz' },
];

/** Chord function of a note: 0 = root, 1 = third, 2 = fifth. */
function chordFunction(p: Pitch, root: Pitch, type: ChordType): number {
  return chordTones(root, type).findIndex((t) => t.step === p.step && t.alter === p.alter);
}

export const FUNCTION_NAMES = ['Grundton', 'Terz', 'Quinte'] as const;

/** German name of a note's chord function, e.g. "Grundton". */
export function functionName(p: Pitch, root: Pitch, type: ChordType): string {
  return FUNCTION_NAMES[chordFunction(p, root, type)];
}

/**
 * Indices into `voicing.notes` in singing order. By function, both root
 * voices come first (lower before higher), then fifth, then third.
 */
export function singOrder(voicing: Voicing, root: Pitch, type: ChordType, order: SingOrder): number[] {
  if (order === 'up') return [3, 2, 1, 0];
  if (order === 'down') return [0, 1, 2, 3];
  const rank = (i: number) => [0, 2, 1][chordFunction(voicing.notes[i], root, type)];
  // Array.prototype.sort is stable: equal functions stay bottom to top
  return [3, 2, 1, 0].sort((a, b) => rank(a) - rank(b));
}

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
  /** Right note name (within tolerance), regardless of octave */
  correct: boolean;
  /** Right note in the expected octave */
  octaveOk: boolean;
}

/** Overall rating of a sung note: wrong octave is a minor error. */
export type SungStatus = 'ok' | 'octave' | 'wrong';

export function sungStatus(r: SungResult): SungStatus {
  return !r.correct ? 'wrong' : r.octaveOk ? 'ok' : 'octave';
}

/** Tolerance in cents within which a note counts as correct (= nearest semitone). */
export const TOLERANCE_CENTS = 50;

/** Evaluates a sung note; a wrong octave is reported separately (`octaveOk`). */
export function evaluateSung(freq: number, expected: number): SungResult {
  const diff = freqToMidi(freq) - expected;
  const octaveShift = Math.round(diff / 12);
  const cents = Math.round((diff - 12 * octaveShift) * 100);
  const correct = Math.abs(cents) <= TOLERANCE_CENTS;
  return { freq, cents, octaveShift, correct, octaveOk: correct && octaveShift === 0 };
}

const NAMES: [number, number][] = [
  [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

/**
 * The sung note mapped to the written octave of its voice: correct notes
 * give the written pitch, wrong notes the sung semitone next to it.
 * Spelled with flats if the chord root has a flat, otherwise with sharps.
 */
export function sungPitch(target: Pitch, r: SungResult, root: Pitch): Pitch {
  if (r.correct) return target;
  return spellForKey(toMidi(target) + Math.round(r.cents / 100), root.alter < 0 ? -1 : 1);
}

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
