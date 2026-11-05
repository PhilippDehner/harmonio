import { Pitch, toMidi } from '../music/pitch';
import { DNote, Dictation, Duration, Measure, durationTicks, measureIndexAt, newId, noteEnd, sortNotes } from './model';

export type EditResult = { ok: true; notes: DNote[]; id: string } | { ok: false; message: string };

/**
 * Setzt eine Note an Position `start` ein. Überlappende eigene Noten werden
 * entfernt; Noten dürfen nicht über den Taktstrich reichen (keine Haltebögen).
 */
export function insertNote(
  notes: DNote[],
  measures: Measure[],
  start: number,
  dur: Duration,
  pitch: Pitch,
): EditResult {
  const ticks = durationTicks(dur);
  const m = measures[measureIndexAt(measures, start)];
  if (!m) return { ok: false, message: 'Außerhalb des Diktats.' };
  if (start + ticks > m.start + m.ticks) {
    return { ok: false, message: 'Die Note passt nicht mehr in den Takt.' };
  }
  const end = start + ticks;
  const overlaps = notes.filter((n) => n.start < end && noteEnd(n) > start);
  if (overlaps.some((n) => n.given)) {
    return { ok: false, message: 'Die vorgegebene Note kann nicht überschrieben werden.' };
  }
  const id = newId();
  const kept = notes.filter((n) => !overlaps.includes(n));
  return { ok: true, id, notes: sortNotes([...kept, { id, start, dur, pitch }]) };
}

export function deleteNote(notes: DNote[], id: string): DNote[] {
  return notes.filter((n) => n.id !== id || n.given);
}

export function updatePitch(notes: DNote[], id: string, pitch: Pitch): DNote[] {
  return notes.map((n) => (n.id === id && !n.given ? { ...n, pitch } : n));
}

/** Verschiebt eine Note zeitlich (innerhalb ihres Taktes). */
export function moveNoteInTime(notes: DNote[], measures: Measure[], id: string, delta: number): EditResult {
  const note = notes.find((n) => n.id === id);
  if (!note || note.given) return { ok: false, message: 'Diese Note kann nicht verschoben werden.' };
  const target = note.start + delta;
  const m = measures[measureIndexAt(measures, note.start)];
  if (target < m.start) return { ok: false, message: 'Die Note ist bereits am Taktanfang.' };
  const rest = notes.filter((n) => n.id !== id);
  const r = insertNote(rest, measures, target, note.dur, note.pitch);
  if (!r.ok) return r;
  // ID beibehalten
  return { ok: true, id, notes: r.notes.map((n) => (n.id === r.id ? { ...n, id } : n)) };
}

/** Nächste freie Einfügeposition nach einer Note bzw. am Taktanfang. */
export function nextPosition(notes: DNote[], measures: Measure[], measureIndex: number): number {
  const m = measures[measureIndex];
  const inMeasure = notes.filter((n) => n.start >= m.start && n.start < m.start + m.ticks);
  if (inMeasure.length === 0) return m.start;
  const lastEnd = Math.max(...inMeasure.map(noteEnd));
  return Math.min(lastEnd, m.start + m.ticks);
}

/**
 * Vorgabe für die Eingabe: die Anfangstöne aller Stimmen
 * (vierstimmig: der ganze erste Akkord).
 */
export function initialInput(d: Dictation): DNote[][] {
  return d.voices.map((v) => {
    const first = sortNotes(v)[0];
    return first ? [{ ...first, id: newId('g'), given: true }] : [];
  });
}

/**
 * Vierstimmiger Satz: Oberstimmen eines Akkords (ungeordnet) und Bass werden
 * nach Tonhöhe auf Sopran, Alt, Tenor verteilt.
 */
export function distributeChorale(
  upperPerChord: Pitch[][],
  bassPerChord: (Pitch | null)[],
  measures: Measure[],
  givenFirst: boolean,
): DNote[][] {
  const voices: DNote[][] = [[], [], [], []];
  const whole: Duration = { base: 'w', dotted: false, triplet: false };
  measures.forEach((m, i) => {
    const upper = [...(upperPerChord[i] ?? [])].sort((a, b) => toMidi(b) - toMidi(a)).slice(0, 3);
    const given = givenFirst && i === 0;
    upper.forEach((p, v) => voices[v].push({ id: `c${i}v${v}`, start: m.start, dur: whole, pitch: p, given }));
    const b = bassPerChord[i];
    if (b) voices[3].push({ id: `c${i}v3`, start: m.start, dur: whole, pitch: b, given });
  });
  return voices;
}
