import type { ReactNode } from 'react';

/** Marks a feature that is still being tested. */
export default function BetaBadge() {
  return (
    <span className="beta-badge" title="Beta: Diese Funktion wird noch erprobt.">
      Beta
    </span>
  );
}

/** Short notice shown on beta pages. Defaults to the pitch-giving text. */
export function BetaNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="muted small" style={{ margin: 0 }}>
      {children ??
        'Die Tonangabe ist noch in Erprobung. Die Tonerkennung kann je nach Mikrofon, Raum und Stimme ungenau sein.'}
    </p>
  );
}

/** Beta notice for the four-part (chord) dictation. */
export function ChoraleBetaNotice() {
  return (
    <BetaNotice>
      Der vierstimmige Satz ist noch in Erprobung. Die Auswahl und Darstellung der Takte sowie die Wiedergabe sind
      noch etwas umständlich und werden weiter verbessert.
    </BetaNotice>
  );
}
