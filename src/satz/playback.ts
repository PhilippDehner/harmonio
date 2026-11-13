import type { SoundEvent } from '../audio/engine';
import { TICKS_PER_QUARTER, durationTicks } from '../dictation/model';
import { toMidi } from '../music/pitch';
import { SNote, noteEndS, sortByStart } from './model';

/** Extra length of notes with a fermata (factor of their duration). */
export const FERMATA_FACTOR = 1.8;

export interface TimeMap {
  secAt: (tick: number) => number;
  tickAt: (sec: number) => number;
}

/** Time map with fermatas held longer (fermatas of any voice). */
export function timeMap(voices: SNote[][], tempo: number): TimeMap {
  const spt = 60 / tempo / TICKS_PER_QUARTER;
  const spans = new Map<number, number>();
  for (const v of voices) for (const n of v) if (n.fermata) spans.set(n.start, Math.max(spans.get(n.start) ?? 0, noteEndS(n)));
  const fermatas = Array.from(spans.entries()).map(([start, end]) => ({ start, end }));
  const secAt = (tick: number) => {
    let s = tick * spt;
    for (const f of fermatas) {
      const len = f.end - f.start;
      const part = Math.max(0, Math.min(1, (tick - f.start) / len));
      s += part * len * spt * (FERMATA_FACTOR - 1);
    }
    return s;
  };
  const tickAt = (sec: number) => {
    let lo = 0;
    let hi = 1e7;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (secAt(mid) < sec) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  return { secAt, tickAt };
}

/**
 * Sounds of a setting from a tick on (time 0 = `fromTick`). Tied notes sound
 * as one; muted voices are left out.
 */
export function satzSounds(voices: SNote[][], tempo: number, fromTick = 0, mute: boolean[] = []): SoundEvent[] {
  const tm = timeMap(voices, tempo);
  const t0 = tm.secAt(fromTick);
  const out: SoundEvent[] = [];
  voices.forEach((voice, v) => {
    if (mute[v]) return;
    const s = sortByStart(voice);
    for (let i = 0; i < s.length; i++) {
      const n = s[i];
      if (n.rest) continue;
      // Skip notes that continue a tie
      const prev = s[i - 1];
      if (prev && prev.tie && !prev.rest && toMidi(prev.pitch) === toMidi(n.pitch) && noteEndS(prev) === n.start) continue;
      let end = noteEndS(n);
      let j = i;
      while (s[j].tie && s[j + 1] && !s[j + 1].rest && toMidi(s[j + 1].pitch) === toMidi(n.pitch) && noteEndS(s[j]) === s[j + 1].start) {
        j++;
        end = noteEndS(s[j]);
      }
      if (end <= fromTick) continue;
      const start = Math.max(n.start, fromTick);
      out.push({
        time: tm.secAt(start) - t0,
        midi: [toMidi(n.pitch)],
        duration: (tm.secAt(end) - tm.secAt(start)) * 0.95,
      });
    }
  });
  return out.sort((a, b) => a.time - b.time);
}

export function totalTicksOf(voices: SNote[][]): number {
  return Math.max(0, ...voices.flatMap((v) => v.map((n) => n.start + durationTicks(n.dur))));
}
