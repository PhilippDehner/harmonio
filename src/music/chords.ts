import { Pitch, PitchName, toMidi } from './pitch';
import { transpose } from './intervals';

export type ChordType = 'dur' | 'moll' | 'uberm' | 'verm';
export type Inversion = 'grund' | 'sext' | 'quartsext';

export interface ChordTypeDef {
  id: ChordType;
  short: string;
  long: string;
  key: string;
  /** Terz und Quinte über dem Grundton: [Stufen, Halbtöne] */
  third: [number, number];
  fifth: [number, number];
}

export const CHORD_TYPES: ChordTypeDef[] = [
  { id: 'dur', short: 'Dur', long: 'Dur', key: 'D', third: [2, 4], fifth: [4, 7] },
  { id: 'moll', short: 'Moll', long: 'Moll', key: 'M', third: [2, 3], fifth: [4, 7] },
  { id: 'verm', short: 'verm.', long: 'vermindert', key: 'V', third: [2, 3], fifth: [4, 6] },
  { id: 'uberm', short: 'überm.', long: 'übermäßig', key: 'Ü', third: [2, 4], fifth: [4, 8] },
];

export interface InversionDef {
  id: Inversion;
  long: string;
  key: string;
}

export const INVERSIONS: InversionDef[] = [
  { id: 'grund', long: 'Grundstellung', key: '1' },
  { id: 'sext', long: 'Sextakkord', key: '2' },
  { id: 'quartsext', long: 'Quartsextakkord', key: '3' },
];

export function chordTypeById(id: ChordType): ChordTypeDef {
  return CHORD_TYPES.find((c) => c.id === id)!;
}

export function inversionById(id: Inversion): InversionDef {
  return INVERSIONS.find((i) => i.id === id)!;
}

/** Grundton, Terz und Quinte (Oktave des Grundtons). */
export function chordTones(root: Pitch, type: ChordType): [Pitch, Pitch, Pitch] {
  const def = chordTypeById(type);
  return [
    root,
    transpose(root, def.third[0], def.third[1]),
    transpose(root, def.fifth[0], def.fifth[1]),
  ];
}

/** Stimmumfänge im Chorsatz (MIDI). */
export const VOICE_RANGES = {
  sopran: [60, 79], // c'–g''
  alt: [55, 74], // g–d''
  tenor: [48, 67], // c–g'
  bass: [40, 62], // E–d'
} as const;

export interface Voicing {
  /** Sopran, Alt, Tenor, Bass */
  notes: [Pitch, Pitch, Pitch, Pitch];
}

function withOctave(p: Pitch, octave: number): Pitch {
  return { ...p, octave };
}

/** Alle Oktavlagen eines Tons innerhalb eines MIDI-Bereichs. */
function placements(p: Pitch, range: readonly [number, number]): Pitch[] {
  const out: Pitch[] = [];
  for (let o = 1; o <= 7; o++) {
    const q = withOctave(p, o);
    const m = toMidi(q);
    if (m >= range[0] && m <= range[1]) out.push(q);
  }
  return out;
}

/**
 * Erzeugt alle gültigen vierstimmigen Lagen eines Akkords:
 * Grundton verdoppelt, Basston gemäß Umkehrung, Oberstimmen beliebig
 * angeordnet, Stimmumfänge des Chorsatzes, keine Stimmkreuzung,
 * Abstand benachbarter Oberstimmen höchstens eine Oktave.
 */
export function allVoicings(root: Pitch, type: ChordType, inversion: Inversion): Voicing[] {
  const [r, t, f] = chordTones(root, type);
  const bassTone = inversion === 'grund' ? r : inversion === 'sext' ? t : f;
  // Oberstimmen: die restlichen drei Töne mit verdoppeltem Grundton
  const upper: Pitch[] =
    inversion === 'grund' ? [r, t, f] : inversion === 'sext' ? [r, r, f] : [r, r, t];
  const perms: Pitch[][] = [
    [upper[0], upper[1], upper[2]],
    [upper[0], upper[2], upper[1]],
    [upper[1], upper[0], upper[2]],
    [upper[1], upper[2], upper[0]],
    [upper[2], upper[0], upper[1]],
    [upper[2], upper[1], upper[0]],
  ];
  const result: Voicing[] = [];
  const seen = new Set<string>();
  for (const bass of placements(bassTone, VOICE_RANGES.bass)) {
    for (const [s0, a0, t0] of perms) {
      for (const s of placements(s0, VOICE_RANGES.sopran)) {
        for (const a of placements(a0, VOICE_RANGES.alt)) {
          for (const te of placements(t0, VOICE_RANGES.tenor)) {
            const ms = toMidi(s);
            const ma = toMidi(a);
            const mt = toMidi(te);
            const mb = toMidi(bass);
            if (!(ms > ma && ma > mt && mt > mb)) continue;
            if (ms - ma > 12 || ma - mt > 12) continue;
            if (mt - mb > 19) continue;
            const key = [ms, ma, mt, mb].join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ notes: [s, a, te, bass] });
          }
        }
      }
    }
  }
  return result;
}

/** Richtige Benennung von Terz und Quinte. */
export function chordNamingSolution(root: Pitch, type: ChordType): PitchName[] {
  const [, t, f] = chordTones(root, type);
  return [
    { step: t.step, alter: t.alter },
    { step: f.step, alter: f.alter },
  ];
}

export function isCorrectChordNaming(answers: PitchName[], root: Pitch, type: ChordType): boolean {
  const sol = chordNamingSolution(root, type);
  return sol.every((s, i) => answers[i] && answers[i].step === s.step && answers[i].alter === s.alter);
}

export function chordAnswerId(type: ChordType, inversion: Inversion | null): string {
  return inversion ? `${type}-${inversion}` : type;
}

export function chordAnswerLabel(type: ChordType, inversion: Inversion | null): string {
  const t = chordTypeById(type).long;
  if (!inversion) return t;
  return `${t}, ${inversionById(inversion).long}`;
}
