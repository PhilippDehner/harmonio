import type { ClickEvent, SoundEvent } from '../audio/engine';
import { chordTones } from '../music/chords';
import { transpose } from '../music/intervals';
import { Pitch, keyTonic, toMidi } from '../music/pitch';
import { DNote, Dictation, beatTicks, durationTicks, measureTicks, TICKS_PER_QUARTER } from './model';

export function secondsPerTick(tempo: number): number {
  return 60 / tempo / TICKS_PER_QUARTER;
}

/** Klänge der Stimmen ab einem Tick; Zeit 0 = Position `fromTick`. */
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
 * Vierstimmige Kadenz I–IV–V–I (Moll: i–iv–V–i) in enger Lage:
 * I in Oktavlage, IV in Quintlage, V in Terzlage, I in Oktavlage.
 */
export function cadenceChords(keyFifths: number, minor: boolean): number[][] {
  const tonicName = keyTonic(keyFifths, minor);
  // Grundton so legen, dass der Bass zwischen F und e liegt
  let tonic: Pitch = { ...tonicName, octave: 3 };
  if (toMidi(tonic) > 52) tonic = { ...tonic, octave: 2 };
  const subdominant = transpose(tonic, 3, 5);
  const dominant = transpose(tonic, 4, 7);
  const tQ = minor ? 'moll' : 'dur';
  const chords = [chordTones(tonic, tQ), chordTones(subdominant, tQ), chordTones(dominant, 'dur'), chordTones(tonic, tQ)];
  // Index des Akkordtons im Sopran: 0 = Oktavlage, 1 = Terzlage, 2 = Quintlage
  const sopranoTone = [0, 2, 1, 0];
  // Sopran des ersten Akkords zwischen f' und e'', danach stimmführungsnah
  let soprano = 65 + ((toMidi(tonic) % 12) - 65 % 12 + 12) % 12;
  return chords.map((c, i) => {
    const pcs = c.map((p) => toMidi(p) % 12);
    const spc = pcs[sopranoTone[i]];
    if (i > 0) {
      const below = soprano - (((soprano - spc) % 12) + 12) % 12;
      soprano = soprano - below <= 6 ? below : below + 12;
    }
    // Übrige Akkordtöne in enger Lage direkt unter dem Sopran
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
  /** Sekunden bis zum Beginn der Melodie */
  melodyOffset: number;
}

/** Ticks des Einzählens: ein ganzer Takt, bei Auftakt zusätzlich die Schläge bis zum Auftakt. */
export function countInClicks(d: Dictation): { tick: number; accent: boolean }[] {
  const full = measureTicks(d.beats, d.beatType);
  const beat = beatTicks(d.beatType);
  const first = d.measures[0]?.ticks ?? full;
  const pickup = d.kind !== 'vierstimmig' && first < full ? first : 0;
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
  const pickup = d.kind !== 'vierstimmig' && first < full ? first : 0;
  return pickup > 0 ? full + (full - pickup) : full;
}

/** Kadenz und Einzählen vor dem ersten Abspielen. */
export function introPlan(d: Dictation): IntroPlan {
  const spt = secondsPerTick(d.tempo);
  const chordLen = Math.min(TICKS_PER_QUARTER * spt, 0.6);
  const sounds: SoundEvent[] = cadenceChords(d.keyFifths, d.minor).map((midi, i) => ({
    time: i * chordLen,
    midi,
    duration: chordLen * (i === 3 ? 1.8 : 0.95),
  }));
  const pause = 5 * chordLen; // Kadenz (4 Akkorde) + Atempause
  const clicks: ClickEvent[] = countInClicks(d).map((c) => ({ time: pause + c.tick * spt, accent: c.accent }));
  return { sounds, clicks, melodyOffset: pause + countInLength(d) * spt };
}

/** Gesamtdauer der Melodie in Sekunden. */
export function melodySeconds(d: Dictation): number {
  const last = d.measures[d.measures.length - 1];
  return last ? (last.start + last.ticks) * secondsPerTick(d.tempo) : 0;
}
