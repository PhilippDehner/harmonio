// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMusicXml } from '../dictation/musicxml';
import { DictationKind, durationTicks } from '../dictation/model';
import { countInClicks, cadenceChords } from '../dictation/playback';

const root = join(__dirname, '../../diktate');
const kinds: DictationKind[] = ['einstimmig', 'zweistimmig', 'vierstimmig'];

describe('Diktatsammlung', () => {
  for (const kind of kinds) {
    for (const file of readdirSync(join(root, kind))) {
      it(`${kind}/${file} ist vollständig und lückenlos`, () => {
        const d = parseMusicXml(readFileSync(join(root, kind, file), 'utf8'), { id: file, kind, number: 1 });
        const expectedVoices = { einstimmig: 1, zweistimmig: 2, vierstimmig: 4 }[kind];
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

describe('Wiedergabe', () => {
  it('Einzählen bei Auftakt: ganzer Takt plus Schläge bis zum Auftakt, jede Eins betont', () => {
    const d = parseMusicXml(readFileSync(join(root, 'einstimmig/01.musicxml'), 'utf8'), { id: 'x', kind: 'einstimmig', number: 1 });
    const clicks = countInClicks(d);
    // 3/4 mit Viertel-Auftakt: 3 + 2 Schläge
    expect(clicks.map((c) => c.accent)).toEqual([true, false, false, true, false]);
  });
  it('Einzählen bei Volltakt: ein Takt', () => {
    const d = parseMusicXml(readFileSync(join(root, 'einstimmig/02.musicxml'), 'utf8'), { id: 'x', kind: 'einstimmig', number: 1 });
    expect(countInClicks(d).length).toBe(4);
  });
  it('Kadenz hat vier vierstimmige Akkorde', () => {
    const c = cadenceChords(-1, false);
    expect(c.length).toBe(4);
    c.forEach((ch) => expect(ch.length).toBe(4));
    expect(c[0][0] % 12).toBe(5); // F im Bass
    expect(c[2][0] % 12).toBe(0); // C im Bass
  });
  it('Kadenz: I Oktavlage, IV Quintlage, V Terzlage, I Oktavlage', () => {
    for (const [fifths, minor] of [[0, false], [-1, false], [3, false], [-6, false], [0, true], [2, true]] as const) {
      const c = cadenceChords(fifths, minor);
      const tonicPc = c[0][0] % 12;
      expect(c[0][3] % 12).toBe(tonicPc); // I: Grundton im Sopran
      expect(c[1][3] % 12).toBe(tonicPc); // IV: Quinte (= Tonika) im Sopran
      expect(c[2][3] % 12).toBe((tonicPc + 11) % 12); // V: Terz (Leitton) im Sopran
      expect(c[3][3]).toBe(c[0][3]);
      // enge Lage: Oberstimmen innerhalb einer Oktave, aufsteigend
      c.forEach((ch) => {
        expect(ch[1] < ch[2] && ch[2] < ch[3]).toBe(true);
        expect(ch[3] - ch[1]).toBeLessThan(12);
      });
    }
  });
});
