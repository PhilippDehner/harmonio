import { diatonicIndex, samePitch } from '../music/pitch';
import { DNote, durationTicks, noteEnd, sortNotes } from './model';

export type PitchStatus = 'ok' | 'error' | 'follow';

export interface NoteResult {
  noteId: string;
  pitch: PitchStatus;
  rhythmError: boolean;
}

export interface VoiceResult {
  notes: NoteResult[];
  /** Solution notes whose onset is missing entirely from the input */
  missing: string[];
  pitchErrors: number;
  followErrors: number;
  rhythmErrors: number;
}

export interface EvaluationSummary {
  pitchErrors: number;
  followErrors: number;
  rhythmErrors: number;
}

/** Reference note of the solution: same onset, otherwise the one sounding at that time. */
function referenceNote(solution: DNote[], start: number): DNote | undefined {
  return (
    solution.find((s) => s.start === start) ??
    solution.find((s) => s.start <= start && noteEnd(s) > start)
  );
}

/**
 * Evaluates one voice.
 *
 * Pitch: a note is correct if it matches the reference note of the solution
 * exactly (including spelling and octave). If it is wrong, but the previous
 * user note is wrong as well and the (diatonic) distance to the previous note
 * matches the distance in the solution, it is a follow-up error. Otherwise it
 * is an error (the cause).
 *
 * Rhythm: a note is rhythmically wrong if the solution has no note with the
 * same onset and duration. Additionally, onsets of the solution that are not
 * covered by any input note are counted.
 */
export function evaluateVoice(solutionIn: DNote[], inputIn: DNote[]): VoiceResult {
  const solution = sortNotes(solutionIn);
  const input = sortNotes(inputIn);
  const notes: NoteResult[] = [];
  let prevInput: DNote | undefined;
  let prevRef: DNote | undefined;
  let prevStatus: PitchStatus = 'ok';

  for (const n of input) {
    const ref = referenceNote(solution, n.start);
    const rhythmError = !solution.some(
      (s) => s.start === n.start && durationTicks(s.dur) === durationTicks(n.dur),
    );
    let pitch: PitchStatus;
    if (!ref) {
      pitch = 'error';
    } else if (samePitch(ref.pitch, n.pitch)) {
      pitch = 'ok';
    } else if (
      prevInput &&
      prevRef &&
      prevStatus !== 'ok' &&
      diatonicIndex(n.pitch) - diatonicIndex(prevInput.pitch) ===
        diatonicIndex(ref.pitch) - diatonicIndex(prevRef.pitch)
    ) {
      pitch = 'follow';
    } else {
      pitch = 'error';
    }
    notes.push({ noteId: n.id, pitch, rhythmError });
    prevInput = n;
    prevRef = ref;
    prevStatus = pitch;
  }

  const missing = solution
    .filter((s) => !input.some((n) => n.start <= s.start && noteEnd(n) > s.start))
    .map((s) => s.id);

  return {
    notes,
    missing,
    pitchErrors: notes.filter((r) => r.pitch === 'error').length,
    followErrors: notes.filter((r) => r.pitch === 'follow').length,
    rhythmErrors: notes.filter((r) => r.rhythmError).length + missing.length,
  };
}

export function summarize(results: VoiceResult[]): EvaluationSummary {
  return results.reduce(
    (acc, r) => ({
      pitchErrors: acc.pitchErrors + r.pitchErrors,
      followErrors: acc.followErrors + r.followErrors,
      rhythmErrors: acc.rhythmErrors + r.rhythmErrors,
    }),
    { pitchErrors: 0, followErrors: 0, rhythmErrors: 0 },
  );
}

/**
 * Four-part chorale: the upper notes of each chord are assigned to soprano,
 * alto and tenor by pitch. Then each voice is evaluated like a melody
 * (without rhythm, all chords have the same length).
 * Missing notes count as pitch errors.
 */
export function evaluateChorale(solution: DNote[][], input: DNote[][]): VoiceResult[] {
  return solution.map((sol, i) => {
    const r = evaluateVoice(sol, input[i] ?? []);
    const missingCount = r.missing.length;
    return {
      ...r,
      notes: r.notes.map((n) => ({ ...n, rhythmError: false })),
      rhythmErrors: 0,
      pitchErrors: r.pitchErrors + missingCount,
    };
  });
}
