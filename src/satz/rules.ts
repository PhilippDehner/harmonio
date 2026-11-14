import { Measure } from '../dictation/model';
import { Pitch, diatonicIndex, mod, toMidi } from '../music/pitch';
import { ALTO, BASS, SOPRANO, SNote, SatzMode, TENOR, VOICE_LABELS, noteEndS, sortByStart } from './model';
import {
  Chord,
  Key,
  Member,
  chordKey,
  degreeName,
  identifyChord,
  inKey,
  isDom7,
  keyFromFifths,
  memberName,
  pc,
  sameHarmony,
  sameKey,
} from './theory';

/* ---------- Rules ---------- */

export type RuleId =
  | 'parallel-fifths'
  | 'parallel-octaves'
  | 'hidden'
  | 'crossing'
  | 'spacing'
  | 'range'
  | 'leading-tone'
  | 'seventh'
  | 'doubling'
  | 'final'
  | 'chord'
  | 'complete'
  | 'six-four'
  | 'suspension'
  | 'rhythm';

export const RULE_IDS: RuleId[] = [
  'parallel-fifths',
  'parallel-octaves',
  'hidden',
  'crossing',
  'spacing',
  'range',
  'leading-tone',
  'seventh',
  'doubling',
  'final',
  'chord',
  'complete',
  'six-four',
  'suspension',
  'rhythm',
];

export const RULE_TITLES: Record<RuleId, string> = {
  'parallel-fifths': 'Quintparallelen',
  'parallel-octaves': 'Oktavparallelen',
  hidden: 'Verdeckte Quinten und Oktaven',
  crossing: 'Stimmkreuzung',
  spacing: 'Abstand zwischen den Stimmen',
  range: 'Stimmumfang',
  'leading-tone': 'Leittonauflösung',
  seventh: 'Septauflösung',
  doubling: 'Verdopplung',
  final: 'Schluss',
  chord: 'Erlaubte Akkorde',
  complete: 'Vollständige Akkorde',
  'six-four': 'Quartsextakkorde',
  suspension: 'Vorhalte und akkordfremde Töne',
  rhythm: 'Takte füllen und Pausen',
};

/** Voice ranges in MIDI [low, high] per mode (S, A, T, B). */
export const RANGES: Record<SatzMode, [number, number][]> = {
  // Chorsatz: S c1–g2, A g–d2, T c–g1, B F–d1
  choir: [
    [60, 79],
    [55, 74],
    [48, 67],
    [41, 62],
  ],
  // Orgelsatz: S c1–c3, A f–g2, T c–c2, Pedal C–d1
  organ: [
    [60, 84],
    [53, 79],
    [48, 72],
    [36, 62],
  ],
};

export interface Violation {
  rule: RuleId;
  message: string;
  /** Notes to mark */
  notes: string[];
  /** Pairs of notes to connect with a line (e.g. parallels) */
  lines: [string, string][];
  /** Ticks involved (for the direct mode: checked only where all voices are present) */
  ticks: number[];
  /** First involved tick (for sorting and jumping) */
  tick: number;
}

/* ---------- Slices and harmonies ---------- */

export type NctType = 'passing' | 'neighbor' | 'suspension' | 'anticipation' | 'unprepared';

export const NCT_LABELS: Record<NctType, string> = {
  passing: 'Durchgang',
  neighbor: 'Wechselnote',
  suspension: 'Vorhalt',
  anticipation: 'Vorausnahme',
  unprepared: 'unvorbereiteter Vorhalt',
};

export interface Slice {
  index: number;
  tick: number;
  end: number;
  /** Sounding note per voice (null: none or rest) */
  notes: (SNote | null)[];
  /** Voice has a note or rest here */
  present: boolean[];
  /** All four voices present */
  complete: boolean;
  /** All voices rest (or are missing) */
  silent: boolean;
  chord: Chord | null;
  enharmonic: boolean;
  /** Non-chord tone type per voice, null = chord tone */
  nct: (NctType | null)[];
  /** Chord member per voice (chord tones only) */
  member: (Member | null)[];
  harmony: number;
}

export interface Harmony {
  index: number;
  chord: Chord | null;
  first: number;
  last: number;
  tick: number;
  end: number;
  key: Key;
  silent: boolean;
}

export interface CheckInput {
  voices: SNote[][];
  measures: Measure[];
  keyFifths: number;
  mode: SatzMode;
  /** Only a section (rule examples): no check of the ending */
  fragment?: boolean;
}

export interface CheckResult {
  violations: Violation[];
  slices: Slice[];
  harmonies: Harmony[];
  mainKey: Key;
}

