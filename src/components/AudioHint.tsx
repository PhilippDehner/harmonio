import { useEffect, useState } from 'react';
import { isAudioRunning, onAudioState, unlockAudio } from '../audio/engine';

/**
 * Browser geben Audio erst nach einer Nutzeraktion frei. Beim Klick auf eine
 * Kachel passiert das automatisch; nach Neuladen oder Direktlink erscheint
 * dieser Hinweis, und der erste Tipp irgendwo schaltet den Ton frei.
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
