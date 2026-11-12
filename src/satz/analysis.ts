import { PitchName, mod, toMidi } from '../music/pitch';
import { BASS } from './model';
import { CheckResult, Harmony, isDominant, resolution } from './rules';
import { Chord, Key, Member, degreeName, inKey, isDom7, keyName, memberName, pc, sameKey } from './theory';

/**
 * Harmony analysis: function theory (T, S, D, Tp, …) and scale degrees
 * (I–VII). Text syntax:
 *   [Key:] [(]Symbol[)] [7|9] [6] [_1|_3|_5|_7]
 * e.g. "D7_3" (D7 with the third in the bass), "(D7)", "S65" (sixte ajoutée),
 * "Dv9" (shortened dominant ninth chord), "G: D7", "V7_7", "(V)".
 */

export type Theory = 'function' | 'degree';
export type AnalysisView = 'function' | 'degree' | 'both';

export interface ParsedLabel {
  key: Key | null;
  secondary: boolean;
  theory: Theory;
  /** Function symbol (T, Sp, DD, Dv …) or degree 0–6 */
  symbol: string;
  degree: number;
  seventh: boolean;
  ninth: boolean;
  sixte: boolean;
  bass: 1 | 3 | 5 | 7 | null;
}

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const SUB: Record<string, string> = { '₁': '1', '₃': '3', '₅': '5', '₇': '7' };
const SUP: Record<string, string> = { '⁷': '7', '⁹': '9', '⁶': '6', '⁵': '5' };

/** Parses a German key name ("G", "fis", "B", "es") into a key. */
export function parseKeyName(s: string): Key | null {
  const m = /^([A-Ha-h])(is|es|s)?$/.exec(s);
  if (!m) return null;
  const letter = m[1];
  const lower = letter.toLowerCase();
  const steps: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, h: 6, b: 6 };
  let alter = lower === 'b' ? -1 : 0;
  if (m[2] === 'is') alter += 1;
  if (m[2] === 'es' || m[2] === 's') {
    if (m[2] === 's' && lower !== 'a' && lower !== 'e') return null;
    alter -= 1;
  }
  return { tonic: { step: steps[lower], alter }, minor: letter === lower };
}

function normalize(text: string): string {
  let s = text.trim().replace(/\s+/g, '');
  s = s.replace(/D̸/g, 'Dv').replace(/Đ/g, 'Dv');
  s = s.replace(/[₁₃₅₇]/g, (c) => '_' + SUB[c]);
  s = s.replace(/[⁷⁹⁶⁵]/g, (c) => SUP[c]);
  return s;
}

const FUNCTION_RE = /^(DD|Dv|Tp|Sp|Dp|Tg|Sg|tP|sP|dP|tG|T|S|D|t|s|d)(9|7)?(56|65|6)?$/;
const DEGREE_RE = /^(VII|VI|IV|V|III|II|I)[°ø]?(7)?$/i;

