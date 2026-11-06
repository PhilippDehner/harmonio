import { clampA4, setA4 } from '../audio/tuning';
import { describe, expect, it } from 'vitest';
import { PitchHold, classifyVoice, detectPitch, freqToMidi, midiToFreq } from '../audio/pitchDetect';
import {
  describeIntonation,
  evaluateSung,
  expectedMidi,
  functionName,
  isCloseVoicing,
  keyFifthsOf,
  makePitchGivingTask,
  nearestNoteName,
  PitchGivingOptions,
  singOrder,
  sungPitch,
  sungStatus,
} from '../music/pitchGiving';
import { germanName, toMidi } from '../music/pitch';

const SR = 48000;

function tone(freq: number, n = 2048, harmonics = [1, 0.5, 0.3]): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++)
    buf[i] = harmonics.reduce((s, a, h) => s + 0.3 * a * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR), 0);
  return buf;
}

describe('Pitch detection', () => {
  it('detects fundamentals of male and female voices', () => {
    for (const f of [82.4, 110, 196, 220, 261.6, 440, 698.5, 880]) {
      const r = detectPitch(tone(f), SR);
      expect(r).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(r!.freq / f))).toBeLessThan(10);
    }
  });
  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull();
  });
  it('converts frequency and MIDI', () => {
    expect(freqToMidi(440)).toBeCloseTo(69);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });
  it('uses the configured concert pitch', () => {
    setA4(415);
    try {
      expect(midiToFreq(69)).toBeCloseTo(415);
      expect(freqToMidi(415)).toBeCloseTo(69);
      expect(evaluateSung(415, 69)).toMatchObject({ cents: 0, correct: true });
      expect(classifyVoice(415)).toBe('female');
      expect(classifyVoice(207.5)).toBe('male');
    } finally {
      setA4(440);
    }
  });
  it('clamps the concert pitch', () => {
    expect(clampA4(400)).toBe(410);
    expect(clampA4(460)).toBe(450);
    expect(clampA4(442.4)).toBe(442);
    expect(clampA4('x')).toBe(440);
  });
});

