// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ExportFile, aggregateStats, mergeData } from '../storage/store';

const empty = { intervals: {}, chords: {}, naming: { intervals: { correct: 0, wrong: 0 }, chords: { correct: 0, wrong: 0 } } };

describe('Export und Import', () => {
  const current = {
    settings: { ...DEFAULT_SETTINGS, range: 'eng' as const },
    stats: { devA: { ...empty, updated: 10, intervals: { aufwaerts: { k3: { correct: 2, wrong: 1 } } } } },
    dictations: {
      attempts: [{ id: 'a1', dictationId: 'einstimmig-1', date: 5, mode: 'papier' as const, pitchErrors: null, rhythmErrors: null, followErrors: null, input: null }],
      progress: { 'einstimmig-2': { dictationId: 'einstimmig-2', updated: 100, mode: 'notenblatt' as const, input: [], position: 3, introPlayed: true } },
    },
    tours: ['intervalle'],
  };
  const incoming: ExportFile = {
    app: 'harmonio',
    version: 1,
    exported: '',
    settings: { ...DEFAULT_SETTINGS, range: 'weit' },
    stats: {
      devA: { ...empty, updated: 5, intervals: { aufwaerts: { k3: { correct: 1, wrong: 0 } } } },
      devB: { ...empty, updated: 7, intervals: { aufwaerts: { k3: { correct: 4, wrong: 0 } } } },
    },
    dictations: {
      attempts: [
        current.dictations.attempts[0],
        { id: 'a2', dictationId: 'einstimmig-3', date: 6, mode: 'papier', pitchErrors: null, rhythmErrors: null, followErrors: null, input: null },
      ],
      progress: { 'einstimmig-2': { dictationId: 'einstimmig-2', updated: 50, mode: 'papier', input: [], position: 0, introPlayed: false } },
    },
    tours: ['diktat'],
  };

  it('führt Daten zusammen', () => {
    const m = mergeData(current, incoming);
    expect(m.settings.range).toBe('weit');
    expect(m.dictations.attempts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(m.dictations.progress['einstimmig-2'].updated).toBe(100);
    expect(m.tours.sort()).toEqual(['diktat', 'intervalle']);
    // devA: eigener (neuerer) Stand bleibt, devB kommt dazu → keine Doppelzählung
    expect(aggregateStats(m.stats).intervals.aufwaerts.k3).toMatchObject({ correct: 6, wrong: 1 });
  });

  it('erneuter Import derselben Datei zählt nichts doppelt', () => {
    const once = mergeData(current, incoming);
    const twice = mergeData(once, incoming);
    expect(aggregateStats(twice.stats)).toEqual(aggregateStats(once.stats));
    expect(twice.dictations.attempts.length).toBe(2);
  });
});
