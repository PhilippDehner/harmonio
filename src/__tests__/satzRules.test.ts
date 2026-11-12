import { describe, expect, it } from 'vitest';
import { buildSetting } from '../satz/notation';
import { checkSatz } from '../satz/rules';
import { identifyChord } from '../satz/theory';
import { parsePitch } from '../satz/notation';

function rules(texts: [string, string, string, string], keyFifths = 0, mode: 'choir' | 'organ' = 'choir') {
  const s = buildSetting(texts);
  const r = checkSatz({ voices: s.voices, measures: s.measures, keyFifths, mode });
  return r.violations.map((v) => v.rule);
}

describe('chord identification', () => {
  it('C major, a minor 7, G7 without fifth', () => {
    const c = identifyChord(['C3', 'G3', 'E4', 'C5'].map(parsePitch))!;
    expect(c.root).toEqual({ step: 0, alter: 0 });
    expect(c.quality).toBe('major');
    const g7 = identifyChord(['G2', 'F3', 'B3', 'G4'].map(parsePitch))!;
    expect(g7.seventh).toBe('minor');
    expect(g7.hasFifth).toBe(false);
    expect(identifyChord(['C3', 'D3'].map(parsePitch))).toBeNull();
  });
});

describe('rules', () => {
  const good: [string, string, string, string] = [
    'E5/h D5/h C5/h',
    'G4/h G4/h E4/h',
    'C4/h B3/h G3/h',
    'C3/h G2/h C3/h',
  ];
  it('correct cadence: no violations', () => {
    expect(rules(['E5/h D5/h C5/w', 'G4/h G4/h G4/w', 'C4/h B3/h E4/w', 'C3/h G2/h C3/w'])).toEqual([]);
  });
  it('parallel fifths', () => {
    expect(rules(['E5/h F5/h', 'G4/h A4/h', 'C4/h D4/h', 'C3/h D3/h'])).toContain('parallel-fifths');
  });
  it('parallel octaves', () => {
    expect(rules(['E5/h F5/h', 'G4/h A4/h', 'C4/h D4/h', 'C3/h D3/h'])).toContain('parallel-octaves');
  });
  void good;
});

import { RULE_INFO } from '../satz/ruleInfo';
import { parseVoice } from '../satz/notation';
import { durationTicks } from '../dictation/model';

describe('rule examples', () => {
  for (const info of RULE_INFO) {
    for (const kind of ['wrong', 'right'] as const) {
      it(`${info.id} ${kind}`, () => {
        const voices = info[kind].voices.map((t, v) => parseVoice(t, `${kind}${v}-`));
        const total = Math.max(...voices.flat().map((n) => n.start + durationTicks(n.dur)));
        const r = checkSatz({ voices, measures: [{ start: 0, ticks: total }], keyFifths: 0, mode: 'choir', fragment: info.fragment });
        const found = r.violations.map((v) => `${v.rule}: ${v.message}`);
        if (kind === 'right') expect(found).toEqual([]);
        else expect(r.violations.map((v) => v.rule)).toEqual([info.id]);
      });
    }
  }
});
