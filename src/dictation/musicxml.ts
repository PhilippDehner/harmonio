import { Pitch, toMidi } from '../music/pitch';
import {
  BaseValue,
  DNote,
  Dictation,
  DictationKind,
  Duration,
  Measure,
  TICKS_PER_QUARTER,
  durationTicks,
  measureTicks,
} from './model';

export const DEFAULT_TEMPO = 80;

const TYPE_MAP: Record<string, BaseValue> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
};

const STEP_MAP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function text(el: Element | null | undefined, selector: string): string | null {
  const found = el?.querySelector(selector);
  return found?.textContent?.trim() ?? null;
}

function num(el: Element | null | undefined, selector: string): number | null {
  const t = text(el, selector);
  return t === null ? null : Number(t);
}

/** Direkte Kindelemente (querySelector durchsucht auch Enkel). */
function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === name);
}

interface RawEvent {
  start: number;
  dur: Duration;
  pitches: Pitch[];
  /** Schlüssel der Stimme innerhalb der Datei */
  voiceKey: string;
}

/**
 * Liest eine MusicXML-Datei (partwise) mit dem eingeschränkten Umfang der
 * Diktatsammlung: Noten ohne Pausen und Haltebögen, Triolen, Punktierungen.
 * Akkorde innerhalb einer Stimme werden nach Tonhöhe auf Einzelstimmen verteilt.
 */
export function parseMusicXml(
  xml: string,
  meta: { id: string; kind: DictationKind; number: number },
): Dictation {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`MusicXML fehlerhaft: ${meta.id}`);

  let keyFifths = 0;
  let minor = false;
  let beats = 4;
  let beatType = 4;
  let tempo: number | null = null;
  const events: RawEvent[] = [];
  const measureLengths: number[] = [];

  const parts = Array.from(doc.querySelectorAll('part'));
  parts.forEach((part, partIndex) => {
    let divisions = 1;
    let cursor = 0;
    let lastStart = 0;
    const measures = children(part, 'measure');
    measures.forEach((measure, mIndex) => {
      const measureStart = cursor;
      let maxCursor = cursor;
      for (const el of Array.from(measure.children)) {
        if (el.tagName === 'attributes') {
          const div = num(el, 'divisions');
          if (div) divisions = div;
          const fifths = num(el, 'key > fifths');
          if (fifths !== null) keyFifths = fifths;
          const mode = text(el, 'key > mode');
          if (mode) minor = mode === 'minor';
          const b = num(el, 'time > beats');
          const bt = num(el, 'time > beat-type');
          if (b) beats = b;
          if (bt) beatType = bt;
        } else if (el.tagName === 'direction' || el.tagName === 'sound') {
          const sound = el.tagName === 'sound' ? el : el.querySelector('sound');
          const t = sound?.getAttribute('tempo');
          if (t && tempo === null) tempo = Number(t);
          const perMinute = num(el, 'metronome > per-minute');
          if (perMinute && tempo === null) tempo = perMinute;
        } else if (el.tagName === 'backup') {
          cursor -= ((num(el, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions;
        } else if (el.tagName === 'forward') {
          cursor += ((num(el, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions;
          maxCursor = Math.max(maxCursor, cursor);
        } else if (el.tagName === 'note') {
          const isChord = children(el, 'chord').length > 0;
          const isRest = children(el, 'rest').length > 0;
          const durDivs = num(el, 'duration') ?? 0;
          const durTicksRaw = (durDivs * TICKS_PER_QUARTER) / divisions;
          const typeName = text(el, 'type');
          const base = typeName ? TYPE_MAP[typeName] : undefined;
          const dotted = children(el, 'dot').length > 0;
          const triplet =
            num(el, 'time-modification > actual-notes') === 3 &&
            num(el, 'time-modification > normal-notes') === 2;
          const dur: Duration | null = base ? { base, dotted, triplet } : null;
          const start = isChord ? lastStart : cursor;
          if (!isRest && dur) {
            const step = text(el, 'pitch > step') ?? 'C';
            const pitch: Pitch = {
              step: STEP_MAP[step] ?? 0,
              alter: num(el, 'pitch > alter') ?? 0,
              octave: num(el, 'pitch > octave') ?? 4,
            };
            const voiceKey = `${partIndex}:${text(el, 'staff') ?? '1'}:${text(el, 'voice') ?? '1'}`;
            const existing = isChord
              ? events.find((e) => e.voiceKey === voiceKey && e.start === start)
              : undefined;
            if (existing) existing.pitches.push(pitch);
            else events.push({ start, dur, pitches: [pitch], voiceKey });
          }
          if (!isChord) {
            lastStart = cursor;
            cursor += dur ? durationTicks(dur) : durTicksRaw;
            maxCursor = Math.max(maxCursor, cursor);
          }
        }
      }
      cursor = maxCursor;
      if (partIndex === 0) {
        const len = cursor - measureStart;
        measureLengths[mIndex] = len;
      }
    });
  });

  // Stimmen bilden: Akkorde in Einzelstimmen auflösen
  const voiceKeys = Array.from(new Set(events.map((e) => e.voiceKey)));
  const voices: DNote[][] = [];
  let idCount = 0;
  for (const key of voiceKeys) {
    const evs = events.filter((e) => e.voiceKey === key).sort((a, b) => a.start - b.start);
    const width = Math.max(...evs.map((e) => e.pitches.length));
    const sub: DNote[][] = Array.from({ length: width }, () => []);
    for (const e of evs) {
      const sorted = [...e.pitches].sort((a, b) => toMidi(b) - toMidi(a));
      sorted.forEach((p, i) => {
        sub[i].push({ id: `${meta.id}-${idCount++}`, start: e.start, dur: e.dur, pitch: p });
      });
    }
    voices.push(...sub);
  }
  const avg = (v: DNote[]) => v.reduce((s, n) => s + toMidi(n.pitch), 0) / Math.max(1, v.length);
  voices.sort((a, b) => avg(b) - avg(a));

  let measures: Measure[] = [];
  if (meta.kind === 'vierstimmig') {
    // Ein „Takt“ pro Akkord
    const starts = Array.from(new Set(voices.flatMap((v) => v.map((n) => n.start)))).sort((a, b) => a - b);
    const chordTicks = 96;
    measures = starts.map((_, i) => ({ start: i * chordTicks, ticks: chordTicks }));
    for (const v of voices) {
      for (const n of v) {
        const idx = starts.indexOf(n.start);
        n.start = idx * chordTicks;
        n.dur = { base: 'w', dotted: false, triplet: false };
      }
    }
  } else {
    const full = measureTicks(beats, beatType);
    let start = 0;
    measureLengths.forEach((len, i) => {
      // Auftakt: nur der erste Takt darf kürzer sein
      const ticks = i === 0 && len > 0 && len < full ? len : full;
      measures.push({ start, ticks });
      start += ticks;
    });
  }

  return {
    id: meta.id,
    kind: meta.kind,
    number: meta.number,
    keyFifths,
    minor,
    beats,
    beatType,
    tempo: tempo ?? DEFAULT_TEMPO,
    measures,
    voices,
  };
}
