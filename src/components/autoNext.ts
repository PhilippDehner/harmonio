import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../storage/store';

/**
 * Geht nach einstellbarer Wartezeit automatisch zur nächsten Aufgabe,
 * sobald eine Aufgabe abgeschlossen ist (je nach Einstellung für richtig/falsch).
 * Liefert die verbleibenden Sekunden oder null, wenn kein Countdown läuft.
 */
export function useAutoNext(done: boolean, correct: boolean, next: () => void): number | null {
  const settings = useSettings();
  const nextRef = useRef(next);
  nextRef.current = next;
  const active = done && (correct ? settings.autoNextCorrect : settings.autoNextWrong);
  const seconds = settings.autoNextSeconds;
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      setRemaining(null);
      return;
    }
    const end = Date.now() + seconds * 1000;
    setRemaining(seconds);
    const id = window.setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        setRemaining(null);
        nextRef.current();
      } else setRemaining(left);
    }, 100);
    return () => window.clearInterval(id);
  }, [active, seconds]);

  return remaining;
}
