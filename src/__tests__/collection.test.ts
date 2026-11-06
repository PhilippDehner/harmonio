// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicXml } from '../dictation/musicxml';
import { DictationKind, durationTicks } from '../dictation/model';
import { countInClicks, cadenceChords } from '../dictation/playback';

const root = join(__dirname, '../../dictations');
const kinds: DictationKind[] = ['monophonic', 'two-part', 'four-part'];

describe('Dictation collection', () => {
  for (const kind of kinds) {
    for (const file of readdirSync(join(root, kind))) {
      it(`${kind}/${file} is complete and without gaps`, () => {
        const d = parseMusicXml(readFileSync(join(root, kind, file), 'utf8'), { id: file, kind, number: 1 });
        const expectedVoices = { monophonic: 1, 'two-part': 2, 'four-part': 4 }[kind];
        expect(d.voices.length).toBe(expectedVoices);
        for (const v of d.voices) {
          for (const m of d.measures) {
            const sum = v.filter((n) => n.start >= m.start && n.start < m.start + m.ticks).reduce((s, n) => s + durationTicks(n.dur), 0);
            expect(sum).toBe(m.ticks);
          }
        }
      });
    }
  }
});

describe('Playback', () => {
  it('count-in with pickup: full measure plus beats up to the pickup, every downbeat accented', () => {
    const d = parseMusicXml(readFileSync(join(root, 'monophonic/01.musicxml'), 'utf8'), { id: 'x', kind: 'monophonic', number: 1 });
    const clicks = countInClicks(d);
    // 3/4 with quarter pickup: 3 + 2 beats
    expect(clicks.map((c) => c.accent)).toEqual([true, false, false, true, false]);
  });
  it('count-in without pickup: one measure', () => {
    const d = parseMusicXml(readFileSync(join(root, 'monophonic/02.musicxml'), 'utf8'), { id: 'x', kind: 'monophonic', number: 1 });
    expect(countInClicks(d).length).toBe(4);
  });
  it('cadence has four four-part chords', () => {
    const c = cadenceChords(-1, false);
    expect(c.length).toBe(4);
    c.forEach((ch) => expect(ch.length).toBe(4));
    expect(c[0][0] % 12).toBe(5); // F in the bass
    expect(c[2][0] % 12).toBe(0); // C in the bass
  });
  it('cadence: I octave, IV fifth, V third, I octave on top', () => {
    for (const [fifths, minor] of [[0, false], [-1, false], [3, false], [-6, false], [0, true], [2, true]] as const) {
      const c = cadenceChords(fifths, minor);
      const tonicPc = c[0][0] % 12;
      expect(c[0][3] % 12).toBe(tonicPc); // I: root in the soprano
      expect(c[1][3] % 12).toBe(tonicPc); // IV: fifth (= tonic) in the soprano
      expect(c[2][3] % 12).toBe((tonicPc + 11) % 12); // V: third (leading tone) in the soprano
      expect(c[3][3]).toBe(c[0][3]);
      // close position: upper voices within an octave, ascending
      c.forEach((ch) => {
        expect(ch[1] < ch[2] && ch[2] < ch[3]).toBe(true);
        expect(ch[3] - ch[1]).toBeLessThan(12);
      });
    }
  });
});
