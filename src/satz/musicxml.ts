import { BaseValue, Duration, Measure, TICKS_PER_QUARTER, durationTicks, measureTicks } from '../dictation/model';
import { Pitch, STEP_LETTERS_EN, toMidi } from '../music/pitch';
import { REST_PITCH, SNote, Song, sortByStart } from './model';

const TYPE_MAP: Record<string, BaseValue> = { whole: 'w', half: 'h', quarter: 'q', eighth: '8' };
const TYPE_NAMES: Record<BaseValue, string> = { w: 'whole', h: 'half', q: 'quarter', '8': 'eighth' };
const STEP_MAP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export class SongFormatError extends Error {}

function text(el: Element | null | undefined, selector: string): string | null {
  const found = el?.querySelector(selector);
  return found?.textContent?.trim() ?? null;
}

function num(el: Element | null | undefined, selector: string): number | null {
  const t = text(el, selector);
  return t === null || t === '' ? null : Number(t);
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === name);
}

interface RawEvent {
  start: number;
  dur: Duration;
  pitches: { pitch: Pitch; tie: boolean }[];
  rest: boolean;
  fermata: boolean;
  lyric?: string;
  voiceKey: string;
}

/** Duration from ticks if the file has no usable <type>. */
function durationFromTicks(ticks: number): Duration | null {
  for (const base of ['w', 'h', 'q', '8'] as BaseValue[]) {
    for (const dotted of [false, true]) {
      for (const triplet of [false, true]) {
        const d = { base, dotted, triplet };
        if (Math.abs(durationTicks(d) - ticks) < 0.01) return d;
      }
    }
  }
  return null;
}

/**
 * Reads a MusicXML file (partwise) for the Tonsatz exercise: either only the
 * melody or a complete four-part setting. Only major keys are accepted.
 * Supports rests, ties, fermatas, lyrics (first verse), dots and triplets.
 */
