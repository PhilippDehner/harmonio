import { describe, expect, it } from 'vitest';
import { autoAnalysis, checkAnalysis, formatLabel, parseLabel } from '../satz/analysis';
import { buildSetting } from '../satz/notation';
import { checkSatz } from '../satz/rules';

// C: T  S  D7 T | (D7) to F (S), then D T
function setting(texts: [string, string, string, string], keyFifths = 0, fragment = false) {
  const s = buildSetting(texts);
  return checkSatz({ voices: s.voices, measures: s.measures, keyFifths, mode: 'choir', fragment });
}

const cadence = setting([
  'E5/q F5/q D5/q C5/q',
  'G4/q A4/q F4/q E4/q',
  'C4/q C4/q B3/q G3/q',
  'C3/q F3/q G3/q C3/q',
]);

describe('label parsing', () => {
  it('parses functions, degrees, bass and keys', () => {
    expect(parseLabel('D7_3')).toMatchObject({ theory: 'function', symbol: 'D', seventh: true, bass: 3 });
    expect(parseLabel('(D7)')).toMatchObject({ secondary: true, symbol: 'D' });
    expect(parseLabel('G: V7')).toMatchObject({ theory: 'degree', degree: 4, key: { tonic: { step: 4, alter: 0 }, minor: false } });
    expect(parseLabel('fis: t')).toMatchObject({ key: { tonic: { step: 3, alter: 1 }, minor: true } });
    expect(parseLabel('S65')).toMatchObject({ sixte: true });
    expect(parseLabel('D̸⁹₃')).toMatchObject({ symbol: 'Dv', ninth: true, bass: 3 });
    expect('error' in parseLabel('X7')).toBe(true);
  });
  it('formats labels', () => {
    expect(formatLabel('Dv9_3')).toBe('D̸⁹₃');
    expect(formatLabel('D7')).toBe('D⁷');
    expect(formatLabel('S65')).toBe('S⁵₆');
  });
});

describe('analysis check', () => {
  it('cadence without violations', () => {
    expect(cadence.violations.map((v) => v.message)).toEqual([]);
  });
  it('accepts right and rejects wrong labels', () => {
    const r = checkAnalysis(cadence, { 0: 'T', 24: 'S', 48: 'D', 72: 'T' });
    expect(r.map((x) => x.ok)).toEqual([true, true, false, true]);
    const r2 = checkAnalysis(cadence, { 0: 'I', 24: 'IV', 48: 'V7', 72: 'I' });
    expect(r2.every((x) => x.ok)).toBe(true);
    const r3 = checkAnalysis(cadence, { 24: 'Sp', 48: 'D_3' });
    expect(r3.map((x) => x.ok)).toEqual([false, false]);
  });
  it('automatic analysis', () => {
    expect(autoAnalysis(cadence).map((l) => l.function)).toEqual(['T', 'S', 'D7', 'T']);
    expect(autoAnalysis(cadence).map((l) => l.degree)).toEqual(['I', 'IV', 'V7', 'I']);
  });
  it('half cadence with double dominant', () => {
    const r = setting([
      'G4/q G4/q A4/q B4/q C5/q B4/q A4/q B4/h^',
      'E4/q E4/q F4/q G4/q G4/q G4/q F#4/q G4/h',
      'C4/q C4/q C4/q D4/q E4/q D4/q D4/q D4/h',
      'C3/q C3/q F3/q G3/q C3/q G3/q D3/q G2/h',
    ]);
    expect(autoAnalysis(r).map((l) => l.function)).toEqual(['T', 'S', 'D', 'T', 'D', 'DD', 'D']);
  });
  it('modulation to the relative minor', () => {
    const r = setting([
      'G4/h A4/q B4/q C5/q B4/q C5/h^',
      'E4/h F4/q D4/q E4/q G#4/q A4/h',
      'C4/h C4/q G3/q G3/q E4/q E4/h',
      'C3/h F3/q G2/q C3/q E3/q A2/h',
    ], 0, true);
    expect(r.violations.map((v) => v.message)).toEqual([]);
    const labels = autoAnalysis(r);
    expect(labels.map((l) => l.function)).toEqual(['T', 'S', 'D', 'a: tP', 'D', 't']);
    expect(checkAnalysis(r, { 96: '(D)', 120: 'Tp' }).map((x) => x.ok)).toEqual([false, false]);
    expect(checkAnalysis(r, { 120: '(D)', 144: 'Tp' }).map((x) => x.ok)).toEqual([true, true]);
    expect(checkAnalysis(r, { 120: 'D', 144: 't' }).map((x) => x.ok)).toEqual([true, true]);
  });
});
