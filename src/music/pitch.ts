/**
 * Pitches with enharmonically correct spelling.
 * step: 0=C, 1=D, 2=E, 3=F, 4=G, 5=A, 6=B (German: H)
 * alter: -2 (double flat) … +2 (double sharp)
 * octave: scientific octave numbering (C4 = middle C)
 */
export interface Pitch {
  step: number;
  alter: number;
  octave: number;
}

/** Pitch class without octave (for note naming). */
export interface PitchName {
  step: number;
  alter: number;
}

/** German letters (for display). */
export const STEP_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H'] as const;
/** English letters (for MusicXML and VexFlow). */
export const STEP_LETTERS_EN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function toMidi(p: Pitch): number {
  return (p.octave + 1) * 12 + STEP_SEMITONES[p.step] + p.alter;
}

/** Diatonic index (staff steps from C0). */
export function diatonicIndex(p: { step: number; octave: number }): number {
  return p.octave * 7 + p.step;
}

export function fromDiatonicIndex(d: number, alter = 0): Pitch {
  return { step: mod(d, 7), octave: Math.floor(d / 7), alter };
}

export function samePitch(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.alter === b.alter && a.octave === b.octave;
}

export function sameName(a: PitchName, b: PitchName): boolean {
  return a.step === b.step && a.alter === b.alter;
}

/** German note name, e.g. "Cis", "Es", "B", "Heses", "Fisis". */
export function germanName(p: PitchName, lowercase = false): string {
  const { step, alter } = p;
  let name: string;
  if (alter === 0) name = STEP_LETTERS[step];
  else if (alter > 0) name = STEP_LETTERS[step] + 'is'.repeat(alter);
  else if (step === 6) name = alter === -1 ? 'B' : 'Heses';
  else if (step === 2) name = 'E' + 's' + 'es'.repeat(-alter - 1); // Es, Eses
  else if (step === 5) name = 'A' + 's' + 'as'.repeat(-alter - 1); // As, Asas
  else name = STEP_LETTERS[step] + 'es'.repeat(-alter);
  return lowercase ? name.toLowerCase() : name;
}

/**
 * German name with octave designation (Helmholtz), e.g. c', g, C, c'''.
 */
export function germanNameWithOctave(p: Pitch): string {
  const base = germanName(p, true);
  if (p.octave >= 3) return base + "'".repeat(p.octave - 3);
  if (p.octave === 2) return base.charAt(0).toUpperCase() + base.slice(1);
  // Contra octave and below
  const upper = base.charAt(0).toUpperCase() + base.slice(1);
  return upper + ','.repeat(2 - p.octave);
}

export const ACCIDENTAL_SYMBOLS: Record<number, string> = {
  [-2]: '𝄫',
  [-1]: '♭',
  0: '♮',
  1: '♯',
  2: '𝄪',
};

/** Spellings of a black/white key with at most one accidental. */
export function simpleSpellings(midi: number): Pitch[] {
  const pc = mod(midi, 12);
  const result: Pitch[] = [];
  for (let step = 0; step < 7; step++) {
    for (const alter of [-1, 0, 1]) {
      if (mod(STEP_SEMITONES[step] + alter, 12) === pc) {
        // Choose the octave so that the MIDI number matches
        const base = STEP_SEMITONES[step] + alter;
        const octave = Math.floor((midi - base) / 12) - 1;
        const p = { step, alter, octave };
        if (toMidi(p) === midi) result.push(p);
      }
    }
  }
  return result;
}

/**
 * Common spelling: white keys without accidentals, black keys with sharp
 * or flat (random or by preference).
 */
export function commonSpellings(midi: number): Pitch[] {
  const all = simpleSpellings(midi);
  const naturals = all.filter((p) => p.alter === 0);
  if (naturals.length > 0) return naturals;
  return all;
}

/** Spelling of a key matching the key signature (sharp or flat key). */
export function spellForKey(midi: number, keyFifths: number): Pitch {
  const options = commonSpellings(midi);
  if (options.length === 1) return options[0];
  const preferSharp = keyFifths >= 0;
  return options.find((p) => (preferSharp ? p.alter > 0 : p.alter < 0)) ?? options[0];
}

/** Accidental the key signature implies for a step. */
export function keyAlter(step: number, keyFifths: number): number {
  // Order of sharps: F C G D A E B
  const sharpOrder = [3, 0, 4, 1, 5, 2, 6];
  // Order of flats: B E A D G C F
  const flatOrder = [6, 2, 5, 1, 4, 0, 3];
  if (keyFifths > 0) return sharpOrder.slice(0, keyFifths).includes(step) ? 1 : 0;
  if (keyFifths < 0) return flatOrder.slice(0, -keyFifths).includes(step) ? -1 : 0;
  return 0;
}

/** Tonic of a key from its circle-of-fifths position. */
export function keyTonic(keyFifths: number, minor: boolean): PitchName {
  // Major tonic: C=0, G=1, … ; minor: a=0
  const majorStep = mod(keyFifths * 4, 7); // fifth = 4 steps
  const tonicMajor: PitchName = { step: majorStep, alter: keyAlter(majorStep, keyFifths) };
  if (!minor) return tonicMajor;
  const minorStep = mod(majorStep + 5, 7);
  return { step: minorStep, alter: keyAlter(minorStep, keyFifths) };
}

/** Pitch for VexFlow, e.g. "c#/4". Accidentals are drawn separately. */
export function vexKey(p: Pitch): string {
  const acc = p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter);
  return `${STEP_LETTERS_EN[p.step].toLowerCase()}${acc}/${p.octave}`;
}

/** Name for Tone.js, e.g. "C#4", "Bb3", "Fx4" (double sharp). */
export function toneName(p: Pitch): string {
  // Tone.js also accepts MIDI frequencies; going through MIDI is unambiguous.
  return midiToToneName(toMidi(p));
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function midiToToneName(midi: number): string {
  return SHARP_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(mod(midi, 12));
}

/** All spellings of a key with at most two accidentals. */
export function allSpellings(midi: number): Pitch[] {
  const out: Pitch[] = [];
  for (let step = 0; step < 7; step++) {
    for (const alter of [-2, -1, 0, 1, 2]) {
      const base = STEP_SEMITONES[step] + alter;
      if (mod(base - midi, 12) !== 0) continue;
      const octave = Math.floor((midi - base) / 12) - 1;
      const p = { step, alter, octave };
      if (toMidi(p) === midi) out.push(p);
    }
  }
  return out.sort((a, b) => Math.abs(a.alter) - Math.abs(b.alter));
}