const midi = (n: SNote) => toMidi(n.pitch);
const dia = (p: Pitch) => diatonicIndex(p);

function isStep(a: SNote, b: SNote): boolean {
  const d = Math.abs(dia(b.pitch) - dia(a.pitch));
  const s = Math.abs(midi(b) - midi(a));
  return d === 1 && s >= 1 && s <= 2;
}

interface VoiceIndexMap {
  prev: Map<string, SNote | null>;
  next: Map<string, SNote | null>;
}

/** Previous and next note of each note in its voice (null across rests or gaps). */
function neighbours(voice: SNote[]): VoiceIndexMap {
  const sorted = sortByStart(voice);
  const prev = new Map<string, SNote | null>();
  const next = new Map<string, SNote | null>();
  sorted.forEach((n, i) => {
    const p = sorted[i - 1];
    const q = sorted[i + 1];
    prev.set(n.id, p && !p.rest && noteEndS(p) === n.start ? p : null);
    next.set(n.id, q && !q.rest && noteEndS(n) === q.start ? q : null);
  });
  return { prev, next };
}

function nctOptions(n: SNote, held: boolean, maps: VoiceIndexMap): NctType[] {
  const p = maps.prev.get(n.id) ?? null;
  const q = maps.next.get(n.id) ?? null;
  if (held) return q && isStep(n, q) ? ['suspension'] : [];
  const out: NctType[] = [];
  if (p && q && isStep(p, n) && isStep(n, q)) {
    const d1 = Math.sign(midi(n) - midi(p));
    const d2 = Math.sign(midi(q) - midi(n));
    if (d1 === d2) out.push('passing');
    else if (midi(q) === midi(p)) out.push('neighbor');
  }
  if (p && midi(p) === midi(n) && q && isStep(n, q)) out.push('suspension');
  if (q && midi(q) === midi(n)) out.push('anticipation');
  if (out.length === 0 && q && isStep(n, q)) out.push('unprepared');
  return out;
}

const NCT_COST: Record<NctType, number> = {
  passing: 2,
  neighbor: 2,
  suspension: 3,
  anticipation: 4,
  unprepared: 60,
};

/** Members of the notes in a chord, or null if a note does not belong to it. */
function fitChord(c: Chord, notes: SNote[]): Member[] | null {
  const out: Member[] = [];
  for (const n of notes) {
    const m = (['root', 'third', 'fifth', 'seventh'] as Member[]).find(
      (mm) => (mm !== 'seventh' || c.seventh) && pc(memberName(c, mm)) === mod(midi(n), 12),
    );
    if (!m) return null;
    out.push(m);
  }
  return out;
}

