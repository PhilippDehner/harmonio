import { describe, expect, it } from 'vitest';
import { germanName, toMidi } from '../music/pitch';
import { allVoicings, chordTones, isCorrectChordNaming, VOICE_RANGES } from '../music/chords';
import { answerChordMidi, makeChordTask } from '../music/tasks';

const P = (step: number, alter: number, octave: number) => ({ step, alter, octave });

describe('Akkorde', () => {
  it('Akkordtöne korrekt geschrieben', () => {
    expect(chordTones(P(1, 1, 3), 'dur').map((p) => germanName(p))).toEqual(['Dis', 'Fisis', 'Ais']);
    expect(chordTones(P(4, 1, 3), 'uberm').map((p) => germanName(p))).toEqual(['Gis', 'His', 'Disis']);
    expect(chordTones(P(6, 0, 3), 'verm').map((p) => germanName(p))).toEqual(['H', 'D', 'F']);
    expect(chordTones(P(2, -1, 3), 'moll').map((p) => germanName(p))).toEqual(['Es', 'Ges', 'B']);
  });
  it('Lagen: Grundton verdoppelt, Bass gemäß Umkehrung, Umfänge', () => {
    for (const inv of ['grund', 'sext', 'quartsext'] as const) {
      const vs = allVoicings(P(4, 0, 3), 'dur', inv);
      expect(vs.length).toBeGreaterThan(0);
      for (const v of vs) {
        const [s, a, t, b] = v.notes;
        const bassStep = { grund: 4, sext: 6, quartsext: 1 }[inv];
        expect(b.step).toBe(bassStep);
        expect(v.notes.filter((n) => n.step === 4).length).toBeGreaterThanOrEqual(2);
        expect(toMidi(s)).toBeLessThanOrEqual(VOICE_RANGES.sopran[1]);
        expect(toMidi(b)).toBeGreaterThanOrEqual(VOICE_RANGES.bass[0]);
        expect(toMidi(s) > toMidi(a) && toMidi(a) > toMidi(t) && toMidi(t) > toMidi(b)).toBe(true);
      }
    }
  });
  it('zufällige Akkorde sind immer erzeugbar', () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ['dur', 'moll', 'verm', 'uberm'] as const) {
        const t = makeChordTask(type, 'quartsext');
        expect(Math.abs(t.root.alter)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('Benennung', () => {
    expect(isCorrectChordNaming([{ step: 6, alter: 1 }, { step: 1, alter: 2 }], P(4, 1, 3), 'uberm')).toBe(true);
    expect(isCorrectChordNaming([{ step: 0, alter: 0 }, { step: 1, alter: 2 }], P(4, 1, 3), 'uberm')).toBe(false);
  });
});

describe('Falsche Akkordantwort abspielen', () => {
  it('gleicher Grundton, gewählter Typ und Umkehrung', () => {
    for (let i = 0; i < 30; i++) {
      const task = makeChordTask('dur', 'grund');
      const m = answerChordMidi(task, 'moll', 'sext');
      const pcs = new Set(chordTones(task.root, 'moll').map((p) => toMidi(p) % 12));
      expect(m.length).toBe(4);
      m.forEach((x) => expect(pcs.has(x % 12)).toBe(true));
      // Bass = Terz des Mollakkords
      expect(m[3] % 12).toBe(toMidi(chordTones(task.root, 'moll')[1]) % 12);
    }
  });
});