export function parseLabel(text: string): ParsedLabel | { error: string } {
  let s = normalize(text);
  if (!s) return { error: 'Leere Angabe' };
  let key: Key | null = null;
  const km = /^([A-Ha-h](?:is|es|s)?):/.exec(s);
  if (km) {
    key = parseKeyName(km[1]);
    if (!key) return { error: `Unbekannte Tonart „${km[1]}“` };
    s = s.slice(km[0].length);
  }
  let bass: ParsedLabel['bass'] = null;
  const bm = /_(1|3|5|7)$/.exec(s);
  if (bm) {
    bass = Number(bm[1]) as 1 | 3 | 5 | 7;
    s = s.slice(0, -bm[0].length);
  }
  let secondary = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    secondary = true;
    s = s.slice(1, -1);
  }
  const fm = FUNCTION_RE.exec(s);
  if (fm) {
    const symbol = fm[1];
    const sixte = !!fm[3];
    if (sixte && symbol !== 'S' && symbol !== 's') return { error: 'Sixte ajoutée (6) nur bei S oder s' };
    if (fm[2] === '9' && symbol !== 'Dv') return { error: '9 nur beim verkürzten Dominantnonakkord (Dv9)' };
    if (secondary && !['D', 'Dv'].includes(symbol)) return { error: 'In Klammern nur Zwischendominanten: (D), (D7), (Dv), (Dv9)' };
    return { key, secondary, theory: 'function', symbol, degree: -1, seventh: fm[2] === '7', ninth: fm[2] === '9', sixte, bass };
  }
  const dm = DEGREE_RE.exec(s);
  if (dm) {
    const degree = ROMANS.indexOf(dm[1].toUpperCase());
    if (secondary && degree !== 4 && degree !== 6) return { error: 'In Klammern nur Zwischendominanten: (V), (V7), (VII), (VII7)' };
    return { key, secondary, theory: 'degree', symbol: ROMANS[degree], degree, seventh: !!dm[2], ninth: false, sixte: false, bass };
  }
  return { error: `Unbekannte Angabe „${text.trim()}“` };
}

/* ---------- Expected chords ---------- */

interface Spec {
  root: PitchName;
  third: number;
  fifth: number;
  /** Semitones of the seventh above the root, null = none */
  seventh: number | null;
  sixth: boolean;
}

interface Expected {
  pcs: Set<number>;
  required: Set<number>;
  bassPc: number;
}

type FnDef = [degree: number, quality: 'major' | 'minor' | 'diminished', raised?: boolean];

const MAJOR_FUNCTIONS: Record<string, FnDef[]> = {
  T: [[0, 'major']],
  S: [[3, 'major']],
  D: [[4, 'major']],
  Tp: [[5, 'minor']],
  Sp: [[1, 'minor']],
  Dp: [[2, 'minor']],
  Tg: [[2, 'minor']],
  Sg: [[5, 'minor']],
  t: [[0, 'minor']],
  s: [[3, 'minor']],
  d: [[4, 'minor']],
  DD: [[1, 'major']],
  Dv: [[6, 'diminished']],
};

const MINOR_FUNCTIONS: Record<string, FnDef[]> = {
  t: [[0, 'minor']],
  s: [[3, 'minor']],
  S: [[3, 'major']],
  D: [[4, 'major']],
  d: [[4, 'minor']],
  tP: [[2, 'major']],
  sP: [[5, 'major']],
  dP: [[6, 'major']],
  tG: [[5, 'major']],
  DD: [[1, 'major']],
  Dv: [[6, 'diminished', true]],
};

function semis(q: 'major' | 'minor' | 'diminished'): [number, number] {
  return q === 'major' ? [4, 7] : q === 'minor' ? [3, 7] : [3, 6];
}

/** Root of a degree with the pitch class adjusted to the wanted quality (e.g. raised leading tone in minor). */
function degreeRoot(key: Key, degree: number, raised = false): PitchName {
  return degreeName(key, degree, raised);
}

function diatonicSeventh(key: Key, degree: number, root: PitchName): number {
  const sev = degreeName(key, degree + 6);
  return mod(pc(sev) - pc(root), 12);
}

function specToExpected(spec: Spec, bass: ParsedLabel['bass']): Expected {
  const r = pc(spec.root);
  const third = mod(r + spec.third, 12);
  const fifth = mod(r + spec.fifth, 12);
  const pcs = new Set([r, third, fifth]);
  const required = new Set([r, third]);
  let seventh: number | null = null;
  if (spec.seventh !== null) {
    seventh = mod(r + spec.seventh, 12);
    pcs.add(seventh);
    required.add(seventh);
  }
  if (spec.sixth) {
    const sixth = mod(r + 9, 12);
    pcs.add(sixth);
    required.add(sixth);
  }
  if (spec.fifth === 6) required.add(fifth);
  const bassPc = bass === 3 ? third : bass === 5 ? fifth : bass === 7 && seventh !== null ? seventh : r;
  return { pcs, required, bassPc };
}