function buildSlices(voices: SNote[][]): { slices: Slice[]; maps: VoiceIndexMap[] } {
  const maps = voices.map(neighbours);
  const ticks = Array.from(new Set(voices.flatMap((v) => v.map((n) => n.start)))).sort((a, b) => a - b);
  const total = Math.max(0, ...voices.flatMap((v) => v.map(noteEndS)));
  const slices: Slice[] = [];
  ticks.forEach((tick, i) => {
    const end = ticks[i + 1] ?? total;
    if (end <= tick) return;
    const notes: (SNote | null)[] = [];
    const present: boolean[] = [];
    voices.forEach((v) => {
      const n = v.find((x) => x.start <= tick && tick < noteEndS(x));
      present.push(!!n);
      notes.push(n && !n.rest ? n : null);
    });
    slices.push({
      index: slices.length,
      tick,
      end,
      notes,
      present,
      complete: present.every(Boolean),
      silent: notes.every((n) => n === null),
      chord: null,
      enharmonic: false,
      nct: [null, null, null, null],
      member: [null, null, null, null],
      harmony: -1,
    });
  });

  // Chord per slice: choose the cheapest interpretation of non-chord tones
  let prevChord: Chord | null = null;
  for (const s of slices) {
    if (s.silent) {
      prevChord = null;
      continue;
    }
    const sounding = s.notes
      .map((n, v) => ({ n, v }))
      .filter((x): x is { n: SNote; v: number } => x.n !== null);
    const options = sounding.map(({ n, v }) => nctOptions(n, n.start < s.tick, maps[v]));
    const candidates = sounding.map((_, i) => i).filter((i) => options[i].length > 0);
    let best: { cost: number; chord: Chord | null; enh: boolean; removed: Set<number>; types: Map<number, NctType> } | null =
      null;
    for (let mask = 0; mask < 1 << candidates.length; mask++) {
      const removed = new Set<number>();
      candidates.forEach((c, k) => mask & (1 << k) && removed.add(c));
      if (removed.size === sounding.length) continue;
      const rest = sounding.filter((_, i) => !removed.has(i));
      let cost = 0;
      const types = new Map<number, NctType>();
      const implied: Pitch[] = [];
      removed.forEach((i) => {
        const t = options[i].reduce((a, b) => (NCT_COST[b] < NCT_COST[a] ? b : a));
        types.set(i, t);
        cost += NCT_COST[t];
        // The tone the non-chord tone stands for belongs to the chord (e.g. resolution of a suspension)
        const { n, v } = sounding[i];
        const other = t === 'suspension' || t === 'unprepared' ? maps[v].next.get(n.id) : maps[v].prev.get(n.id);
        if (other) implied.push(other.pitch);
      });
      let c = identifyChord(rest.map((x) => x.n.pitch));
      // Continuation of the previous harmony (e.g. its third sounded only on the previous eighth)
      if (prevChord) {
        const members = fitChord(prevChord, rest.map((x) => x.n));
        if (members && (!c || !sameHarmony(c, prevChord))) {
          const bassIdx = rest.reduce((bi, x, k) => (midi(x.n) < midi(rest[bi].n) ? k : bi), 0);
          const inherited: Chord & { enharmonic: boolean } = { ...prevChord, members, bassMember: members[bassIdx], enharmonic: false };
          const identifiedCost = c ? (c.hasFifth ? 0 : 1) + 1 : 1000;
          if (identifiedCost > 0.5) {
            c = inherited;
            cost += 0.5 - (inherited.hasFifth ? 0 : 1);
          }
        }
      }
      if (!c && implied.length) {
        const withImplied = identifyChord([...rest.map((x) => x.n.pitch), ...implied]);
        if (withImplied) {
          c = { ...withImplied, members: withImplied.members.slice(0, rest.length) };
          cost += 1;
        }
      }
      if (!c) cost += 1000;
      else {
        if (!c.allowed) cost += 300;
        if (c.enharmonic) cost += 50;
        if (!c.hasFifth) cost += 1;
        if (prevChord && !sameHarmony(prevChord, c)) cost += 1;
        // A seventh that does not move down by step would be an error: prefer a non-chord-tone reading
        rest.forEach((x, k) => {
          if (c.members[k] !== 'seventh') return;
          const q = maps[x.v].next.get(x.n.id);
          if (q && midi(q) !== midi(x.n) && !(midi(x.n) - midi(q) >= 1 && midi(x.n) - midi(q) <= 2)) cost += 8;
        });
      }
      if (!best || cost < best.cost) best = { cost, chord: c, enh: !!c?.enharmonic, removed, types };
    }
    if (best) {
      s.chord = best.chord;
      s.enharmonic = best.enh;
      let k = 0;
      sounding.forEach((x, i) => {
        if (best!.removed.has(i)) s.nct[x.v] = best!.types.get(i)!;
        else {
          s.member[x.v] = best!.chord ? best!.chord.members[k] : null;
          k++;
        }
      });
    }
    prevChord = s.chord;
  }
  return { slices, maps };
}

function buildHarmonies(slices: Slice[], main: Key): Harmony[] {
  const out: Harmony[] = [];
  for (const s of slices) {
    const last = out[out.length - 1];
    if (last && !s.silent && !last.silent && last.chord && s.chord && sameHarmony(last.chord, s.chord)) {
      last.last = s.index;
      last.end = s.end;
    } else if (last && s.silent && last.silent) {
      last.last = s.index;
      last.end = s.end;
    } else {
      out.push({ index: out.length, chord: s.chord, first: s.index, last: s.index, tick: s.tick, end: s.end, key: main, silent: s.silent });
    }
    s.harmony = out.length - 1;
  }
  return out;
}

/* ---------- Keys (modulations) ---------- */

function chordTonesFit(c: Chord, key: Key): boolean {
  const members: Member[] = ['root', 'third'];
  if (c.hasFifth) members.push('fifth');
  if (c.seventh) members.push('seventh');
  return members.every((m) => inKey(memberName(c, m), key));
}

function chromatic(c: Chord, key: Key): boolean {
  return !chordTonesFit(c, key);
}

/** Resolution of a dominant-like chord X to Y: 'authentic', 'deceptive', 'diminished' or null. */
export function resolution(x: Chord, y: Chord): 'authentic' | 'deceptive' | 'diminished' | null {
  const up = mod(y.root.step - x.root.step, 7);
  const semis = mod(pc(y.root) - pc(x.root), 12);
  if (x.quality === 'major' && (x.seventh === null || x.seventh === 'minor')) {
    if (up === 3 && semis === 5) return 'authentic';
    if (up === 1 && semis === 2 && (y.quality === 'minor' || y.quality === 'major')) return 'deceptive';
  }
  if (x.quality === 'diminished' && up === 1 && semis === 1) return 'diminished';
  return null;
}

