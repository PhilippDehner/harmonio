import { NoteStyle, MarkLine } from './render';
import { Violation } from './rules';

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Note colors and lines for rule violations (the selected violation stands out). */
export function violationMarks(violations: Violation[], selected: Violation | null = null): { noteStyles: Record<string, NoteStyle>; lines: MarkLine[] } {
  const err = cssVar('--err') || '#c62f2f';
  const warn = cssVar('--warn') || '#b85c00';
  const noteStyles: Record<string, NoteStyle> = {};
  const lines: MarkLine[] = [];
  for (const v of violations) {
    const color = selected && v !== selected ? warn : err;
    for (const id of v.notes) if (!noteStyles[id] || color === err) noteStyles[id] = { head: color };
    for (const [from, to] of v.lines) lines.push({ from, to, color });
  }
  return { noteStyles, lines };
}