function expectedFor(label: ParsedLabel, key: Key, targetRootPc: number | null): Expected[] {
  const specs: Spec[] = [];
  if (label.secondary) {
    if (targetRootPc === null) return [];
    if (label.theory === 'function' ? label.symbol === 'D' : label.degree === 4) {
      const root = pcName(mod(targetRootPc + 7, 12));
      specs.push({ root, third: 4, fifth: 7, seventh: label.seventh ? 10 : null, sixth: false });
    } else {
      const root = pcName(mod(targetRootPc - 1, 12));
      const sevs = label.ninth || label.seventh ? [9, 10] : [null];
      // Function theory: Dv = triad, Dv9 = seventh chord; degrees: VII7 = seventh chord
      const withSeventh = label.theory === 'function' ? label.ninth : label.seventh;
      for (const s of withSeventh ? sevs : [null]) specs.push({ root, third: 3, fifth: 6, seventh: s, sixth: false });
    }
  } else if (label.theory === 'function') {
    const table = key.minor ? MINOR_FUNCTIONS : MAJOR_FUNCTIONS;
    const defs = table[label.symbol];
    if (!defs) return [];
    for (const [deg, quality, raised] of defs) {
      const root = degreeRoot(key, deg, raised);
      const [third, fifth] = semis(quality);
      let seventh: number | null = null;
      if (label.symbol === 'Dv') {
        if (label.ninth) seventh = mod(pc(degreeName(key, deg + 6)) - pc(root), 12);
      } else if (label.seventh) {
        seventh = ['D', 'DD'].includes(label.symbol) ? 10 : diatonicSeventh(key, deg, root);
      }
      specs.push({ root, third, fifth, seventh, sixth: label.sixte });
    }
  } else {
    const variants: boolean[] = key.minor && (label.degree === 4 || label.degree === 6) ? [false, true] : [false];
    for (const raised of variants) {
      const root = degreeRoot(key, label.degree, raised && label.degree === 6);
      const third = mod(pc(degreeName(key, label.degree + 2, raised)) - pc(root), 12);
      const fifth = mod(pc(degreeName(key, label.degree + 4, raised)) - pc(root), 12);
      const seventh = label.seventh ? mod(pc(degreeName(key, label.degree + 6, raised)) - pc(root), 12) : null;
      specs.push({ root, third, fifth, seventh, sixth: false });
    }
  }
  return specs.map((s) => specToExpected(s, label.bass));
}

function pcName(p: number): PitchName {
  const steps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const step = steps[p];
  return { step, alter: p - [0, 2, 4, 5, 7, 9, 11][step] };
}

/* ---------- Harmonies of a check result ---------- */

export interface HarmonyFacts {
  harmony: Harmony;
  pcs: Set<number>;
  bassPc: number | null;
  bassMember: Member | null;
  nextRootPc: number | null;
}

export function harmonyFacts(r: CheckResult, h: Harmony): HarmonyFacts {
  const pcs = new Set<number>();
  for (let i = h.first; i <= h.last; i++) {
    const s = r.slices[i];
    s.notes.forEach((n, v) => {
      if (n && s.member[v] !== null) pcs.add(mod(toMidi(n.pitch), 12));
    });
  }
  const first = r.slices[h.first];
  const b = first.notes[BASS];
  const next = nextHarmony(r, h);
  return {
    harmony: h,
    pcs,
    bassPc: b && first.member[BASS] !== null ? mod(toMidi(b.pitch), 12) : null,
    bassMember: first.member[BASS],
    nextRootPc: next?.chord ? pc(next.chord.root) : null,
  };
}

function nextHarmony(r: CheckResult, h: Harmony): Harmony | null {
  const n = r.harmonies[h.index + 1];
  return n && !n.silent && n.chord ? n : null;
}

