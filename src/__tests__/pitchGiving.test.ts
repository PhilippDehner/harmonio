import { describe, expect, it } from 'vitest';
import { PitchHold, classifyVoice, detectPitch, freqToMidi, midiToFreq } from '../audio/pitchDetect';
import { evaluateSung, expectedMidi, makePitchGivingTask, nearestNoteName } from '../music/pitchGiving';
import { toMidi } from '../music/pitch';

const SR = 48000;

function tone(freq: number, n = 2048, harmonics = [1, 0.5, 0.3]): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++)
    buf[i] = harmonics.reduce((s, a, h) => s + 0.3 * a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR), 0);
  return buf;
}

describe('Tonhöhenerkennung', () => {
  it('erkennt Grundfrequenzen von Männer- und Frauenstimmen', () => {
    for (const f of [82.4, 110, 196, 220, 261.6, 440, 698.5, 880]) {
      const r = detectPitch(tone(f), SR);
      expect(r).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(r!.freq / f))).toBeLessThan(10);
    }
  });
  it('Stille ergibt keine Tonhöhe', () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull();
  });
  it('Umrechnung Frequenz/MIDI', () => {
    expect(freqToMidi(440)).toBeCloseTo(69);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });
});

describe('Gehaltener Ton', () => {
  it('meldet einen Ton erst nach der Haltedauer und nur einmal', () => {
    const h = new PitchHold(600, 40);
    let found: number | null = null;
    for (let t = 0; t <= 1500; t += 40) {
      const r = h.push(t, 220 * (1 + 0.002 * Math.sin(t)));
      if (r !== null) {
        expect(found).toBeNull();
        expect(t).toBeGreaterThanOrEqual(600);
        found = r;
      }
    }
    expect(found).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(found! / 220))).toBeLessThan(10);
  });
  it('gleicher Ton nach Pause wird erneut gemeldet', () => {
    const h = new PitchHold(300, 40);
    let count = 0;
    let t = 0;
    for (const voiced of [true, false, true]) {
      for (let i = 0; i < 15; i++, t += 40) if (h.push(t, voiced ? 261.6 : null) !== null) count++;
    }
    expect(count).toBe(2);
  });
  it('wechselnde Tonhöhe wird nicht gemeldet', () => {
    const h = new PitchHold(300, 40);
    for (let t = 0, i = 0; t < 2000; t += 40, i++) expect(h.push(t, i % 2 ? 220 : 247)).toBeNull();
  });
});

describe('Tonangabe', () => {
  it('Stimmlage aus nachgesungenem A', () => {
    expect(classifyVoice(440)).toBe('frau');
    expect(classifyVoice(430)).toBe('frau');
    expect(classifyVoice(220)).toBe('mann');
    expect(classifyVoice(110)).toBe('mann');
  });
  it('nur Dur und Moll', () => {
    for (let i = 0; i < 100; i++) expect(['dur', 'moll']).toContain(makePitchGivingTask().type);
  });
  it('erwartete Oktave je Stimmlage', () => {
    const c4 = { step: 0, alter: 0, octave: 4 };
    expect(expectedMidi(c4, 0, 'mann')).toBe(48);
    expect(expectedMidi(c4, 0, 'frau')).toBe(60);
    expect(expectedMidi(c4, 3, 'frau')).toBe(72);
    expect(expectedMidi(c4, 3, 'mann')).toBe(60);
  });
  it('Bewertung: Cent-Abweichung, Oktave zählt nicht als Fehler', () => {
    const e = toMidi({ step: 5, alter: 0, octave: 3 }); // a = 220 Hz
    expect(evaluateSung(220, e)).toMatchObject({ cents: 0, octaveShift: 0, correct: true });
    expect(evaluateSung(440, e)).toMatchObject({ cents: 0, octaveShift: 1, correct: true });
    expect(evaluateSung(midiToFreq(e + 0.3), e)).toMatchObject({ cents: 30, correct: true });
    expect(evaluateSung(midiToFreq(e - 0.7), e)).toMatchObject({ cents: -70, correct: false });
    expect(evaluateSung(midiToFreq(e + 2), e).correct).toBe(false);
  });
  it('Notennamen', () => {
    expect(nearestNoteName(69)).toBe('A');
    expect(nearestNoteName(70)).toBe('B');
    expect(nearestNoteName(71.2)).toBe('H');
    expect(nearestNoteName(66)).toBe('Fis');
  });
});