/** Is X a dominant in the key (V, secondary dominant or dominant seventh chord)? */
export function isDominant(x: Chord, key: Key): boolean {
  if (x.quality === 'diminished') return x.seventh !== 'major';
  if (x.quality !== 'major') return false;
  if (isDom7(x)) return true;
  if (pc(x.root) === pc(degreeName(key, 4))) return true;
  return !inKey(memberName(x, 'third'), key);
}

/** Leading tone of a dominant chord (third; root of a diminished chord). */
export function leadingTonePc(x: Chord): number {
  return x.quality === 'diminished' ? pc(x.root) : pc(memberName(x, 'third'));
}

function closelyRelated(k: Key, main: Key): boolean {
  if (main.minor) {
    // III, iv, v, VI, VII
    const allowed: [number, boolean][] = [
      [2, false],
      [3, true],
      [4, true],
      [5, false],
      [6, false],
    ];
    return allowed.some(([d, minor]) => pc(degreeName(main, d)) === pc(k.tonic) && minor === k.minor);
  }
  const allowed: [number, boolean][] = [
    [1, true],
    [2, true],
    [3, false],
    [4, false],
    [5, true],
  ];
  return allowed.some(([d, minor]) => pc(degreeName(main, d)) === pc(k.tonic) && minor === k.minor);
}

function assignKeys(harmonies: Harmony[], main: Key, phraseEnds: number[]) {
  const phrases: Harmony[][] = [];
  let cur: Harmony[] = [];
  let endIdx = 0;
  const ends = [...phraseEnds].sort((a, b) => a - b);
  for (const h of harmonies) {
    while (endIdx < ends.length && h.tick >= ends[endIdx]) {
      if (cur.length) phrases.push(cur);
      cur = [];
      endIdx++;
    }
    if (!h.silent && h.chord) cur.push(h);
  }
  if (cur.length) phrases.push(cur);

  for (const ph of phrases) {
    if (ph.length < 2) continue;
    const x = ph[ph.length - 2].chord!;
    const y = ph[ph.length - 1].chord!;
    if (resolution(x, y) !== 'authentic' || y.seventh || (y.quality !== 'major' && y.quality !== 'minor')) continue;
    const target: Key = { tonic: y.root, minor: y.quality === 'minor' };
    if (sameKey(target, main) || !closelyRelated(target, main)) continue;
    const chromaticIdx = ph
      .map((h, i) => (chromatic(h.chord!, main) && chordTonesFit(h.chord!, target) ? i : -1))
      .filter((i) => i >= 0);
    const halfCadenceOnV = !target.minor && pc(target.tonic) === pc(degreeName(main, 4));
    if (chromaticIdx.length === 0 || (halfCadenceOnV && chromaticIdx.length < 2)) continue;
    const fits = (i: number) => {
      const c = ph[i].chord!;
      if (chordTonesFit(c, target)) return true;
      const next = ph[i + 1]?.chord;
      return !!next && resolution(c, next) !== null;
    };
    let start = -1;
    for (const c of chromaticIdx) {
      let ok = true;
      for (let i = c; i < ph.length; i++) if (!fits(i)) ok = false;
      if (ok) {
        start = c;
        break;
      }
    }
    if (start < 0) continue;
    if (start > 0 && chordTonesFit(ph[start - 1].chord!, main) && chordTonesFit(ph[start - 1].chord!, target)) start--;
    for (let i = start; i < ph.length; i++) ph[i].key = target;
  }
}

/* ---------- Check ---------- */

function name(v: number) {
  return VOICE_LABELS[v];
}

function pairName(a: number, b: number) {
  return `${name(a)} und ${name(b)}`;
}

const isP5 = (d: number, s: number) => mod(d, 7) === 4 && mod(s, 12) === 7;
const isP8 = (d: number, s: number) => mod(d, 7) === 0 && mod(s, 12) === 0;

/** Phrase ends: ends of fermata notes and starts of rests in the melody. */
export function phraseEnds(melody: SNote[]): number[] {
  const out = new Set<number>();
  for (const n of melody) {
    if (n.fermata) out.add(noteEndS(n));
    if (n.rest) out.add(n.start);
  }
  return Array.from(out);
}

