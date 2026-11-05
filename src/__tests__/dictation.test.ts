// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { evaluateVoice, evaluateChorale } from '../dictation/evaluate';
import { changeDuration, insertNote, distributeChorale } from '../dictation/editing';
import { parseMusicXml } from '../dictation/musicxml';
import { DNote, Duration, durationTicks, restsInMeasure } from '../dictation/model';

const q: Duration = { base: 'q', dotted: false, triplet: false };
const h: Duration = { base: 'h', dotted: false, triplet: false };
const P = (step: number, alter = 0, octave = 4) => ({ step, alter, octave });
function melody(steps: number[], dur: Duration = q, prefix = 's'): DNote[] {
  return steps.map((s, i) => ({ id: `${prefix}${i}`, start: i * durationTicks(dur), dur, pitch: P(s) }));
}

describe('Auswertung', () => {
  it('alles richtig', () => {
    const r = evaluateVoice(melody([0, 1, 2, 3]), melody([0, 1, 2, 3], q, 'u'));
    expect(r.pitchErrors + r.followErrors + r.rhythmErrors).toBe(0);
  });
  it('Folgefehler: ab einer Stelle alles eine Terz verschoben', () => {
    const r = evaluateVoice(melody([0, 1, 2, 3, 4]), melody([0, 1, 4, 5, 6], q, 'u'));
    expect(r.notes.map((n) => n.pitch)).toEqual(['ok', 'ok', 'error', 'follow', 'follow']);
    expect(r.pitchErrors).toBe(1);
    expect(r.followErrors).toBe(2);
  });
  it('Rückkehr zur richtigen Tonhöhe ist richtig', () => {
    const r = evaluateVoice(melody([0, 1, 2, 3]), melody([0, 2, 2, 3], q, 'u'));
    expect(r.notes.map((n) => n.pitch)).toEqual(['ok', 'error', 'ok', 'ok']);
  });
  it('einzelner falscher Ton ohne Folgefehler', () => {
    const r = evaluateVoice(melody([0, 1, 2, 3]), melody([0, 1, 5, 3], q, 'u'));
    expect(r.notes.map((n) => n.pitch)).toEqual(['ok', 'ok', 'error', 'ok']);
  });
  it('falsches Vorzeichen ist ein Tonhöhenfehler', () => {
    const sol = melody([0, 1, 2]);
    const inp = melody([0, 1, 2], q, 'u');
    inp[2] = { ...inp[2], pitch: P(2, -1) };
    expect(evaluateVoice(sol, inp).pitchErrors).toBe(1);
  });
  it('Rhythmusfehler: Halbe statt zwei Viertel', () => {
    const sol = melody([0, 0, 2]);
    const inp: DNote[] = [
      { id: 'u0', start: 0, dur: h, pitch: P(0) },
      { id: 'u1', start: 48, dur: q, pitch: P(2) },
    ];
    const r = evaluateVoice(sol, inp);
    expect(r.notes.map((n) => n.rhythmError)).toEqual([true, false]);
    expect(r.rhythmErrors).toBe(1);
    expect(r.pitchErrors).toBe(0);
  });
  it('fehlende Noten zählen als Rhythmusfehler', () => {
    const r = evaluateVoice(melody([0, 1, 2, 3]), melody([0, 1], q, 'u'));
    expect(r.missing.length).toBe(2);
    expect(r.rhythmErrors).toBe(2);
  });
  it('vierstimmig: Folgefehler pro Stimme', () => {
    const whole: Duration = { base: 'w', dotted: false, triplet: false };
    const mk = (pitches: number[][], pre: string) =>
      [0, 1, 2, 3].map((v) => pitches.map((c, i) => ({ id: `${pre}${i}${v}`, start: i * 96, dur: whole, pitch: P(c[v], 0, 4 - Math.floor(v / 2)) })));
    const sol = mk([[4, 2, 0, 0], [5, 3, 0, 3], [4, 2, 0, 0]], 's');
    const inp = mk([[4, 2, 0, 0], [6, 3, 0, 3], [5, 2, 0, 0]], 'u');
    const r = evaluateChorale(sol, inp);
    expect(r[0].notes.map((n) => n.pitch)).toEqual(['ok', 'error', 'follow']);
    expect(r[1].pitchErrors).toBe(0);
  });
});

