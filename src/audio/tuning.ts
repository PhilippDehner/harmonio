/** Concert pitch (frequency of a' = MIDI 69), configurable in the settings. */
export const DEFAULT_A4 = 440;
export const MIN_A4 = 410;
export const MAX_A4 = 450;

let a4 = DEFAULT_A4;

/** Whole Hz within MIN_A4…MAX_A4; invalid values fall back to the default. */
export function clampA4(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_A4;
  return Math.min(MAX_A4, Math.max(MIN_A4, Math.round(n)));
}

export function getA4(): number {
  return a4;
}

export function setA4(freq: number) {
  a4 = clampA4(freq);
}