/** Harmony sounding at a tick. */
export function harmonyAt(r: CheckResult, tick: number): Harmony | null {
  const s = r.slices.find((x) => x.tick <= tick && tick < x.end);
  if (!s) return null;
  const h = r.harmonies[s.harmony];
  return h && !h.silent && h.chord ? h : null;
}

export interface LabelCheck {
  tick: number;
  text: string;
  ok: boolean;
  message: string;
}

/**
 * Checks the user's analysis labels against the written chords. A label is
 * accepted if it fits in the main key, the recognized local key or a key the
 * user set with a prefix ("G: …").
 */
export function checkAnalysis(r: CheckResult, labels: Record<number, string>): LabelCheck[] {
  const out: LabelCheck[] = [];
  let userKey: Key | null = null;
  const ticks = Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b);
  for (const tick of ticks) {
    const text = labels[tick];
    if (!text.trim()) continue;
    const parsed = parseLabel(text);
    if ('error' in parsed) {
      out.push({ tick, text, ok: false, message: parsed.error });
      continue;
    }
    if (parsed.key) userKey = parsed.key;
    const h = harmonyAt(r, tick);
    if (!h) {
      out.push({ tick, text, ok: false, message: 'An dieser Stelle steht kein vollständiger Akkord.' });
      continue;
    }
    const facts = harmonyFacts(r, h);
    const keys = [userKey, h.key, r.mainKey].filter((k): k is Key => !!k);
    const ok = keys.some((k) =>
      expectedFor(parsed, k, facts.nextRootPc).some(
        (e) =>
          [...e.required].every((p) => facts.pcs.has(p)) &&
          [...facts.pcs].every((p) => e.pcs.has(p)) &&
          facts.bassPc === e.bassPc,
      ),
    );
    out.push({
      tick,
      text,
      ok,
      message: ok ? 'passt' : `passt nicht zum Akkord (${describeChord(h.chord!, facts.bassMember)})`,
    });
  }
  return out;
}

const QUALITY_TEXT: Record<string, string> = { major: 'Dur', minor: 'Moll', diminished: 'vermindert', augmented: 'übermäßig' };

export function describeChord(c: Chord, bassMember: Member | null): string {
  const root = noteName(c.root);
  let s = `${c.quality === 'minor' || c.quality === 'diminished' ? root.toLowerCase() : root}-${QUALITY_TEXT[c.quality]}`;
  if (c.seventh) s += ' mit Septime';
  if (bassMember && bassMember !== 'root') s += `, ${{ third: 'Terz', fifth: 'Quinte', seventh: 'Septime' }[bassMember]} im Bass`;
  return s;
}

function noteName(p: PitchName): string {
  return keyName({ tonic: p, minor: false });
}

/* ---------- Automatic analysis ---------- */

export interface AutoLabel {
  tick: number;
  function: string | null;
  degree: string;
}

const BASS_SUFFIX: Record<Member, string> = { root: '', third: '_3', fifth: '_5', seventh: '_7' };

function functionSymbol(c: Chord, key: Key, bassMember: Member | null): string | null {
  const deg = mod(c.root.step - key.tonic.step, 7);
  const rootPc = pc(c.root);
  const table = key.minor ? MINOR_FUNCTIONS : MAJOR_FUNCTIONS;
  const tri = c.quality;
  // Seventh chords
  if (c.seventh) {
    if (isDom7(c) && deg === 4 && rootPc === pc(degreeName(key, 4))) return 'D7';
    if (isDom7(c) && deg === 1 && rootPc === pc(degreeName(key, 1))) return 'DD7';
    if (tri === 'diminished' && deg === 6) return 'Dv9';
    if (!key.minor && deg === 1 && tri === 'minor' && bassMember === 'third') return 'S65';
  }
  if (tri === 'diminished' && deg === 6 && !c.seventh) return 'Dv';
  for (const [sym, defs] of Object.entries(table)) {
    if (sym === 'Dv') continue;
    for (const [d, q, raised] of defs) {
      if (d !== deg || q !== tri) continue;
      if (pc(degreeName(key, d, raised)) !== rootPc) continue;
      if (c.seventh && !chordFitsKey(c, key)) continue;
      return c.seventh ? `${sym}7` : sym;
    }
  }
  return null;
}

