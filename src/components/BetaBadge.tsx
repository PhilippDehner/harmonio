/** Marks a feature that is still being tested. */
export default function BetaBadge() {
  return (
    <span className="beta-badge" title="Beta: Diese Funktion wird noch erprobt.">
      Beta
    </span>
  );
}

/** Short notice shown on beta pages. */
export function BetaNotice() {
  return (
    <p className="muted small" style={{ margin: 0 }}>
      Die Tonangabe ist noch in Erprobung. Die Tonerkennung kann je nach Mikrofon, Raum und Stimme ungenau
      sein.
    </p>
  );
}
