import { describe, expect, it } from 'vitest';
import { germanName, toMidi } from '../music/pitch';
import { allVoicings, chordTones, isCorrectChordNaming, VOICE_RANGES } from '../music/chords';
import { answerChordMidi, makeChordTask } from '../music/tasks';

const P = (step: number, alter: number, octave: number) => ({ step, alter, octave });

describe('Chords', () => {
  it('spells chord tones correctly', () => {
    expect(chordTones(P(1, 1, 3), 'major').map((p) => germanName(p))).toEqual(['Dis', 'Fisis', 'Ais']);
    expect(chordTones(P(4, 1, 3), 'augmented').map((p) => germanName(p))).toEqual(['Gis', 'His', 'Disis']);
    expect(chordTones(P(6, 0, 3), 'diminished').map((p) => germanName(p))).toEqual(['H', 'D', 'F']);
    expect(chordTones(P(2, -1, 3), 'minor').map((p) => germanName(p))).toEqual(['Es', 'Ges', 'B']);
  });
  it('voicings: doubled root, bass according to inversion, ranges', () => {
    for (const inv of ['root', 'first', 'second'] as const) {
      const vs = allVoicings(P(4, 0, 3), 'major', inv);
      expect(vs.length).toBeGreaterThan(0);
      for (const v of vs) {
        const [s, a, t, b] = v.notes;
        const bassStep = { root: 4, first: 6, second: 1 }[inv];
        expect(b.step).toBe(bassStep);
        expect(v.notes.filter((n) => n.step === 4).length).toBeGreaterThanOrEqual(2);
        expect(toMidi(s)).toBeLessThanOrEqual(VOICE_RANGES.soprano[1]);
        expect(toMidi(b)).toBeGreaterThanOrEqual(VOICE_RANGES.bass[0]);
        expect(toMidi(s) > toMidi(a) && toMidi(a) > toMidi(t) && toMidi(t) > toMidi(b)).toBe(true);
      }
    }
  });
  it('random chords can always be generated', () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ['major', 'minor', 'diminished', 'augmented'] as const) {
        const t = makeChordTask(type, 'second');
        expect(Math.abs(t.root.alter)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('naming', () => {
    expect(isCorrectChordNaming([{ step: 6, alter: 1 }, { step: 1, alter: 2 }], P(4, 1, 3), 'augmented')).toBe(true);
    expect(isCorrectChordNaming([{ step: 0, alter: 0 }, { step: 1, alter: 2 }], P(4, 1, 3), 'augmented')).toBe(false);
  });
});

describe('Playing a wrong chord answer', () => {
  it('same root, chosen type and inversion', () => {
    for (let i = 0; i < 30; i++) {
      const task = makeChordTask('major', 'root');
      const m = answerChordMidi(task, 'minor', 'first');
      const pcs = new Set(chordTones(task.root, 'minor').map((p) => toMidi(p) % 12));
      expect(m.length).toBe(4);
      m.forEach((x) => expect(pcs.has(x % 12)).toBe(true));
      // bass = third of the minor chord
      expect(m[3] % 12).toBe(toMidi(chordTones(task.root, 'minor')[1]) % 12);
    }
  });
});
