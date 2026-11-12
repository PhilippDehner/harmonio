import { Pitch, PitchName, STEP_SEMITONES, germanName, keyTonic, mod, toMidi } from '../music/pitch';

/* ---------- Keys ---------- */

export interface Key {
  tonic: PitchName;
  minor: boolean;
}

export function pc(p: PitchName): number {
  return mod(STEP_SEMITONES[p.step] + p.alter, 12);
}

export function keyFromFifths(fifths: number, minor = false): Key {
  return { tonic: keyTonic(fifths, minor), minor };
}

export function sameKey(a: Key, b: Key): boolean {
  return a.minor === b.minor && a.tonic.step === b.tonic.step && a.tonic.alter === b.tonic.alter;
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** Pitch name of a scale degree (0 = tonic). Minor: natural minor, `raised` raises degrees 6 and 7. */
export function degreeName(key: Key, degree: number, raised = false): PitchName {
  const d = mod(degree, 7);
  const step = mod(key.tonic.step + d, 7);
  let semis = (key.minor ? MINOR_SCALE : MAJOR_SCALE)[d];
  if (key.minor && raised && (d === 5 || d === 6)) semis += 1;
  const natural = STEP_SEMITONES[step];
  const target = pc(key.tonic) + semis;
  let alter = mod(target - natural, 12);
  if (alter > 6) alter -= 12;
  return { step, alter };
}

/** Is the pitch name part of the key (minor: natural and raised 6th/7th)? */
export function inKey(p: PitchName, key: Key): boolean {
  for (let d = 0; d < 7; d++) {
    const n = degreeName(key, d);
    if (n.step === p.step && n.alter === p.alter) return true;
    if (key.minor && (d === 5 || d === 6)) {
      const r = degreeName(key, d, true);
      if (r.step === p.step && r.alter === p.alter) return true;
    }
  }
  return false;
}

/** Key signature (circle of fifths) of a key, or null if more than 7 accidentals. */
export function fifthsOfKey(key: Key): number | null {
  for (let f = -7; f <= 7; f++) {
    const t = keyTonic(f, key.minor);
    if (t.step === key.tonic.step && t.alter === key.tonic.alter) return f;
  }
  return null;
}

/** German key name: major upper case ("Fis"), minor lower case ("e"). */
export function keyName(key: Key): string {
  return germanName(key.tonic, key.minor);
}

/* ---------- Chords ---------- */

export type ChordQuality = 'major' | 'minor' | 'diminished' | 'augmented';
export type SeventhQuality = 'minor' | 'major' | 'diminished';
export type Member = 'root' | 'third' | 'fifth' | 'seventh';

export interface Chord {
  root: PitchName;
  quality: ChordQuality;
  seventh: SeventhQuality | null;
  /** Fifth present */
  hasFifth: boolean;
  /** Member per input pitch (same order) */
  members: Member[];
  /** Member in the bass (lowest pitch) */
  bassMember: Member;
  /** Allowed in the rule set (triads except augmented, common seventh chords) */
  allowed: boolean;
}

export function chordKey(c: Chord | null): string {
  if (!c) return '-';
  return `${c.root.step}:${c.root.alter}:${c.quality}:${c.seventh ?? ''}`;
}

export function sameHarmony(a: Chord | null, b: Chord | null): boolean {
  return !!a && !!b && chordKey(a) === chordKey(b);
}

/** Pitch name of a member (third, fifth, seventh) of a chord. */
export function memberName(c: Chord, m: Member): PitchName {
  const steps = { root: 0, third: 2, fifth: 4, seventh: 6 }[m];
  const thirdSemis = c.quality === 'major' || c.quality === 'augmented' ? 4 : 3;
  const fifthSemis = c.quality === 'diminished' ? 6 : c.quality === 'augmented' ? 8 : 7;
  const seventhSemis = c.seventh === 'major' ? 11 : c.seventh === 'diminished' ? 9 : 10;
  const semis = { root: 0, third: thirdSemis, fifth: fifthSemis, seventh: seventhSemis }[m];
  const step = mod(c.root.step + steps, 7);
  let alter = mod(pc(c.root) + semis - STEP_SEMITONES[step], 12);
  if (alter > 6) alter -= 12;
  return { step, alter };
}

export function memberPc(c: Chord, m: Member): number {
  return pc(memberName(c, m));
}

/** Is the chord a dominant seventh chord (major triad + minor seventh)? */
export function isDom7(c: Chord): boolean {
  return c.quality === 'major' && c.seventh === 'minor';
}

function evaluateRoot(pitches: Pitch[], root: PitchName, bass: Pitch, bySpelling: boolean): Chord | null {
  const members: Member[] = [];
  let third: number | null = null;
  let fifth: number | null = null;
  let seventh: number | null = null;
  for (const p of pitches) {
    const semis = mod(pc(p) - pc(root), 12);
    let m: Member | null = null;
    if (bySpelling) {
      const steps = mod(p.step - root.step, 7);
      if (steps === 0 && semis === 0) m = 'root';
      else if (steps === 2 && (semis === 3 || semis === 4)) m = 'third';
      else if (steps === 4 && semis >= 6 && semis <= 8) m = 'fifth';
      else if (steps === 6 && semis >= 9 && semis <= 11) m = 'seventh';
    } else {
      if (semis === 0) m = 'root';
      else if (semis === 3 || semis === 4) m = 'third';
      else if (semis === 6 || semis === 7 || semis === 8) m = 'fifth';
      else if (semis === 9 || semis === 10 || semis === 11) m = 'seventh';
    }
    if (!m) return null;
    if (m === 'third') {
      if (third !== null && third !== semis) return null;
      third = semis;
    }
    if (m === 'fifth') {
      if (fifth !== null && fifth !== semis) return null;
      fifth = semis;
    }
    if (m === 'seventh') {
      if (seventh !== null && seventh !== semis) return null;
      seventh = semis;
    }
    members.push(m);
  }
  if (third === null) return null;
  let quality: ChordQuality;
  if (third === 4) quality = fifth === 8 ? 'augmented' : fifth === 6 ? 'diminished' : 'major';
  else quality = fifth === 6 ? 'diminished' : fifth === 8 ? 'augmented' : 'minor';
  // Major third with diminished fifth is not a chord of the rule set
  if (third === 4 && fifth === 6) return null;
  if (third === 3 && fifth === 8) return null;
  const sev: SeventhQuality | null = seventh === null ? null : seventh === 11 ? 'major' : seventh === 10 ? 'minor' : 'diminished';
  let allowed = quality !== 'augmented';
  if (sev === 'diminished' && quality !== 'diminished') allowed = false;
  if (sev === 'major' && quality === 'diminished') allowed = false;
  const bassIdx = pitches.findIndex((p) => toMidi(p) === toMidi(bass) && p.step === bass.step);
  const bassMember = members[bassIdx >= 0 ? bassIdx : 0];
  return { root, quality, seventh: sev, hasFifth: fifth !== null, members, bassMember, allowed };
}

/**
 * Identifies the chord formed by the pitches (thirds stacked on a root that
 * must be present). The lowest pitch is the bass. Returns null if the pitches
 * do not form a triad or seventh chord with root and third.
 * First by spelling; if that fails, by pitch classes (enharmonically).
 */
export function identifyChord(pitches: Pitch[]): (Chord & { enharmonic: boolean }) | null {
  if (pitches.length === 0) return null;
  const bass = pitches.reduce((a, b) => (toMidi(b) < toMidi(a) ? b : a));
  const names: PitchName[] = [];
  for (const p of pitches) if (!names.some((n) => n.step === p.step && n.alter === p.alter)) names.push({ step: p.step, alter: p.alter });
  for (const bySpelling of [true, false]) {
    let best: Chord | null = null;
    for (const root of names) {
      const c = evaluateRoot(pitches, root, bass, bySpelling);
      if (!c) continue;
      // Prefer complete chords, then fewer sevenths
      if (!best || score(c) < score(best)) best = c;
    }
    if (best) return { ...best, enharmonic: !bySpelling };
  }
  return null;
}

function score(c: Chord): number {
  return (c.hasFifth ? 0 : 2) + (c.seventh ? 1 : 0) + (c.allowed ? 0 : 5);
}
