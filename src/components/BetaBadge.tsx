import type { ReactNode } from 'react';

/** Marks a feature that is still being tested. */
export default function BetaBadge() {
  return (
    <span className="beta-badge" title="Beta: Diese Funktion wird noch erprobt.">
      Beta
    </span>
  );
}

/** Marks a feature at an early stage: incomplete, may still change substantially. */
export function AlphaBadge() {
  return (
    <span className="beta-badge alpha-badge" title="Alpha: frühe Testversion – noch unvollständig, kann sich stark ändern.">
      Alpha
    </span>
  );
}

/** Notice for the four-part setting (Tonsatz) in its alpha stage. */
export function SatzAlphaNotice() {
  return (
    <BetaNotice>
      Der Tonsatz ist eine frühe Testversion (Alpha): Funktionen können noch unvollständig sein oder sich stark ändern.
      Die automatische Erkennung von Harmonien, akkordfremden Tönen und Modulationen kann in Einzelfällen anders deuten
      als eine Lehrkraft.
    </BetaNotice>
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