export function parseSongXml(xml: string, id: string, fallbackTitle = 'Ohne Titel'): Song {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new SongFormatError('Die Datei ist keine gültige MusicXML-Datei.');
  if (!doc.querySelector('score-partwise')) {
    throw new SongFormatError('Nur MusicXML im Format „partwise“ wird unterstützt (unkomprimiert, .musicxml oder .xml).');
  }
  const title =
    text(doc.documentElement, 'work > work-title') || text(doc.documentElement, 'movement-title') || fallbackTitle;

  let keyFifths: number | null = null;
  let mode: string | null = null;
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
    children(part, 'measure').forEach((measure, mIndex) => {
      const measureStart = cursor;
      let maxCursor = cursor;
      for (const el of Array.from(measure.children)) {
        if (el.tagName === 'attributes') {
          const div = num(el, 'divisions');
          if (div) divisions = div;
          const fifths = num(el, 'key > fifths');
          if (fifths !== null && keyFifths === null) keyFifths = fifths;
          const m = text(el, 'key > mode');
          if (m && mode === null) mode = m;
          const b = num(el, 'time > beats');
          const bt = num(el, 'time > beat-type');
          if (b && partIndex === 0 && mIndex === 0) beats = b;
          if (bt && partIndex === 0 && mIndex === 0) beatType = bt;
        } else if (el.tagName === 'direction' || el.tagName === 'sound') {
          const sound = el.tagName === 'sound' ? el : el.querySelector('sound');
          const t = sound?.getAttribute('tempo');
          if (t && tempo === null) tempo = Number(t);
          const perMinute = num(el, 'metronome > per-minute');
          const unit = text(el, 'metronome > beat-unit');
          if (perMinute && tempo === null) tempo = unit === 'half' ? perMinute * 2 : unit === 'eighth' ? perMinute / 2 : perMinute;
        } else if (el.tagName === 'backup') {
          cursor -= ((num(el, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions;
        } else if (el.tagName === 'forward') {
          cursor += ((num(el, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions;
          maxCursor = Math.max(maxCursor, cursor);
        } else if (el.tagName === 'note') {
          if (children(el, 'grace').length) continue;
          const isChord = children(el, 'chord').length > 0;
          const restEl = children(el, 'rest')[0];
          const isRest = !!restEl;
          const durTicks = ((num(el, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions;
          const typeName = text(el, 'type');
          const base = typeName ? TYPE_MAP[typeName] : undefined;
          let dur: Duration | null = base
            ? {
                base,
                dotted: children(el, 'dot').length > 0,
                triplet:
                  num(el, 'time-modification > actual-notes') === 3 && num(el, 'time-modification > normal-notes') === 2,
              }
            : durationFromTicks(durTicks);
          // Whole-measure rest without type
          if (isRest && restEl.getAttribute('measure') === 'yes') dur = durationFromTicks(durTicks) ?? dur;
          if (!dur) {
            throw new SongFormatError(
              `Takt ${measure.getAttribute('number') ?? mIndex + 1}: Notenwert wird nicht unterstützt (nur ganze bis Achtel, punktiert, Triolen).`,
            );
          }
          const start = isChord ? lastStart : cursor;
          const voiceKey = `${partIndex}:${text(el, 'staff') ?? '1'}:${text(el, 'voice') ?? '1'}`;
          const fermata = !!el.querySelector('notations > fermata');
          const lyricEl = Array.from(el.querySelectorAll('lyric')).find((l) => (l.getAttribute('number') ?? '1') === '1');
          let lyric: string | undefined;
          if (lyricEl) {
            const t = text(lyricEl, 'text');
            const syl = text(lyricEl, 'syllabic');
            if (t) lyric = t + (syl === 'begin' || syl === 'middle' ? ' -' : '');
          }
          const tie = children(el, 'tie').some((t) => t.getAttribute('type') === 'start');
          if (isRest) {
            if (!isChord) events.push({ start, dur, pitches: [], rest: true, fermata, voiceKey });
          } else {
            const step = text(el, 'pitch > step') ?? 'C';
            const pitch: Pitch = {
              step: STEP_MAP[step] ?? 0,
              alter: Math.round(num(el, 'pitch > alter') ?? 0),
              octave: num(el, 'pitch > octave') ?? 4,
            };
            const existing = isChord ? events.find((e) => e.voiceKey === voiceKey && e.start === start && !e.rest) : undefined;
            if (existing) {
              existing.pitches.push({ pitch, tie });
              existing.fermata ||= fermata;
            } else events.push({ start, dur, pitches: [{ pitch, tie }], rest: false, fermata, lyric, voiceKey });
          }
          if (!isChord) {
            lastStart = cursor;
            cursor += durationTicks(dur);
            maxCursor = Math.max(maxCursor, cursor);
          }
        }
      }
      cursor = maxCursor;
      if (partIndex === 0) measureLengths[mIndex] = cursor - measureStart;
    });
  });

  if (mode === 'minor') throw new SongFormatError('Nur Dur-Melodien werden unterstützt (die Datei steht in Moll).');
  if (mode !== null && mode !== 'major' && mode !== 'none') {
    throw new SongFormatError(`Nur Dur-Melodien werden unterstützt (Modus „${mode}“).`);
  }

  // Split voices (chords within a voice become several voices)
  const voiceKeys = Array.from(new Set(events.map((e) => e.voiceKey)));
  const voices: SNote[][] = [];
  let idCount = 0;
  for (const key of voiceKeys) {
    const evs = events.filter((e) => e.voiceKey === key).sort((a, b) => a.start - b.start);
    const width = Math.max(1, ...evs.map((e) => e.pitches.length));
    const sub: SNote[][] = Array.from({ length: width }, () => []);
    for (const e of evs) {
      if (e.rest) {
        sub.forEach((v) => v.push({ id: `${id}-${idCount++}`, start: e.start, dur: e.dur, pitch: { ...REST_PITCH }, rest: true, ...(e.fermata ? { fermata: true } : {}) }));
        continue;
      }
      const sorted = [...e.pitches].sort((a, b) => toMidi(b.pitch) - toMidi(a.pitch));
      sorted.forEach((p, i) => {
        sub[i].push({
          id: `${id}-${idCount++}`,
          start: e.start,
          dur: e.dur,
          pitch: p.pitch,
          ...(p.tie ? { tie: true } : {}),
          ...(e.fermata ? { fermata: true } : {}),
          ...(e.lyric && i === 0 ? { lyric: e.lyric } : {}),
        });
      });
    }
    // Fewer chord tones than the voice width: repeat the lowest tone in the lower sub-voices
    for (const e of evs) {
      if (e.rest || e.pitches.length >= width) continue;
      for (let i = e.pitches.length; i < width; i++) {
        const src = sub[e.pitches.length - 1].find((n) => n.start === e.start)!;
        sub[i].push({ ...src, id: `${id}-${idCount++}`, lyric: undefined });
      }
    }
    voices.push(...sub.filter((v) => v.some((n) => !n.rest)).map(sortByStart));
  }
  const avg = (v: SNote[]) => {
    const sounding = v.filter((n) => !n.rest);
    return sounding.reduce((s, n) => s + toMidi(n.pitch), 0) / Math.max(1, sounding.length);
  };
  voices.sort((a, b) => avg(b) - avg(a));

  if (voices.length !== 1 && voices.length !== 4) {
    throw new SongFormatError(
      `Die Datei muss eine einstimmige Melodie oder einen vierstimmigen Satz enthalten (gefunden: ${voices.length} Stimmen).`,
    );
  }
  if (voices[0].filter((n) => !n.rest).length === 0) throw new SongFormatError('Die Datei enthält keine Noten.');

  const full = measureTicks(beats, beatType);
  const measures: Measure[] = [];
  let start = 0;
  measureLengths.forEach((len, i) => {
    const ticks = i === 0 && len > 0 && len < full ? len : full;
    measures.push({ start, ticks });
    start += ticks;
  });
  // Lyrics only for the melody
  for (const v of voices.slice(1)) for (const n of v) delete n.lyric;

  return {
    id,
    title,
    keyFifths: keyFifths ?? 0,
    beats,
    beatType,
    tempo,
    measures,
    melody: voices[0],
    solution: voices.length === 4 ? voices : null,
  };
}

/* ---------- Writing ---------- */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function noteXml(n: SNote, voice: number, staff: number, stem: 'up' | 'down', extra: { lyric?: string; tieStop?: boolean }): string {
  const ticks = durationTicks(n.dur);
  const parts: string[] = ['<note>'];
  if (n.rest) parts.push('<rest/>');
  else {
    const p = n.pitch;
    parts.push(
      `<pitch><step>${STEP_LETTERS_EN[p.step]}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`,
    );
  }
  parts.push(`<duration>${ticks}</duration>`);
  if (n.tie && !n.rest) parts.push('<tie type="start"/>');
  if (extra.tieStop) parts.push('<tie type="stop"/>');
  parts.push(`<voice>${voice}</voice><type>${TYPE_NAMES[n.dur.base]}</type>`);
  if (n.dur.dotted) parts.push('<dot/>');
  if (n.dur.triplet) parts.push('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>');
  if (!n.rest) parts.push(`<stem>${stem}</stem>`);
  parts.push(`<staff>${staff}</staff>`);
  const notations: string[] = [];
  if (n.tie && !n.rest) notations.push('<tied type="start"/>');
  if (extra.tieStop) notations.push('<tied type="stop"/>');
  if (n.fermata) notations.push('<fermata type="upright"/>');
  if (notations.length) parts.push(`<notations>${notations.join('')}</notations>`);
  if (extra.lyric) {
    const t = extra.lyric.trim();
    const cont = t.endsWith('-');
    parts.push(`<lyric number="1"><syllabic>${cont ? 'begin' : 'single'}</syllabic><text>${esc(t.replace(/\s*-$/, ''))}</text></lyric>`);
  }
  parts.push('</note>');
  return parts.join('');
}

export interface WriteOptions {
  title: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  tempo: number;
  measures: Measure[];
  /** S, A, T, B */
  voices: SNote[][];
  /** Analysis text above the soprano per tick */
  analysis?: Record<number, string>;
}

/** Writes a four-part setting as MusicXML (one part, two staves, four voices). */
export function writeSongXml(o: WriteOptions): string {
  const div = TICKS_PER_QUARTER;
  const staffOf = [1, 1, 2, 2];
  const stems: ('up' | 'down')[] = ['up', 'down', 'up', 'down'];
  const tiedFrom = new Set<string>();
  o.voices.forEach((v) => {
    const s = sortByStart(v);
    s.forEach((n, i) => {
      if (n.tie && s[i + 1]) tiedFrom.add(s[i + 1].id);
    });
  });
  const measuresXml = o.measures.map((m, mi) => {
    const out: string[] = [`<measure number="${mi + (o.measures[0].ticks < (o.measures[1]?.ticks ?? 0) ? 0 : 1)}"${mi === 0 && o.measures[0].ticks < measureTicks(o.beats, o.beatType) ? ' implicit="yes"' : ''}>`];
    if (mi === 0) {
      out.push(
        `<attributes><divisions>${div}</divisions><key><fifths>${o.keyFifths}</fifths><mode>major</mode></key><time><beats>${o.beats}</beats><beat-type>${o.beatType}</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`,
      );
      out.push(
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(o.tempo)}</per-minute></metronome></direction-type><sound tempo="${Math.round(o.tempo)}"/></direction>`,
      );
    }
    const end = m.start + m.ticks;
    o.voices.forEach((voice, v) => {
      if (v > 0) out.push(`<backup><duration>${m.ticks}</duration></backup>`);
      let pos = m.start;
      const notes = sortByStart(voice.filter((n) => n.start >= m.start && n.start < end));
      for (const n of notes) {
        if (n.start > pos) out.push(`<forward><duration>${n.start - pos}</duration><voice>${v + 1}</voice><staff>${staffOf[v]}</staff></forward>`);
        if (v === 0 && o.analysis?.[n.start]) {
          out.push(
            `<direction placement="above"><direction-type><words>${esc(o.analysis[n.start])}</words></direction-type><voice>1</voice><staff>1</staff></direction>`,
          );
        }
        out.push(noteXml(n, v + 1, staffOf[v], stems[v], { lyric: v === 0 ? n.lyric : undefined, tieStop: tiedFrom.has(n.id) }));
        pos = n.start + durationTicks(n.dur);
      }
      if (pos < end) out.push(`<forward><duration>${end - pos}</duration><voice>${v + 1}</voice><staff>${staffOf[v]}</staff></forward>`);
    });
    if (mi === o.measures.length - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    out.push('</measure>');
    return out.join('');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `<work><work-title>${esc(o.title)}</work-title></work>`,
    '<identification><encoding><software>Harmonio</software></encoding></identification>',
    '<part-list><score-part id="P1"><part-name>Satz</part-name></score-part></part-list>',
    '<part id="P1">',
    ...measuresXml,
    '</part>',
    '</score-partwise>',
    '',
  ].join('\n');
}
