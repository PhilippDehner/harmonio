// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSongXml, writeSongXml } from '../satz/musicxml';
import { checkSatz } from '../satz/rules';
import { transposeSong, transposedFifths } from '../satz/transpose';
import { DEFAULT_SATZ_TEMPO } from '../satz/model';

const files = readdirSync('tonsatz').filter((f) => f.endsWith('.musicxml'));

describe('bundled Tonsatz songs', () => {
  for (const f of files) {
    it(`${f}: parses, example solution follows all rules (choir and organ)`, () => {
      const song = parseSongXml(readFileSync(`tonsatz/${f}`, 'utf8'), f);
      expect(song.title).toMatch(/Übungsmelodie/);
      if (!song.solution) return;
      for (const mode of ['choir', 'organ'] as const) {
        const r = checkSatz({ voices: song.solution, measures: song.measures, keyFifths: song.keyFifths, mode });
        expect(r.violations.map((v) => `${v.tick}: ${v.message}`)).toEqual([]);
      }
    });
  }
  it('reads lyrics, pickup, ties, rests and fermatas', () => {
    const s1 = parseSongXml(readFileSync('tonsatz/01-morgenlied.musicxml', 'utf8'), 'a');
    expect(s1.melody.map((n) => n.lyric).slice(0, 4)).toEqual(['Wach', 'auf,', 'der', 'Mor -']);
    expect(s1.keyFifths).toBe(-3);
    expect(s1.melody.filter((n) => n.fermata).length).toBe(2);
    expect(s1.solution![1].some((n) => n.lyric)).toBe(false);
    const s2 = parseSongXml(readFileSync('tonsatz/02-abendweise.musicxml', 'utf8'), 'b');
    expect(s2.measures[0].ticks).toBe(24);
    expect(s2.beats).toBe(3);
    const s3 = parseSongXml(readFileSync('tonsatz/03-wanderlied.musicxml', 'utf8'), 'c');
    expect(s3.solution![1].some((n) => n.tie)).toBe(true);
    const s4 = parseSongXml(readFileSync('tonsatz/04-ruf.musicxml', 'utf8'), 'd');
    expect(s4.solution!.every((v) => v.some((n) => n.rest))).toBe(true);
    const s5 = parseSongXml(readFileSync('tonsatz/05-feierlich.musicxml', 'utf8'), 'e');
    expect(s5.solution).toBeNull();
  });
  it('round trip through the writer', () => {
    const s = parseSongXml(readFileSync('tonsatz/03-wanderlied.musicxml', 'utf8'), 'c');
    const xml = writeSongXml({ title: s.title, keyFifths: s.keyFifths, beats: s.beats, beatType: s.beatType, tempo: s.tempo ?? DEFAULT_SATZ_TEMPO, measures: s.measures, voices: s.solution!, analysis: { 0: 'T' } });
    const again = parseSongXml(xml, 'c');
    expect(again.solution!.map((v) => v.map((n) => [n.start, n.pitch, !!n.tie, !!n.rest]))).toEqual(
      s.solution!.map((v) => v.map((n) => [n.start, n.pitch, !!n.tie, !!n.rest])),
    );
  });
  it('rejects minor and wrong voice counts', () => {
    const xml = readFileSync('tonsatz/05-feierlich.musicxml', 'utf8').replace('<mode>major</mode>', '<mode>minor</mode>');
    expect(() => parseSongXml(xml, 'x')).toThrow(/Dur/);
  });
  it('transposes melody and key', () => {
    const s = parseSongXml(readFileSync('tonsatz/04-ruf.musicxml', 'utf8'), 'd');
    const t = transposeSong(s, { interval: 'M2', up: false });
    expect(t.keyFifths).toBe(-2);
    expect(t.melody[0].pitch).toEqual({ step: 6, alter: -1, octave: 4 });
    expect(transposedFifths(5, { interval: 'A1', up: true })).toBeNull();
    const r = checkSatz({ voices: t.solution!, measures: t.measures, keyFifths: t.keyFifths, mode: 'choir' });
    expect(r.violations).toEqual([]);
  });
});
