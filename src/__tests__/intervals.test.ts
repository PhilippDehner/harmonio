import { describe, expect, it } from 'vitest';
import { germanName, keyAlter, keyTonic, toMidi } from '../music/pitch';
import { intervalById, isCorrectNaming, transpose, intervalFromShortcut, isShortcutPrefix } from '../music/intervals';
import { makeIntervalTask, adaptiveWeight, chooseAdaptive } from '../music/tasks';

const P = (step: number, alter: number, octave: number) => ({ step, alter, octave });

describe('Note names', () => {
  it('uses German names with H and B', () => {
    expect(germanName({ step: 6, alter: 0 })).toBe('H');
    expect(germanName({ step: 6, alter: -1 })).toBe('B');
    expect(germanName({ step: 6, alter: -2 })).toBe('Heses');
    expect(germanName({ step: 2, alter: -1 })).toBe('Es');
    expect(germanName({ step: 2, alter: -2 })).toBe('Eses');
    expect(germanName({ step: 5, alter: -1 })).toBe('As');
    expect(germanName({ step: 0, alter: 1 })).toBe('Cis');
    expect(germanName({ step: 3, alter: 2 })).toBe('Fisis');
    expect(germanName({ step: 1, alter: -1 })).toBe('Des');
  });
  it('keys', () => {
    expect(keyAlter(3, 1)).toBe(1);
    expect(keyAlter(6, -1)).toBe(-1);
    expect(germanName(keyTonic(-2, false))).toBe('B');
    expect(germanName(keyTonic(1, true))).toBe('E');
  });
});

describe('Interval spelling', () => {
  it('major third above A = C sharp', () => {
    expect(germanName(transpose(P(5, 0, 4), 2, 4))).toBe('Cis');
  });
  it('major third above D sharp = F double sharp', () => {
    expect(germanName(transpose(P(1, 1, 4), 2, 4))).toBe('Fisis');
  });
  it('descending: minor third below C = A', () => {
    const r = transpose(P(0, 0, 5), 2, 3, false);
    expect(germanName(r)).toBe('A');
    expect(r.octave).toBe(4);
  });
  it('octave change ascending', () => {
    const r = transpose(P(6, 0, 4), 1, 1);
    expect(r).toEqual(P(0, 0, 5));
  });
  it('tritone: both spellings are correct', () => {
    const tt = intervalById('TT');
    expect(isCorrectNaming({ step: 3, alter: 1 }, P(0, 0, 4), tt, true)).toBe(true);
    expect(isCorrectNaming({ step: 4, alter: -1 }, P(0, 0, 4), tt, true)).toBe(true);
    expect(isCorrectNaming({ step: 4, alter: 0 }, P(0, 0, 4), tt, true)).toBe(false);
  });
  it('enharmonically wrong is wrong', () => {
    expect(isCorrectNaming({ step: 1, alter: -1 }, P(5, 0, 4), intervalById('M3'), true)).toBe(false);
  });
});

describe('Tasks', () => {
  it('stays within the range and has correct semitones', () => {
    for (let i = 0; i < 300; i++) {
      for (const mode of ['harmonic', 'ascending', 'descending'] as const) {
        const iv = intervalById(['m2', 'TT', 'P8', 'M7'][i % 4]);
        const t = makeIntervalTask(iv, mode, [60, 72]);
        const a = toMidi(t.start);
        const b = toMidi(t.second);
        expect(Math.abs(b - a)).toBe(iv.semitones);
        expect(Math.min(a, b)).toBeGreaterThanOrEqual(60);
        expect(Math.max(a, b)).toBeLessThanOrEqual(72);
        expect(Math.abs(t.start.alter)).toBeLessThanOrEqual(1);
        expect(Math.abs(t.second.alter)).toBeLessThanOrEqual(2);
        if (mode === 'descending') expect(b).toBeLessThan(a);
      }
    }
  });
  it('adaptive weights prefer frequent errors', () => {
    expect(adaptiveWeight({ correct: 0, wrong: 10 })).toBeGreaterThan(adaptiveWeight({ correct: 10, wrong: 0 }));
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      if (chooseAdaptive(['a', 'b'], { a: { correct: 0, wrong: 20 }, b: { correct: 20, wrong: 0 } }, true) === 'a') n++;
    }
    expect(n).toBeGreaterThan(1500);
  });
});

describe('Keyboard shortcuts', () => {
  it('recognizes shortcuts', () => {
    expect(intervalFromShortcut('3k', false)?.id).toBe('m3');
    expect(intervalFromShortcut('4', false)?.id).toBe('P4');
    expect(intervalFromShortcut('t', false)?.id).toBe('TT');
    expect(intervalFromShortcut('10g', false)).toBeUndefined();
    expect(intervalFromShortcut('10g', true)?.id).toBe('M10');
    expect(isShortcutPrefix('1', true)).toBe(true);
    expect(isShortcutPrefix('4', false)).toBe(false);
  });
});
