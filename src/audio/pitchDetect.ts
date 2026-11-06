/**
 * Pitch detection (YIN) and tracking of sung notes.
 * Pure functions without browser dependencies so they are testable.
 */

export interface PitchEstimate {
  freq: number;
  /** 0–1, the higher the more periodic the signal */
  clarity: number;
}

/**
 * Fundamental frequency of a signal frame using the YIN algorithm.
 * Returns null for silence or without clear periodicity.
 */
export function detectPitch(
  buf: ArrayLike<number>,
  sampleRate: number,
  minFreq = 60,
  maxFreq = 1100,
  threshold = 0.15,
): PitchEstimate | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.005) return null;

  const maxTau = Math.min(Math.floor(sampleRate / minFreq), Math.floor(n / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const w = n - maxTau;
  const d = new Float64Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < w; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // cumulative mean normalized difference function
  const cmnd = new Float64Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // parabolic interpolation for sub-sample accuracy
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) better = tau + (a - c) / (2 * denom);
  }
  return { freq: sampleRate / better, clarity: 1 - cmnd[tau] };
}

/** Frequency → MIDI number (not rounded), a' = 440 Hz = 69. */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Detects a held note: once the pitch stays within `tolCents` for `holdMs`,
 * its frequency (median) is reported. After that a pause (or a different
 * note) is required before the next report, so a note that is still being
 * held is not counted twice.
 */
export class PitchHold {
  private samples: number[] = [];
  private start = 0;
  private lastVoiced = -Infinity;
  private blocked: number | null = null;

  constructor(
    private holdMs = 600,
    private tolCents = 40,
    private gapMs = 150,
  ) {}

  reset() {
    this.samples = [];
    this.blocked = null;
    this.lastVoiced = -Infinity;
  }

  /** Currently held pitch (MIDI, not rounded) or null. */
  current(): number | null {
    return this.samples.length ? median(this.samples) : null;
  }

  /** New measurement; returns the frequency of a completed held note, else null. */
  push(time: number, freq: number | null): number | null {
    if (freq === null) {
      if (time - this.lastVoiced > this.gapMs) {
        this.samples = [];
        this.blocked = null;
      }
      return null;
    }
    this.lastVoiced = time;
    const m = freqToMidi(freq);
    if (this.blocked !== null) {
      if (Math.abs(m - this.blocked) * 100 <= this.tolCents * 2) return null;
      this.blocked = null;
    }
    const ref = this.current();
    if (ref === null || Math.abs(m - ref) * 100 > this.tolCents) {
      this.samples = [m];
      this.start = time;
      return null;
    }
    this.samples.push(m);
    if (time - this.start >= this.holdMs) {
      const result = median(this.samples);
      this.samples = [];
      this.blocked = result;
      return midiToFreq(result);
    }
    return null;
  }
}

export type VoiceType = 'male' | 'female';

/**
 * Voice type from the sung-back A: around 440 Hz → female,
 * around 220 Hz (or lower) → male. Boundary in the middle (tritone).
 */
export function classifyVoice(freq: number): VoiceType {
  return freq >= Math.sqrt(220 * 440) ? 'female' : 'male';
}