export function analyse(voices: SNote[][], keyFifths: number): { slices: Slice[]; harmonies: Harmony[]; mainKey: Key; maps: VoiceIndexMap[] } {
  const mainKey = keyFromFifths(keyFifths, false);
  const { slices, maps } = buildSlices(voices);
  const harmonies = buildHarmonies(slices, mainKey);
  assignKeys(harmonies, mainKey, phraseEnds(voices[SOPRANO] ?? []));
  return { slices, harmonies, mainKey, maps };
}

export function checkSatz(input: CheckInput): CheckResult {
  const { voices, measures, mode } = input;
  const { slices, harmonies, mainKey, maps } = analyse(voices, input.keyFifths);
  const out: Violation[] = [];
  const seen = new Set<string>();
  const add = (v: Omit<Violation, 'tick'>, dedupe?: string) => {
    const key = dedupe ?? `${v.rule}:${v.notes.join(',')}:${v.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...v, tick: Math.min(...v.ticks) });
  };

  /* Parallels and hidden parallels */
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      let prev: Slice | null = null;
      let gapOk = true;
      for (const s of slices) {
        const na = s.notes[a];
        const nb = s.notes[b];
        if (!na || !nb) {
          if (na || nb) gapOk = false;
          continue;
        }
        if (prev && gapOk) {
          const a1 = prev.notes[a]!;
          const b1 = prev.notes[b]!;
          const movedA = midi(a1) !== midi(na);
          const movedB = midi(b1) !== midi(nb);
          if (movedA && movedB) {
            const d1 = dia(a1.pitch) - dia(b1.pitch);
            const s1 = midi(a1) - midi(b1);
            const d2 = dia(na.pitch) - dia(nb.pitch);
            const s2 = midi(na) - midi(nb);
            const same = Math.sign(midi(na) - midi(a1)) === Math.sign(midi(nb) - midi(b1));
            const notes = [a1.id, na.id, b1.id, nb.id];
            const lines: [string, string][] = [
              [a1.id, na.id],
              [b1.id, nb.id],
            ];
            const ticks = [prev.tick, s.tick];
            const how = same ? '' : ' (in Gegenbewegung)';
            if (isP5(d1, s1) && isP5(d2, s2)) {
              add({ rule: 'parallel-fifths', message: `Quintparallele zwischen ${pairName(a, b)}${how}.`, notes, lines, ticks });
            } else if (isP8(d1, s1) && isP8(d2, s2)) {
              const kind = s1 === 0 && s2 === 0 ? 'Primparallele' : 'Oktavparallele';
              add({ rule: 'parallel-octaves', message: `${kind} zwischen ${pairName(a, b)}${how}.`, notes, lines, ticks });
            } else if (a === SOPRANO && b === BASS && same && (isP5(d2, s2) || isP8(d2, s2))) {
              const leap = Math.abs(dia(na.pitch) - dia(a1.pitch)) > 1;
              const harmonyChange = s.harmony !== prev.harmony;
              if (leap && harmonyChange) {
                const kind = isP5(d2, s2) ? 'Verdeckte Quinte' : 'Verdeckte Oktave';
                add({
                  rule: 'hidden',
                  message: `${kind} zwischen Sopran und Bass: beide Stimmen gehen in die gleiche Richtung, der Sopran springt.`,
                  notes,
                  lines,
                  ticks,
                });
              }
            }
          }
        }
        prev = s;
        gapOk = true;
      }
    }
  }

  /* Crossing and spacing */
  /* Tenor–bass spacing is unrestricted */
  const maxGap = [12, 12, Infinity];
  for (const s of slices) {
    for (let v = 0; v < 3; v++) {
      const up = s.notes[v];
      const low = s.notes[v + 1];
      if (!up || !low) continue;
      if (midi(up) < midi(low)) {
        add(
          {
            rule: 'crossing',
            message: `${name(v + 1)} liegt höher als ${name(v)}.`,
            notes: [up.id, low.id],
            lines: [],
            ticks: [s.tick],
          },
          `crossing:${up.id}:${low.id}`,
        );
      } else if (midi(up) - midi(low) > maxGap[v]) {
        add(
          {
            rule: 'spacing',
            message: `Abstand zwischen ${pairName(v, v + 1)} größer als eine Oktave.`,
            notes: [up.id, low.id],
            lines: [],
            ticks: [s.tick],
          },
          `spacing:${up.id}:${low.id}`,
        );
      }
    }
  }

  /* Ranges */
  const ranges = RANGES[mode];
  voices.forEach((voice, v) => {
    for (const n of voice) {
      if (n.rest) continue;
      const [lo, hi] = ranges[v];
      const m = midi(n);
      if (m < lo || m > hi) {
        add({
          rule: 'range',
          message: `${name(v)} ${m < lo ? 'zu tief' : 'zu hoch'} für den ${mode === 'choir' ? 'Chorsatz' : 'Orgelsatz'}.`,
          notes: [n.id],
          lines: [],
          ticks: [n.start],
        });
      }
    }
  });

  /* Chords: allowed, non-chord tones */
  for (const s of slices) {
    if (s.silent) continue;
    const sounding = s.notes.filter((n): n is SNote => !!n);
    if (!s.chord) {
      const pcs = new Set(sounding.map((n) => mod(midi(n), 12)));
      if (pcs.size >= 2) {
        add(
          {
            rule: 'chord',
            message: 'Kein erlaubter Akkord: Die Töne ergeben keinen Drei- oder Septakkord (akkordfremde Töne nicht erklärbar).',
            notes: sounding.map((n) => n.id),
            lines: [],
            ticks: [s.tick],
          },
          `chord:${s.tick}`,
        );
      }
    } else if (!s.chord.allowed) {
      add(
        {
          rule: 'chord',
          message:
            s.chord.quality === 'augmented'
              ? 'Übermäßiger Dreiklang ist im Regelwerk nicht vorgesehen.'
              : 'Dieser Septakkord ist im Regelwerk nicht vorgesehen.',
          notes: sounding.map((n) => n.id),
          lines: [],
          ticks: [s.tick],
        },
        `chord:${s.tick}`,
      );
    }
    s.nct.forEach((t, v) => {
      if (t !== 'unprepared') return;
      const n = s.notes[v]!;
      add({
        rule: 'suspension',
        message: `Akkordfremder Ton im ${name(v)} ohne Vorbereitung: Ein Vorhalt muss in derselben Stimme vorbereitet sein.`,
        notes: [n.id],
        lines: [],
        ticks: [s.tick],
      });
    });
  }

  /* Harmonic progressions */
  const real = harmonies.filter((h) => !h.silent && h.chord);
  const harmonyNotes = (h: Harmony, which: 'first' | 'last') => slices[h[which]];
  const nextReal = (h: Harmony) => {
    const next = harmonies[h.index + 1];
    return next && !next.silent && next.chord ? next : null;
  };
  const prevReal = (h: Harmony) => {
    const prev = harmonies[h.index - 1];
    return prev && !prev.silent && prev.chord ? prev : null;
  };

  for (const h of real) {
    const x = h.chord!;
    const next = nextReal(h);
    const prev = prevReal(h);
    const lastS = harmonyNotes(h, 'last');
    const ticksOf = (hh: Harmony) => slices.slice(hh.first, hh.last + 1).map((s) => s.tick);

    // Leading tone in outer voices
    if (next && isDominant(x, h.key)) {
      const r = resolution(x, next.chord!);
      if (r) {
        const lt = leadingTonePc(x);
        const firstNext = harmonyNotes(next, 'first');
        for (const v of [SOPRANO, BASS]) {
          const n = lastS.notes[v];
          if (!n || lastS.member[v] === null || mod(midi(n), 12) !== lt) continue;
          const q = firstNext.notes[v];
          const ok = q && midi(q) === midi(n) + 1 && dia(q.pitch) === dia(n.pitch) + 1;
          if (!ok) {
            add({
              rule: 'leading-tone',
              message: `Leitton im ${name(v)} nicht aufgelöst: Er muss einen Halbton aufwärts gehen.`,
              notes: q ? [n.id, q.id] : [n.id],
              lines: q ? [[n.id, q.id]] : [],
              ticks: [lastS.tick, firstNext.tick],
            });
          }
        }
      }
    }

    // Seventh resolution and doubling of the seventh
    if (x.seventh) {
      for (let v = 0; v < 4; v++) {
        const n = lastS.notes[v];
        if (!n || lastS.member[v] !== 'seventh') continue;
        const firstNext = next ? harmonyNotes(next, 'first') : null;
        let q = firstNext?.notes[v] ?? null;
        // Delayed resolution: the seventh is held as a suspension over the next chord
        if (q && firstNext && firstNext.nct[v] === 'suspension') q = maps[v].next.get(q.id) ?? null;
        const down = q && midi(n) - midi(q) >= 1 && midi(n) - midi(q) <= 2 && dia(n.pitch) - dia(q.pitch) === 1;
        // Exception: seventh rises by step when the bass takes its resolution tone (e.g. V4/3 – I6)
        const nextBass = firstNext?.notes[BASS] ?? null;
        const bassTakes =
          !!q &&
          !!nextBass &&
          v !== BASS &&
          isStepPitch(n.pitch, q.pitch) &&
          dia(q.pitch) > dia(n.pitch) &&
          mod(dia(nextBass.pitch) - (dia(n.pitch) - 1), 7) === 0;
        if (!down && !bassTakes) {
          add({
            rule: 'seventh',
            message: `Septime im ${name(v)} nicht aufgelöst: Sie muss schrittweise abwärts gehen.`,
            notes: q ? [n.id, q.id] : [n.id],
            lines: q ? [[n.id, q.id]] : [],
            ticks: firstNext ? [lastS.tick, firstNext.tick] : [lastS.tick],
          });
        }
      }
    }

    // Doubling (per slice)
    for (let si = h.first; si <= h.last; si++) {
      const s = slices[si];
      const ids = (pcWanted: number, member?: Member) =>
        s.notes
          .map((n, v) => ({ n, v }))
          .filter(
            ({ n, v }) => n && s.member[v] !== null && mod(midi(n), 12) === pcWanted && (!member || s.member[v] === member),
          )
          .map(({ n }) => n!.id);
      if (x.seventh) {
        const sev = ids(pc(memberName(x, 'seventh')), 'seventh');
        if (sev.length > 1)
          add({ rule: 'doubling', message: 'Die Septime ist verdoppelt.', notes: sev, lines: [], ticks: [s.tick] }, `dbl7:${h.index}`);
      }
      if (isDominant(x, h.key)) {
        const lt = ids(leadingTonePc(x));
        if (lt.length > 1)
          add({ rule: 'doubling', message: 'Der Leitton ist verdoppelt.', notes: lt, lines: [], ticks: [s.tick] }, `dblLt:${h.index}`);
      }
    }

    // Completeness (over the whole harmony)
    if (!x.hasFifth) {
      const slicesOf = slices.slice(h.first, h.last + 1);
      const fifthPc = pc(memberName(x, 'fifth'));
      const hasFifth = slicesOf.some((s) => s.notes.some((n, v) => n && s.member[v] && mod(midi(n), 12) === fifthPc));
      const afterDominant = prev && isDominant(prev.chord!, prev.key) && resolution(prev.chord!, x) !== null;
      if (!hasFifth && !x.seventh && !afterDominant) {
        add({
          rule: 'complete',
          message: 'Akkord unvollständig: Die Quinte fehlt.',
          notes: slicesOf.flatMap((s) => s.notes.filter((n): n is SNote => !!n).map((n) => n.id)),
          lines: [],
          ticks: ticksOf(h),
        });
      }
    }

    // Six-four chords
    const firstS = harmonyNotes(h, 'first');
    const bassNote = firstS.notes[BASS];
    if (!x.seventh && bassNote && firstS.member[BASS] === 'fifth') {
      const pb = prev ? harmonyNotes(prev, 'last').notes[BASS] : null;
      const nb = next ? harmonyNotes(next, 'first').notes[BASS] : null;
      const nextChord = next?.chord ?? null;
      const cadential =
        !!nb &&
        !!nextChord &&
        mod(midi(nb), 12) === mod(midi(bassNote), 12) &&
        pc(nextChord.root) === mod(midi(bassNote), 12) &&
        nextChord.quality === 'major' &&
        (nextChord.seventh === null || nextChord.seventh === 'minor');
      const passing =
        !!pb && !!nb && isStepPitch(pb.pitch, bassNote.pitch) && isStepPitch(bassNote.pitch, nb.pitch) &&
        Math.sign(midi(bassNote) - midi(pb)) === Math.sign(midi(nb) - midi(bassNote));
      const pedal = !!pb && !!nb && mod(midi(pb), 12) === mod(midi(bassNote), 12) && mod(midi(nb), 12) === mod(midi(bassNote), 12);
      if (!cadential && !passing && !pedal) {
        add({
          rule: 'six-four',
          message: 'Quartsextakkord nur als Kadenz-, Durchgangs- oder Wechselquartsextakkord erlaubt.',
          notes: [bassNote.id],
          lines: [],
          ticks: [firstS.tick],
        });
      }
    }
  }

  /* Final chord */
  const lastH = input.fragment ? undefined : real[real.length - 1];
  if (lastH) {
    const c = lastH.chord!;
    const s = slices[lastH.first];
    const b = s.notes[BASS];
    const tonicPc = pc(mainKey.tonic);
    const notes = s.notes.filter((n): n is SNote => !!n).map((n) => n.id);
    if (pc(c.root) !== tonicPc || c.quality !== 'major' || c.seventh) {
      add({ rule: 'final', message: 'Der Satz muss mit der Tonika (Grundstellung) enden.', notes, lines: [], ticks: [s.tick] });
    } else if (!b || mod(midi(b), 12) !== tonicPc) {
      add({ rule: 'final', message: 'Der Schlussakkord steht nicht in Grundstellung: Der Bass muss auf dem Grundton enden.', notes: b ? [b.id] : notes, lines: [], ticks: [s.tick] });
    } else {
      const p = prevReal(lastH);
      const pc2 = p?.chord;
      const dominant = pc2 && pc(pc2.root) === pc(degreeName(mainKey, 4)) && pc2.quality === 'major';
      const leadingDim = pc2 && pc2.quality === 'diminished' && pc(pc2.root) === mod(tonicPc - 1, 12);
      const plagal = pc2 && pc(pc2.root) === pc(degreeName(mainKey, 3)) && !pc2.seventh;
      if (p && !dominant && !leadingDim && !plagal) {
        add({
          rule: 'final',
          message: 'Am Schluss fehlt die Kadenz: Vor der Tonika steht die Dominante (oder Subdominante).',
          notes: slices[p.last].notes.filter((n): n is SNote => !!n).map((n) => n.id),
          lines: [],
          ticks: [slices[p.last].tick, s.tick],
        });
      }
    }
  }

  /* Rhythm: every measure filled, rests only together with the soprano */
  const soprano = voices[SOPRANO] ?? [];
  for (const v of [ALTO, TENOR, BASS]) {
    const voice = voices[v] ?? [];
    measures.forEach((m, mi) => {
      const end = m.start + m.ticks;
      const covered = sortByStart(voice.filter((n) => n.start < end && noteEndS(n) > m.start));
      let pos = m.start;
      for (const n of covered) {
        if (n.start > pos) break;
        pos = Math.max(pos, noteEndS(n));
      }
      if (pos < end) {
        add({
          rule: 'rhythm',
          message: `Takt ${mi + (measures[0].ticks < (measures[1]?.ticks ?? 0) ? 0 : 1)}: ${name(v)} füllt den Takt nicht vollständig.`,
          notes: covered.map((n) => n.id),
          lines: [],
          ticks: [pos],
        });
      }
    });
    for (const r of voice.filter((n) => n.rest)) {
      const sung = soprano.find((s) => !s.rest && s.start < noteEndS(r) && noteEndS(s) > r.start);
      if (sung) {
        add({
          rule: 'rhythm',
          message: `Pause im ${name(v)}, obwohl der Sopran singt: Pausen nur dort, wo auch der Sopran pausiert.`,
          notes: [r.id],
          lines: [],
          ticks: [r.start],
        });
      }
    }
    for (const r of soprano.filter((n) => n.rest)) {
      const sung = voice.find((s) => !s.rest && s.start < noteEndS(r) && noteEndS(s) > r.start);
      if (sung) {
        add({
          rule: 'rhythm',
          message: `Der Sopran pausiert, aber der ${name(v)} singt: Dort pausieren alle Stimmen.`,
          notes: [sung.id],
          lines: [],
          ticks: [sung.start],
        });
      }
    }
  }

  out.sort((a, b) => a.tick - b.tick || RULE_IDS.indexOf(a.rule) - RULE_IDS.indexOf(b.rule));
  return { violations: out, slices, harmonies, mainKey };
}

function isStepPitch(a: Pitch, b: Pitch): boolean {
  const d = Math.abs(dia(b) - dia(a));
  const s = Math.abs(toMidi(b) - toMidi(a));
  return d === 1 && s >= 1 && s <= 2;
}

/** Ticks where all four voices have a note or rest. */
export function completeTicks(slices: Slice[]): Set<number> {
  return new Set(slices.filter((s) => s.complete).map((s) => s.tick));
}

/**
 * Final check: harmonic rules only where all four voices are present (gaps
 * are reported as rhythm errors); rhythm and range errors always.
 */
export function reportableViolations(r: CheckResult): Violation[] {
  const complete = completeTicks(r.slices);
  return r.violations.filter((v) => v.rule === 'rhythm' || v.rule === 'range' || v.ticks.every((t) => complete.has(t)));
}

/**
 * Direct mode: only violations whose positions are complete (all four voices
 * present); rhythm errors only at the final check.
 */
export function directViolations(r: CheckResult): Violation[] {
  const complete = completeTicks(r.slices);
  return r.violations.filter((v) => v.rule !== 'rhythm' && v.ticks.every((t) => complete.has(t)));
}

export function violationKey(v: Violation): string {
  return `${v.rule}|${v.ticks.join(',')}|${[...v.notes].sort().join(',')}`;
}

export { chordKey };