describe('Bearbeitung', () => {
  const measures = [{ start: 0, ticks: 96 }, { start: 96, ticks: 96 }];
  it('verhindert Noten über den Taktstrich', () => {
    const r = insertNote([], measures, 72, h, P(0));
    expect(r.ok).toBe(false);
  });
  it('ersetzt überlappende Noten', () => {
    const r1 = insertNote([], measures, 0, q, P(0));
    if (!r1.ok) throw new Error();
    const r2 = insertNote(r1.notes, measures, 24, q, P(1));
    if (!r2.ok) throw new Error();
    const r3 = insertNote(r2.notes, measures, 0, h, P(2));
    if (!r3.ok) throw new Error();
    expect(r3.notes.length).toBe(1);
  });
  it('verteilt Oberstimmen nach Tonhöhe', () => {
    const v = distributeChorale([[P(0, 0, 4), P(4, 0, 4), P(2, 0, 4)]], [P(0, 0, 3)], [{ start: 0, ticks: 96 }], false);
    expect(v.map((x) => x[0].pitch.step)).toEqual([4, 2, 0, 0]);
  });
});

describe('MusicXML', () => {
  const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list>
  <part id="P1">
   <measure number="0" implicit="yes"><attributes><divisions>2</divisions><key><fifths>1</fifths><mode>major</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
     <direction><sound tempo="90"/></direction>
     <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note></measure>
   <measure number="1">
     <note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration><type>quarter</type><dot/></note>
     <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
     <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note></measure>
  </part></score-partwise>`;
  it('liest Auftakt, Tonart, Takt, Tempo und Noten', () => {
    const d = parseMusicXml(xml, { id: 'x', kind: 'einstimmig', number: 1 });
    expect(d.keyFifths).toBe(1);
    expect(d.beats).toBe(3);
    expect(d.tempo).toBe(90);
    expect(d.measures).toEqual([{ start: 0, ticks: 24 }, { start: 24, ticks: 72 }]);
    expect(d.voices.length).toBe(1);
    expect(d.voices[0].map((n) => n.start)).toEqual([0, 24, 60, 72]);
    expect(d.voices[0][2].pitch).toEqual({ step: 3, alter: 1, octave: 4 });
  });
});

describe('restsInMeasure', () => {
  const m = { start: 96, ticks: 96 };
  const pitch = P(0);
  it('leerer Takt erhält Ganztaktpause', () => {
    const r = restsInMeasure([], m);
    expect(r).toHaveLength(1);
    expect(r[0].wholeMeasure).toBe(true);
  });
  it('füllt den Rest nach einer Viertel mit Viertel- und Halber Pause', () => {
    const r = restsInMeasure([{ id: 'a', start: 96, dur: q, pitch }], m);
    expect(r.map((x) => [x.start, x.dur.base])).toEqual([
      [120, 'q'],
      [144, 'h'],
    ]);
  });
  it('füllt Lücken vor und zwischen Noten', () => {
    const r = restsInMeasure([{ id: 'a', start: 144, dur: q, pitch }], m);
    expect(r.map((x) => [x.start, x.dur.base])).toEqual([
      [96, 'h'],
      [168, 'q'],
    ]);
  });
});

describe('changeDuration', () => {
  const measures = [{ start: 0, ticks: 96 }];
  it('verlängert eine Note und ersetzt überlappende', () => {
    const notes = melody([0, 1, 2, 3]);
    const r = changeDuration(notes, measures, 's0', h);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.id).toBe('s0');
      expect(r.notes.map((n) => n.id)).toEqual(['s0', 's2', 's3']);
    }
  });
  it('lehnt Überschreiten des Taktes ab', () => {
    const notes = melody([0, 1, 2, 3]);
    expect(changeDuration(notes, measures, 's3', h).ok).toBe(false);
  });
});
