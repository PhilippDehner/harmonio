import { Duration, Measure, durationTicks, measureIndexAt, newId } from '../dictation/model';
import { Pitch, keyAlter, toMidi } from '../music/pitch';
import { REST_PITCH, SNote, noteEndS, sortByStart } from './model';

export type EditResult = { ok: true; notes: SNote[]; id: string } | { ok: false; message: string };

/**
 * Inserts a note (or rest if `pitch` is null) into a voice. Overlapping notes
 * are replaced; a note must not cross the bar line (use ties instead).
 */
export function insertInVoice(voice: SNote[], measures: Measure[], start: number, dur: Duration, pitch: Pitch | null): EditResult {
  const ticks = durationTicks(dur);
  const m = measures[measureIndexAt(measures, start)];
  if (!m || start < 0) return { ok: false, message: 'Außerhalb des Satzes.' };
  if (start + ticks > m.start + m.ticks) {
    return { ok: false, message: 'Die Note passt nicht mehr in den Takt. Kürzeren Notenwert wählen oder mit Haltebogen verbinden.' };
  }
  const end = start + ticks;
  const overlaps = voice.filter((n) => n.start < end && noteEndS(n) > start);
  if (overlaps.some((n) => n.given)) return { ok: false, message: 'Die Melodie ist vorgegeben und kann nicht verändert werden.' };
  const id = newId('s');
  const note: SNote = pitch ? { id, start, dur, pitch } : { id, start, dur, pitch: { ...REST_PITCH }, rest: true };
  return { ok: true, id, notes: sortByStart([...voice.filter((n) => !overlaps.includes(n)), note]) };
}

export function deleteFromVoice(voice: SNote[], id: string): SNote[] {
  return voice.filter((n) => n.id !== id || n.given);
}

export function setPitch(voice: SNote[], id: string, pitch: Pitch): SNote[] {
  return voice.map((n) => (n.id === id && !n.given ? { ...n, pitch, rest: undefined } : n));
}

export function toggleTie(voice: SNote[], id: string): { ok: true; notes: SNote[] } | { ok: false; message: string } {
  const s = sortByStart(voice);
  const i = s.findIndex((n) => n.id === id);
  const n = s[i];
  if (!n || n.rest) return { ok: false, message: 'Pausen können nicht gebunden werden.' };
  if (n.tie) return { ok: true, notes: s.map((x) => (x.id === id ? { ...x, tie: undefined } : x)) };
  const next = s[i + 1];
  if (!next || next.rest || noteEndS(n) !== next.start || toMidi(next.pitch) !== toMidi(n.pitch)) {
    return { ok: false, message: 'Ein Haltebogen verbindet zwei aufeinanderfolgende gleiche Töne derselben Stimme.' };
  }
  return { ok: true, notes: s.map((x) => (x.id === id ? { ...x, tie: true } : x)) };
}

/** Moves a note one semitone up or down with a sensible spelling. */
export function semitone(p: Pitch, up: boolean): Pitch {
  if (up) {
    if (p.alter < 0) return { ...p, alter: p.alter + 1 };
    if (p.step === 2 || p.step === 6) {
      // e → f, h → c
      return p.alter > 0 ? { ...p, alter: p.alter + 1 } : { step: (p.step + 1) % 7, alter: 0, octave: p.step === 6 ? p.octave + 1 : p.octave };
    }
    return p.alter >= 1 ? { step: (p.step + 1) % 7, alter: 0, octave: p.octave } : { ...p, alter: p.alter + 1 };
  }
  if (p.alter > 0) return { ...p, alter: p.alter - 1 };
  if (p.step === 0 || p.step === 3) {
    // c → h, f → e
    return p.alter < 0 ? { ...p, alter: p.alter - 1 } : { step: (p.step + 6) % 7, alter: 0, octave: p.step === 0 ? p.octave - 1 : p.octave };
  }
  return p.alter <= -1 ? { step: (p.step + 6) % 7, alter: 0, octave: p.octave } : { ...p, alter: p.alter - 1 };
}

/** Accidental in context: key signature and earlier notes of the staff in the measure. */
export function contextAlter(staffNotes: SNote[], m: Measure, step: number, octave: number, tick: number, keyFifths: number): number {
  const prev = staffNotes
    .filter((n) => !n.rest && n.start >= m.start && n.start < tick && n.pitch.step === step && n.pitch.octave === octave)
    .sort((a, b) => b.start - a.start)[0];
  return prev ? prev.pitch.alter : keyAlter(step, keyFifths);
}

/** Possible insert positions in a measure: every eighth (triplet grid for triplets), onsets and note ends. */
export function snapTick(voices: SNote[][], m: Measure, tick: number, dur: Duration): number {
  const candidates = new Set<number>();
  const grid = dur.triplet ? 8 : 12;
  for (let t = m.start; t < m.start + m.ticks; t += grid) candidates.add(t);
  for (const v of voices)
    for (const n of v) {
      if (n.start >= m.start && n.start < m.start + m.ticks) candidates.add(n.start);
      const e = noteEndS(n);
      if (e >= m.start && e < m.start + m.ticks) candidates.add(e);
    }
  let best = m.start;
  for (const c of candidates) if (Math.abs(c - tick) < Math.abs(best - tick)) best = c;
  return best;
}

/** Moves a note into another voice at the same position (replacing notes there). */
export function moveToVoice(voices: SNote[][], measures: Measure[], id: string, target: number): { ok: true; voices: SNote[][]; id: string } | { ok: false; message: string } {
  const from = voices.findIndex((v) => v.some((n) => n.id === id));
  if (from < 0) return { ok: false, message: 'Note nicht gefunden.' };
  const note = voices[from].find((n) => n.id === id)!;
  if (note.given) return { ok: false, message: 'Die Melodie ist vorgegeben.' };
  if (from === target) return { ok: true, voices, id };
  const removed = voices.map((v, i) => (i === from ? v.filter((n) => n.id !== id) : v));
  const r = insertInVoice(removed[target], measures, note.start, note.dur, note.rest ? null : note.pitch);
  if (!r.ok) return r;
  return { ok: true, id: r.id, voices: removed.map((v, i) => (i === target ? r.notes : v)) };
}

/** First free tick of a voice in a measure from a position on (for continuous input). */
export function nextFree(voice: SNote[], m: Measure, from: number): number | null {
  let t = from;
  for (const n of sortByStart(voice)) {
    if (n.start <= t && noteEndS(n) > t) t = noteEndS(n);
  }
  return t < m.start + m.ticks ? t : null;
}

export function cloneVoices(v: SNote[][]): SNote[][] {
  return v.map((x) => x.map((n) => ({ ...n, pitch: { ...n.pitch }, dur: { ...n.dur } })));
}

export { newId };
