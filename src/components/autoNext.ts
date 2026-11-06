import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../storage/store';

/**
 * Automatically advances to the next task after a configurable delay once a
 * task is finished (depending on the settings for correct/wrong answers).
 * Returns the remaining seconds, or null if no countdown is running.
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
