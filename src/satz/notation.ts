import { BaseValue, Duration, Measure, durationTicks, measureTicks } from '../dictation/model';
import { Pitch } from '../music/pitch';
import { REST_PITCH, SNote } from './model';

const STEPS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6, H: 6 };

/** Parses a pitch like "C4", "F#3", "Bb2", "Ebb4" (English letters, scientific octave). */
export function parsePitch(s: string): Pitch {
  const m = /^([A-Ha-h])(#{1,2}|b{1,2})?(-?\d)$/.exec(s.trim());
  if (!m) throw new Error(`Ungültige Tonhöhe: ${s}`);
  const acc = m[2] ?? '';
  const alter = acc === '' ? 0 : acc.startsWith('#') ? acc.length : -acc.length;
  return { step: STEPS[m[1].toUpperCase()], alter, octave: Number(m[3]) };
}

function parseDuration(s: string): Duration {
  const m = /^(w|h|q|8)(\.)?(3)?$/.exec(s);
  if (!m) throw new Error(`Ungültiger Notenwert: ${s}`);
  return { base: m[1] as BaseValue, dotted: !!m[2], triplet: !!m[3] };
}

/**
 * Compact notation for one voice: tokens separated by spaces, each
 * "<pitch>/<value>" with value w, h, q, 8 (dot: "q.", triplet: "83").
 * "r/<value>" is a rest, a trailing "~" ties to the next note, "^" adds a fermata.
 * Example: "G4/h~ G4/q F4/q^".
 */
export function parseVoice(text: string, prefix: string, start = 0): SNote[] {
  const out: SNote[] = [];
  let pos = start;
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((tok, i) => {
      let t = tok;
      const fermata = t.endsWith('^');
      if (fermata) t = t.slice(0, -1);
      const tie = t.endsWith('~');
      if (tie) t = t.slice(0, -1);
      const [p, d] = t.split('/');
      const dur = parseDuration(d ?? 'q');
      const rest = p === 'r';
      out.push({
        id: `${prefix}${i}`,
        start: pos,
        dur,
        pitch: rest ? { ...REST_PITCH } : parsePitch(p),
        ...(rest ? { rest: true } : {}),
        ...(tie ? { tie: true } : {}),
        ...(fermata ? { fermata: true } : {}),
      });
      pos += durationTicks(dur);
    });
  return out;
}

/** Measures for a total length; `pickup` ticks for a shorter first measure. */
export function buildMeasures(total: number, beats: number, beatType: number, pickup = 0): Measure[] {
  const full = measureTicks(beats, beatType);
  const out: Measure[] = [];
  let start = 0;
  if (pickup > 0) {
    out.push({ start: 0, ticks: pickup });
    start = pickup;
  }
  while (start < total) {
    out.push({ start, ticks: full });
    start += full;
  }
  return out;
}

export interface ExampleSetting {
  voices: SNote[][];
  measures: Measure[];
}

/** Four voices in compact notation (S, A, T, B). */
export function buildSetting(texts: [string, string, string, string], beats = 4, beatType = 4, pickup = 0, idPrefix = ''): ExampleSetting {
  const voices = texts.map((t, v) => parseVoice(t, `${idPrefix}${'satb'[v]}`));
  const total = Math.max(0, ...voices.flat().map((n) => n.start + durationTicks(n.dur)));
  return { voices, measures: buildMeasures(total, beats, beatType, pickup) };
}
