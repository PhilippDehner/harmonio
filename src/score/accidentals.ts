import { Pitch, keyAlter } from '../music/pitch';

/**
 * Bestimmt, welche Versetzungszeichen innerhalb eines Taktes zu zeichnen
 * sind. Versetzungszeichen gelten bis zum Taktende für dieselbe Tonhöhe
 * (Stammton + Oktave), Grundlage sind die Vorzeichen der Tonart.
 *
 * Eingabe: Tonhöhen in zeitlicher Reihenfolge (Akkordtöne nacheinander).
 * Ausgabe: je Ton das zu zeichnende Zeichen ('#', 'b', 'n', '##', 'bb') oder null.
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
