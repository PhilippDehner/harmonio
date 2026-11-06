// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ExportFile, aggregateStats, mergeData, migrateExport } from '../storage/store';

const empty = { intervals: {}, chords: {}, naming: { intervals: { correct: 0, wrong: 0 }, chords: { correct: 0, wrong: 0 } } };

describe('Export and import', () => {
  const current = {
    settings: { ...DEFAULT_SETTINGS, range: 'narrow' as const },
    stats: { devA: { ...empty, updated: 10, intervals: { ascending: { m3: { correct: 2, wrong: 1 } } } } },
    dictations: {
      attempts: [{ id: 'a1', dictationId: 'monophonic-1', date: 5, mode: 'paper' as const, pitchErrors: null, rhythmErrors: null, followErrors: null, input: null }],
      progress: { 'monophonic-2': { dictationId: 'monophonic-2', updated: 100, mode: 'score' as const, input: [], position: 3, introPlayed: true } },
    },
    tours: ['intervals'],
  };
  const incoming: ExportFile = {
    app: 'harmonio',
    version: 1,
    exported: '',
    settings: { ...DEFAULT_SETTINGS, range: 'wide' },
    stats: {
      devA: { ...empty, updated: 5, intervals: { ascending: { m3: { correct: 1, wrong: 0 } } } },
      devB: { ...empty, updated: 7, intervals: { ascending: { m3: { correct: 4, wrong: 0 } } } },
    },
    dictations: {
      attempts: [
        current.dictations.attempts[0],
        { id: 'a2', dictationId: 'monophonic-3', date: 6, mode: 'paper', pitchErrors: null, rhythmErrors: null, followErrors: null, input: null },
      ],
      progress: { 'monophonic-2': { dictationId: 'monophonic-2', updated: 50, mode: 'paper', input: [], position: 0, introPlayed: false } },
    },
    tours: ['dictation'],
  };

  it('merges data', () => {
    const m = mergeData(current, incoming);
    expect(m.settings.range).toBe('wide');
    expect(m.dictations.attempts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(m.dictations.progress['monophonic-2'].updated).toBe(100);
    expect(m.tours.sort()).toEqual(['dictation', 'intervals']);
    // devA: own (newer) state is kept, devB is added → no double counting
    expect(aggregateStats(m.stats).intervals.ascending.m3).toMatchObject({ correct: 6, wrong: 1 });
  });

  it('importing the same file again counts nothing twice', () => {
    const once = mergeData(current, incoming);
    const twice = mergeData(once, incoming);
    expect(aggregateStats(twice.stats)).toEqual(aggregateStats(once.stats));
    expect(twice.dictations.attempts.length).toBe(2);
  });
});

describe('Migration of former German identifiers', () => {
  const old = {
    app: 'harmonio',
    version: 1,
    exported: '',
    settings: { ...DEFAULT_SETTINGS, range: 'eng', intervalMode: 'abwaerts', inputMode: 'klaviatur' },
    stats: {
      devA: {
        ...empty,
        updated: 1,
        intervals: { aufwaerts: { k3: { correct: 2, wrong: 1, confusions: { g3: 1 } }, tt: { correct: 1, wrong: 0 } } },
        chords: { '1': { uberm: { correct: 1, wrong: 0 } }, '2': { 'dur-sext': { correct: 0, wrong: 1, confusions: { 'moll-quartsext': 1 } } } },
      },
    },
    dictations: {
      attempts: [{ id: 'a1', dictationId: 'vierstimmig-2', date: 5, mode: 'papier', pitchErrors: null, rhythmErrors: null, followErrors: null, input: null }],
      progress: { 'zweistimmig-1': { dictationId: 'zweistimmig-1', updated: 9, mode: 'notenblatt', input: [], position: 0, introPlayed: false } },
    },
    tours: ['intervalle', 'akkorde', 'diktat'],
  } as unknown as ExportFile;

  it('renames all stored values', () => {
    const m = migrateExport(old);
    expect(m.settings).toMatchObject({ range: 'narrow', intervalMode: 'descending', inputMode: 'keyboard' });
    expect(m.stats.devA.intervals).toEqual({
      ascending: { m3: { correct: 2, wrong: 1, confusions: { M3: 1 } }, TT: { correct: 1, wrong: 0 } },
    });
    expect(m.stats.devA.chords).toEqual({
      '1': { augmented: { correct: 1, wrong: 0 } },
      '2': { 'major-first': { correct: 0, wrong: 1, confusions: { 'minor-second': 1 } } },
    });
    expect(m.dictations.attempts[0]).toMatchObject({ dictationId: 'four-part-2', mode: 'paper' });
    expect(m.dictations.progress['two-part-1']).toMatchObject({ dictationId: 'two-part-1', mode: 'score' });
    expect(m.tours).toEqual(['intervals', 'chords', 'dictation']);
  });

  it('is idempotent', () => {
    const once = migrateExport(old);
    expect(migrateExport(once)).toEqual(once);
  });
});
