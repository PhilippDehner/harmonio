import { Pitch, keyAlter } from '../music/pitch';

/**
 * Determines which accidentals to draw within a measure. Accidentals apply
 * until the end of the measure for the same pitch (step + octave), starting
 * from the key signature.
 *
 * Input: pitches in temporal order (chord tones one after another).
 * Output: per note the sign to draw ('#', 'b', 'n', '##', 'bb') or null.
 */
export function accidentalsInMeasure(pitches: Pitch[], keyFifths: number): (string | null)[] {
  const state = new Map<string, number>();
  return pitches.map((p) => {
    const k = `${p.step}:${p.octave}`;
    const current = state.has(k) ? state.get(k)! : keyAlter(p.step, keyFifths);
    if (current === p.alter) return null;
    state.set(k, p.alter);
    if (p.alter === 0) return 'n';
    return p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter);
  });
}
