/**
 * Migration of stored data from the former German internal identifiers to
 * the current English ones. All mappings are idempotent: values that are
 * already current (or unknown) are kept as they are, so the migration can be
 * applied to every load and every import.
 */

const RANGES: Record<string, string> = { eng: 'narrow', mittel: 'medium', weit: 'wide' };

const INTERVAL_MODES: Record<string, string> = {
  harmonisch: 'harmonic',
  aufwaerts: 'ascending',
  abwaerts: 'descending',
};

const INPUT_MODES: Record<string, string> = { papier: 'paper', klaviatur: 'keyboard', notenblatt: 'score' };

const INTERVAL_IDS: Record<string, string> = {
  k2: 'm2', g2: 'M2', k3: 'm3', g3: 'M3', r4: 'P4', tt: 'TT', r5: 'P5',
  k6: 'm6', g6: 'M6', k7: 'm7', g7: 'M7', r8: 'P8', k9: 'm9', g9: 'M9',
  k10: 'm10', g10: 'M10', r11: 'P11', tt8: 'TT8', r12: 'P12', k13: 'm13',
  g13: 'M13', k14: 'm14', g14: 'M14', r15: 'P15',
};

const CHORD_TYPES: Record<string, string> = { dur: 'major', moll: 'minor', verm: 'diminished', uberm: 'augmented' };

const INVERSIONS: Record<string, string> = { grund: 'root', sext: 'first', quartsext: 'second' };

const DICTATION_KINDS: Record<string, string> = {
  einstimmig: 'monophonic',
  zweistimmig: 'two-part',
  vierstimmig: 'four-part',
};

const TOURS: Record<string, string> = { intervalle: 'intervals', akkorde: 'chords', diktat: 'dictation' };

function map(table: Record<string, string>, value: string): string {
  return table[value] ?? value;
}

/** Chord answer ID: "<type>" or "<type>-<inversion>". */
function chordId(id: string): string {
  const [type, inversion] = id.split('-');
  return inversion === undefined ? map(CHORD_TYPES, type) : `${map(CHORD_TYPES, type)}-${map(INVERSIONS, inversion)}`;
}

/** Dictation ID: "<kind>-<number>". */
function dictationId(id: string): string {
  const m = /^(einstimmig|zweistimmig|vierstimmig)-(.*)$/.exec(id);
  return m ? `${DICTATION_KINDS[m[1]]}-${m[2]}` : id;
}

function renameKeys<T>(obj: Record<string, T> | undefined, rename: (k: string) => string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj ?? {})) out[rename(k)] = v;
  return out;
}

type AnyRecord = Record<string, any>;

function migrateCounts(bucket: AnyRecord | undefined, rename: (k: string) => string): AnyRecord {
  const out: AnyRecord = {};
  for (const [id, c] of Object.entries(bucket ?? {})) {
    out[rename(id)] = c?.confusions ? { ...c, confusions: renameKeys(c.confusions, rename) } : c;
  }
  return out;
}

export function migrateSettings<T extends AnyRecord>(settings: T): T {
  const s: AnyRecord = { ...settings };
  if (typeof s.range === 'string') s.range = map(RANGES, s.range);
  if (typeof s.intervalMode === 'string') s.intervalMode = map(INTERVAL_MODES, s.intervalMode);
  if (typeof s.inputMode === 'string') s.inputMode = map(INPUT_MODES, s.inputMode);
  return s as T;
}

export function migrateStats<T extends AnyRecord>(stats: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [device, s] of Object.entries(stats ?? {})) {
    const intervals: AnyRecord = {};
    for (const [mode, bucket] of Object.entries(s.intervals ?? {})) {
      intervals[map(INTERVAL_MODES, mode)] = migrateCounts(bucket as AnyRecord, (k) => map(INTERVAL_IDS, k));
    }
    const chords: AnyRecord = {};
    for (const [level, bucket] of Object.entries(s.chords ?? {})) {
      chords[level] = migrateCounts(bucket as AnyRecord, chordId);
    }
    out[device] = { ...s, intervals, chords };
  }
  return out;
}

export function migrateDictations<T extends AnyRecord>(data: T): T {
  const attempts = (data.attempts ?? []).map((a: AnyRecord) => ({
    ...a,
    dictationId: dictationId(a.dictationId),
    mode: map(INPUT_MODES, a.mode),
  }));
  const progress: AnyRecord = {};
  for (const [id, p] of Object.entries((data.progress ?? {}) as AnyRecord)) {
    progress[dictationId(id)] = { ...p, dictationId: dictationId(p.dictationId), mode: map(INPUT_MODES, p.mode) };
  }
  return { ...data, attempts, progress };
}

export function migrateTours(tours: string[]): string[] {
  return Array.from(new Set((tours ?? []).map((t) => map(TOURS, t))));
}
