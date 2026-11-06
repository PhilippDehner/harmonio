import { useEffect, useRef, useState } from 'react';
import { detectPitch } from './pitchDetect';

export type MicFrame = (freq: number | null, time: number) => void;

/**
 * Startet das Mikrofon und meldet etwa alle 40 ms die erkannte Frequenz.
 * Liefert eine Funktion zum Beenden.
 */
export async function startMic(onFrame: MicFrame): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieser Browser unterstützt keinen Mikrofonzugriff.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const id = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, ctx.sampleRate);
    onFrame(r && r.clarity > 0.8 ? r.freq : null, performance.now());
  }, 40);
  return () => {
    window.clearInterval(id);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
}

export type MicState = 'aus' | 'startet' | 'an' | 'fehler';

/** Mikrofon für eine Seite; wird beim Verlassen der Seite beendet. */
export function useMic(onFrame: MicFrame) {
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  const stopRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState<MicState>('aus');
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopRef.current = null;
    },
    [],
  );

  async function start() {
    if (stopRef.current) return;
    setState('startet');
    setError(null);
    try {
      stopRef.current = await startMic((f, t) => frameRef.current(f, t));
      setState('an');
    } catch (e) {
      const err = e as Error;
      setError(
        err.name === 'NotAllowedError'
          ? 'Der Mikrofonzugriff wurde verweigert. Erlaube ihn in den Browser-Einstellungen für diese Seite.'
          : err.name === 'NotFoundError'
            ? 'Es wurde kein Mikrofon gefunden.'
            : err.message,
      );
      setState('fehler');
    }
  }

  function stop() {
    stopRef.current?.();
    stopRef.current = null;
    setState('aus');
  }

  return { state, error, start, stop };
}