function chordFitsKey(c: Chord, key: Key): boolean {
  const ms: Member[] = ['root', 'third'];
  if (c.hasFifth) ms.push('fifth');
  if (c.seventh) ms.push('seventh');
  return ms.every((m) => inKey(memberName(c, m), key));
}

function secondaryOf(c: Chord, key: Key, next: Chord | null): boolean {
  if (!next) return false;
  const r = resolution(c, next);
  if (r !== 'authentic' && r !== 'diminished') return false;
  const deg = mod(c.root.step - key.tonic.step, 7);
  const isMainDominant = deg === 4 && pc(c.root) === pc(degreeName(key, 4)) && c.quality === 'major';
  const isMainDim = deg === 6 && c.quality === 'diminished' && chordFitsKey(c, key);
  if (isMainDominant || isMainDim) return false;
  return !chordFitsKey(c, key) || isDom7(c);
}

/** Automatic labels for every change of harmony (or bass), in both theories. */
export function autoAnalysis(r: CheckResult): AutoLabel[] {
  const out: AutoLabel[] = [];
  let lastKey: Key = r.mainKey;
  let lastLabel = '';
  for (const h of r.harmonies) {
    if (h.silent || !h.chord) continue;
    const c = h.chord;
    const facts = harmonyFacts(r, h);
    const next = nextHarmony(r, h)?.chord ?? null;
    const bassMember = facts.bassMember ?? 'root';
    const prefix = sameKey(h.key, lastKey) ? '' : `${keyName(h.key)}: `;
    lastKey = h.key;
    const suffix = BASS_SUFFIX[bassMember];
    let fn: string | null;
    let deg: string;
    const degree = mod(c.root.step - h.key.tonic.step, 7);
    if (secondaryOf(c, h.key, next)) {
      const dim = c.quality === 'diminished';
      const doubleDominant =
        !dim && next && isDominant(next, h.key) && mod(next.root.step - h.key.tonic.step, 7) === 4 && degree === 1;
      fn = doubleDominant
        ? `DD${c.seventh ? '7' : ''}`
        : dim
          ? `(Dv${c.seventh ? '9' : ''})`
          : `(D${c.seventh ? '7' : ''})`;
      deg = `(${dim ? 'VII' : 'V'}${c.seventh ? '7' : ''})`;
    } else {
      fn = functionSymbol(c, h.key, bassMember);
      deg = `${ROMANS[degree]}${c.seventh ? '7' : ''}`;
    }
    const fnText = fn === null ? null : prefix + fn + (fn === 'S65' ? '' : suffix);
    const degText = prefix + deg + suffix;
    const id = `${fnText}|${degText}`;
    if (id === lastLabel && !prefix) continue;
    lastLabel = id;
    out.push({ tick: h.tick, function: fnText, degree: degText });
  }
  return out;
}

/* ---------- Display ---------- */

const SUPER: Record<string, string> = { '7': '⁷', '9': '⁹', '6': '⁶', '5': '⁵' };
const SUBSCRIPT: Record<string, string> = { '1': '₁', '3': '₃', '5': '₅', '7': '₇' };

/** Typographic form: "Dv9_3" → "D̸⁹₃", "S65" → "S⁵₆". */
export function formatLabel(text: string): string {
  let s = text.trim();
  s = s.replace(/_(1|3|5|7)/g, (_, d: string) => SUBSCRIPT[d]);
  s = s.replace(/Dv/g, 'D̸');
  s = s.replace(/(S|s)(56|65)/g, '$1⁵₆');
  s = s.replace(/([A-Za-z)̸])(7|9|6)/g, (_, a: string, d: string) => a + SUPER[d]);
  return s;
}
