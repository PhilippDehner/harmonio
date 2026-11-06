import { useEffect, useState } from 'react';
import { isAudioRunning, onAudioState, unlockAudio } from '../audio/engine';

/**
 * Browsers only allow audio after a user interaction. Clicking a tile does
 * this automatically; after a reload or a direct link this hint appears, and
 * the first tap anywhere unlocks audio.
 */
export default function AudioHint() {
  const [running, setRunning] = useState(isAudioRunning());
  useEffect(() => {
    const off = onAudioState(() => setRunning(isAudioRunning()));
    const unlock = () => {
      unlockAudio().then(() => setRunning(isAudioRunning()));
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  if (running) return null;
  return (
    <button className="audio-hint" onClick={() => unlockAudio().then(() => setRunning(isAudioRunning()))}>
      🔊 Zum Starten tippen
    </button>
  );
}