describe('Held note', () => {
  it('reports a note only after the hold time and only once', () => {
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
  it('reports the same note again after a pause', () => {
    const h = new PitchHold(300, 40);
    let count = 0;
    let t = 0;
    for (const voiced of [true, false, true]) {
      for (let i = 0; i < 15; i++, t += 40) if (h.push(t, voiced ? 261.6 : null) !== null) count++;
    }
    expect(count).toBe(2);
  });
  it('does not report a changing pitch', () => {
    const h = new PitchHold(300, 40);
    for (let t = 0, i = 0; t < 2000; t += 40, i++) expect(h.push(t, i % 2 ? 220 : 247)).toBeNull();
  });
});

describe('Pitch giving', () => {
  it('voice type from the sung-back A', () => {
    expect(classifyVoice(440)).toBe('female');
    expect(classifyVoice(430)).toBe('female');
    expect(classifyVoice(220)).toBe('male');
    expect(classifyVoice(110)).toBe('male');
  });
  it('only major and minor', () => {
    for (let i = 0; i < 100; i++) expect(['major', 'minor']).toContain(makePitchGivingTask().type);
  });
  it('expected octave per voice type', () => {
    const c4 = { step: 0, alter: 0, octave: 4 };
    expect(expectedMidi(c4, 0, 'male')).toBe(48);
    expect(expectedMidi(c4, 0, 'female')).toBe(60);
    expect(expectedMidi(c4, 3, 'female')).toBe(72);
    expect(expectedMidi(c4, 3, 'male')).toBe(60);
  });
  it('evaluation: cent deviation, wrong octave is a minor error', () => {
    const e = toMidi({ step: 5, alter: 0, octave: 3 }); // a = 220 Hz
    expect(evaluateSung(220, e)).toMatchObject({ cents: 0, octaveShift: 0, correct: true, octaveOk: true });
    expect(evaluateSung(440, e)).toMatchObject({ cents: 0, octaveShift: 1, correct: true, octaveOk: false });
    expect(sungStatus(evaluateSung(220, e))).toBe('ok');
    expect(sungStatus(evaluateSung(110, e))).toBe('octave');
    expect(sungStatus(evaluateSung(midiToFreq(e + 13), e))).toBe('wrong');
    expect(evaluateSung(midiToFreq(e + 0.3), e)).toMatchObject({ cents: 30, correct: true });
    expect(evaluateSung(midiToFreq(e - 0.7), e)).toMatchObject({ cents: -70, correct: false });
    expect(evaluateSung(midiToFreq(e + 2), e).correct).toBe(false);
  });
  it('note names', () => {
    expect(nearestNoteName(69)).toBe('A');
    expect(nearestNoteName(70)).toBe('B');
    expect(nearestNoteName(71.2)).toBe('H');
    expect(nearestNoteName(66)).toBe('Fis');
  });
  it('describes intonation', () => {
    expect(describeIntonation(0)).toBe('genau getroffen');
    expect(describeIntonation(12)).toBe('12 Cent zu hoch');
    expect(describeIntonation(-7)).toBe('7 Cent zu tief');
  });
  it('maps sung notes to the written octave', () => {
    const f3 = { step: 3, alter: 0, octave: 3 }; // f, MIDI 53
    const flatRoot = { step: 6, alter: -1, octave: 2 };
    const sharpRoot = { step: 1, alter: 0, octave: 3 };
    // correct note: written pitch
    expect(sungPitch(f3, evaluateSung(midiToFreq(53.1), 53), sharpRoot)).toEqual(f3);
    // sung an octave higher and a semitone too high: written octave, semitone up
    const up = sungPitch(f3, evaluateSung(midiToFreq(66), 53), sharpRoot);
    expect(toMidi(up)).toBe(54);
    expect(germanName(up)).toBe('Fis');
    expect(germanName(sungPitch(f3, evaluateSung(midiToFreq(54), 53), flatRoot))).toBe('Ges');
    expect(toMidi(sungPitch(f3, evaluateSung(midiToFreq(50), 53), sharpRoot))).toBe(50);
  });
});

describe('Singing order', () => {
  // C major, root position: soprano e'', alto c'', tenor g', bass c
  const root = { step: 0, alter: 0, octave: 3 };
  const voicing = {
    notes: [
      { step: 2, alter: 0, octave: 5 },
      { step: 0, alter: 0, octave: 5 },
      { step: 4, alter: 0, octave: 4 },
      { step: 0, alter: 0, octave: 3 },
    ] as [typeof root, typeof root, typeof root, typeof root],
  };
  it('sings bottom up or top down', () => {
    expect(singOrder(voicing, root, 'major', 'up')).toEqual([3, 2, 1, 0]);
    expect(singOrder(voicing, root, 'major', 'down')).toEqual([0, 1, 2, 3]);
  });
  it('sings both roots first (lower first), then fifth, then third', () => {
    expect(singOrder(voicing, root, 'major', 'function')).toEqual([3, 1, 2, 0]);
    expect(voicing.notes.map((p) => functionName(p, root, 'major'))).toEqual(['Terz', 'Grundton', 'Quinte', 'Grundton']);
  });
  it('covers every voice exactly once for random tasks', () => {
    for (let i = 0; i < 200; i++) {
      const t = makePitchGivingTask();
      const o = singOrder(t.voicing, t.root, t.type, 'function');
      expect([...o].sort()).toEqual([0, 1, 2, 3]);
      const names = o.map((vi) => functionName(t.voicing.notes[vi], t.root, t.type));
      expect(names).toEqual(['Grundton', 'Grundton', 'Quinte', 'Terz']);
    }
  });
});

describe('Pitch giving difficulty', () => {
  const opts = (o: Partial<PitchGivingOptions>): PitchGivingOptions => ({
    fewAccidentals: true,
    manyAccidentals: true,
    major: true,
    minor: true,
    wide: true,
    ...o,
  });
  it('key signature of a chord root', () => {
    expect(keyFifthsOf({ step: 0, alter: 0 }, false)).toBe(0); // C-Dur
    expect(keyFifthsOf({ step: 2, alter: -1 }, false)).toBe(-3); // Es-Dur
    expect(keyFifthsOf({ step: 1, alter: 1 }, true)).toBe(6); // dis-Moll
    expect(keyFifthsOf({ step: 1, alter: 1 }, false)).toBeNull(); // Dis-Dur
  });
  it('few accidentals, major only, close positions', () => {
    for (let i = 0; i < 300; i++) {
      const t = makePitchGivingTask(opts({ manyAccidentals: false, minor: false, wide: false }));
      expect(t.type).toBe('major');
      expect(Math.abs(keyFifthsOf(t.root, false)!)).toBeLessThanOrEqual(3);
      expect(isCloseVoicing(t.voicing)).toBe(true);
    }
  });
  it('many accidentals, minor only', () => {
    for (let i = 0; i < 300; i++) {
      const t = makePitchGivingTask(opts({ fewAccidentals: false, major: false }));
      expect(t.type).toBe('minor');
      const f = Math.abs(keyFifthsOf(t.root, true)!);
      expect(f).toBeGreaterThanOrEqual(4);
      expect(f).toBeLessThanOrEqual(7);
    }
  });
  it('every combination yields tasks', () => {
    for (const fewAccidentals of [true, false])
      for (const major of [true, false])
        for (const wide of [true, false])
          for (let i = 0; i < 50; i++)
            makePitchGivingTask(opts({ fewAccidentals, manyAccidentals: !fewAccidentals, major, minor: !major, wide }));
  });
});
