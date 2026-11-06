import type { ClickEvent, SoundEvent } from '../audio/engine';
import { chordTones } from '../music/chords';
import { transpose } from '../music/intervals';
import { Pitch, keyTonic, toMidi } from '../music/pitch';
import { DNote, Dictation, beatTicks, durationTicks, measureTicks, TICKS_PER_QUARTER } from './model';

export function secondsPerTick(tempo: number): number {
  return 60 / tempo / TICKS_PER_QUARTER;
}

/** Sounds of the voices from a tick on; time 0 = position `fromTick`. */
export function voiceSounds(voices: DNote[][], tempo: number, fromTick = 0, offset = 0): SoundEvent[] {
  const spt = secondsPerTick(tempo);
  const events: SoundEvent[] = [];
  for (const v of voices) {
    for (const n of v) {
      if (n.start < fromTick) continue;
      events.push({
        time: offset + (n.start - fromTick) * spt,
        midi: [toMidi(n.pitch)],
        duration: durationTicks(n.dur) * spt * 0.95,
      });
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

/**
 * Four-part cadence I–IV–V–I (minor: i–iv–V–i) in close position:
 * I with octave on top, IV with fifth on top, V with third on top, I with octave on top.
 */
export function cadenceChords(keyFifths: number, minor: boolean): number[][] {
  const tonicName = keyTonic(keyFifths, minor);
  // Place the root so that the bass lies between F and e
  let tonic: Pitch = { ...tonicName, octave: 3 };
  if (toMidi(tonic) > 52) tonic = { ...tonic, octave: 2 };
  const subdominant = transpose(tonic, 3, 5);
  const dominant = transpose(tonic, 4, 7);
  const tQ = minor ? 'minor' : 'major';
  const chords = [chordTones(tonic, tQ), chordTones(subdominant, tQ), chordTones(dominant, 'major'), chordTones(tonic, tQ)];
  // Index of the chord tone in the soprano: 0 = octave, 1 = third, 2 = fifth
  const sopranoTone = [0, 2, 1, 0];
  // Soprano of the first chord between f' and e'', then with smooth voice leading
  let soprano = 65 + ((toMidi(tonic) % 12) - 65 % 12 + 12) % 12;
  return chords.map((c, i) => {
    const pcs = c.map((p) => toMidi(p) % 12);
    const spc = pcs[sopranoTone[i]];
    if (i > 0) {
      const below = soprano - (((soprano - spc) % 12) + 12) % 12;
      soprano = soprano - below <= 6 ? below : below + 12;
    }
    // Remaining chord tones in close position directly below the soprano
    const inner = pcs
      .filter((_, k) => k !== sopranoTone[i])
      .map((pc) => soprano - ((((soprano - pc) % 12) + 12) % 12 || 12))
      .sort((a, b) => a - b);
    return [toMidi(c[0]), ...inner, soprano];
  });
}

export interface IntroPlan {
  sounds: SoundEvent[];
  clicks: ClickEvent[];
  /** Seconds until the melody starts */
  melodyOffset: number;
}

/** Count-in ticks: one full measure, plus the beats up to the pickup if there is one. */
export function countInClicks(d: Dictation): { tick: number; accent: boolean }[] {
  const full = measureTicks(d.beats, d.beatType);
  const beat = beatTicks(d.beatType);
  const first = d.measures[0]?.ticks ?? full;
  const pickup = d.kind !== 'four-part' && first < full ? first : 0;
  const clicks: { tick: number; accent: boolean }[] = [];
  for (let k = 0; k * beat < full; k++) clicks.push({ tick: k * beat, accent: k === 0 });
  if (pickup > 0) {
    for (let k = 0; k * beat < full - pickup; k++) clicks.push({ tick: full + k * beat, accent: k === 0 });
  }
  return clicks;
}

export function countInLength(d: Dictation): number {
  const full = measureTicks(d.beats, d.beatType);
  const first = d.measures[0]?.ticks ?? full;
  const pickup = d.kind !== 'four-part' && first < full ? first : 0;
  return pickup > 0 ? full + (full - pickup) : full;
}

/** Cadence and count-in before the first playback. */
export function introPlan(d: Dictation): IntroPlan {
  const spt = secondsPerTick(d.tempo);
  const chordLen = Math.min(TICKS_PER_QUARTER * spt, 0.6);
  const sounds: SoundEvent[] = cadenceChords(d.keyFifths, d.minor).map((midi, i) => ({
    time: i * chordLen,
    midi,
    duration: chordLen * (i === 3 ? 1.8 : 0.95),
  }));
  const pause = 5 * chordLen; // cadence (4 chords) + breathing pause
  const clicks: ClickEvent[] = countInClicks(d).map((c) => ({ time: pause + c.tick * spt, accent: c.accent }));
  return { sounds, clicks, melodyOffset: pause + countInLength(d) * spt };
}

/** Total duration of the melody in seconds. */
export function melodySeconds(d: Dictation): number {
  const last = d.measures[d.measures.length - 1];
  return last ? (last.start + last.ticks) * secondsPerTick(d.tempo) : 0;
}
