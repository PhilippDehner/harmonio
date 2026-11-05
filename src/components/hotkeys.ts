import { useEffect, useRef } from 'react';

/**
 * Taste vereinheitlichen: Ziffernblock-Ziffern liefern unabhängig von NumLock
 * die Ziffer, Ziffernblock-Enter liefert 'Enter'.
 */
export function normalizedKey(e: KeyboardEvent): string {
  const m = /^Numpad(\d)$/.exec(e.code);
  if (m) return m[1];
  if (e.code === 'NumpadEnter') return 'Enter';
  return e.key;
}

/** Tastatur-Handler, der Eingaben in Formularfeldern ignoriert. */
export function useHotkeys(handler: (e: KeyboardEvent, key: string) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        if (!(t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'checkbox')) return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.overlay, .tour-pop')) return;
      ref.current(e, normalizedKey(e));
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}
