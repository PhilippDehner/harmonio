import { describe, expect, it } from 'vitest';
import { germanName, keyAlter, keyTonic, toMidi } from '../music/pitch';
import { intervalById, isCorrectNaming, transpose, intervalFromShortcut, isShortcutPrefix } from '../music/intervals';
import { makeIntervalTask, adaptiveWeight, chooseAdaptive } from '../music/tasks';

const P = (step: number, alter: number, octave: number) => ({ step, alter, octave });

describe('Notennamen', () => {
  it('nutzt deutsche Namen mit H und B', () => {
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
  it('Tonarten', () => {
    expect(keyAlter(3, 1)).toBe(1);
    expect(keyAlter(6, -1)).toBe(-1);
    expect(germanName(keyTonic(-2, false))).toBe('B');
    expect(germanName(keyTonic(1, true))).toBe('E');
  });
});

describe('Intervall-Schreibweise', () => {
  it('von A aus große Terz = Cis', () => {
    expect(germanName(transpose(P(5, 0, 4), 2, 4))).toBe('Cis');
  });
  it('von Dis aus große Terz = Fisis', () => {
    expect(germanName(transpose(P(1, 1, 4), 2, 4))).toBe('Fisis');
  });
  it('abwärts: von C aus kleine Terz = A', () => {
    const r = transpose(P(0, 0, 5), 2, 3, false);
    expect(germanName(r)).toBe('A');
    expect(r.octave).toBe(4);
  });
  it('Oktavwechsel aufwärts', () => {
    const r = transpose(P(6, 0, 4), 1, 1);
    expect(r).toEqual(P(0, 0, 5));
  });
  it('Tritonus: beide Schreibweisen richtig', () => {
    const tt = intervalById('tt');
    expect(isCorrectNaming({ step: 3, alter: 1 }, P(0, 0, 4), tt, true)).toBe(true);
    expect(isCorrectNaming({ step: 4, alter: -1 }, P(0, 0, 4), tt, true)).toBe(true);
    expect(isCorrectNaming({ step: 4, alter: 0 }, P(0, 0, 4), tt, true)).toBe(false);
  });
  it('enharmonisch falsch ist falsch', () => {
    expect(isCorrectNaming({ step: 1, alter: -1 }, P(5, 0, 4), intervalById('g3'), true)).toBe(false);
  });
});

describe('Aufgaben', () => {
  it('bleibt im Tonumfang und hat korrekte Halbtöne', () => {
    for (let i = 0; i < 300; i++) {
      for (const mode of ['harmonisch', 'aufwaerts', 'abwaerts'] as const) {
        const iv = intervalById(['k2', 'tt', 'r8', 'g7'][i % 4]);
        const t = makeIntervalTask(iv, mode, [60, 72]);
        const a = toMidi(t.start);
        const b = toMidi(t.second);
        expect(Math.abs(b - a)).toBe(iv.semitones);
        expect(Math.min(a, b)).toBeGreaterThanOrEqual(60);
        expect(Math.max(a, b)).toBeLessThanOrEqual(72);
        expect(Math.abs(t.start.alter)).toBeLessThanOrEqual(1);
        expect(Math.abs(t.second.alter)).toBeLessThanOrEqual(2);
        if (mode === 'abwaerts') expect(b).toBeLessThan(a);
      }
    }
  });
  it('adaptive Gewichte bevorzugen häufige Fehler', () => {
    expect(adaptiveWeight({ correct: 0, wrong: 10 })).toBeGreaterThan(adaptiveWeight({ correct: 10, wrong: 0 }));
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      if (chooseAdaptive(['a', 'b'], { a: { correct: 0, wrong: 20 }, b: { correct: 20, wrong: 0 } }, true) === 'a') n++;
    }
    expect(n).toBeGreaterThan(1500);
  });
});

describe('Tastenkürzel', () => {
  it('erkennt Kürzel', () => {
    expect(intervalFromShortcut('3k', false)?.id).toBe('k3');
    expect(intervalFromShortcut('4', false)?.id).toBe('r4');
    expect(intervalFromShortcut('t', false)?.id).toBe('tt');
    expect(intervalFromShortcut('10g', false)).toBeUndefined();
    expect(intervalFromShortcut('10g', true)?.id).toBe('g10');
    expect(isShortcutPrefix('1', true)).toBe(true);
    expect(isShortcutPrefix('4', false)).toBe(false);
  });
});
