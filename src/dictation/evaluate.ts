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
  /** Lösungsnoten, deren Einsatz der Eingabe völlig fehlt */
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

/** Bezugsnote der Lösung: gleicher Einsatz, sonst die zu diesem Zeitpunkt klingende. */
function referenceNote(solution: DNote[], start: number): DNote | undefined {
  return (
    solution.find((s) => s.start === start) ??
    solution.find((s) => s.start <= start && noteEnd(s) > start)
  );
}

/**
 * Wertet eine Stimme aus.
 *
 * Tonhöhe: Eine Note ist richtig, wenn sie exakt (inkl. Schreibweise und
 * Oktave) mit der Bezugsnote der Lösung übereinstimmt. Ist sie falsch, die
 * vorherige eigene Note aber ebenfalls falsch und stimmt der (diatonische)
 * Abstand zur vorherigen Note mit dem Abstand in der Lösung überein, ist es
 * ein Folgefehler. Sonst ist es ein Fehler (die Ursache).
 *
 * Rhythmus: Eine Note ist rhythmisch falsch, wenn es in der Lösung keine Note
 * mit gleichem Einsatz und gleicher Dauer gibt. Zusätzlich zählen Einsätze der
 * Lösung, die in der Eingabe von keiner Note abgedeckt werden.
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
 * Vierstimmiger Satz: Die Oberstimmen werden je Akkord nach Tonhöhe auf
 * Sopran, Alt und Tenor verteilt. Danach wird jede Stimme wie eine Melodie
 * ausgewertet (ohne Rhythmus, alle Akkorde sind gleich lang).
 * Fehlende Töne zählen als Tonhöhenfehler.
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
