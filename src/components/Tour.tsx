import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { getState, markTourSeen } from '../storage/store';

export interface TourStep {
  /** CSS selector of the element to highlight (optional) */
  selector?: string;
  title: string;
  text: string;
}

/**
 * Simple guided tour: starts automatically on first visit and can be
 * restarted via the help button.
 */
export function useTour(id: string, steps: TourStep[]) {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    if (getState().tours.includes(id)) return;
    const t = window.setTimeout(() => setIndex(0), 400);
    return () => window.clearTimeout(t);
  }, [id]);

  const start = useCallback(() => setIndex(0), []);
  const close = useCallback(() => {
    setIndex(null);
    markTourSeen(id);
  }, [id]);

  const element =
    index === null ? null : (
      <TourOverlay
        step={steps[index]}
        index={index}
        count={steps.length}
        onNext={() => (index + 1 < steps.length ? setIndex(index + 1) : close())}
        onBack={() => setIndex(Math.max(0, index - 1))}
        onClose={close}
      />
    );
  return { start, element };
}

function TourOverlay({
  step,
  index,
  count,
  onNext,
  onBack,
  onClose,
}: {
  step: TourStep;
  index: number;
  count: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = step.selector ? document.querySelector(step.selector) : null;
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      setRect(el.getBoundingClientRect());
    } else setRect(null);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const popStyle: React.CSSProperties = rect
    ? {
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
        top: rect.bottom + 12 + 180 < window.innerHeight ? rect.bottom + 12 : Math.max(16, rect.top - 192),
      }
    : { left: '50%', top: '30%', transform: 'translateX(-50%)' };

  return (
    <>
      {rect ? (
        <div
          className="tour-highlight"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      ) : (
        <div className="overlay" style={{ zIndex: 105 }} />
      )}
      <div className="tour-pop" style={popStyle} role="dialog" aria-modal="true" aria-label={step.title}>
        <div className="muted small">
          Schritt {index + 1} von {count}
        </div>
        <h2 style={{ marginTop: 4 }}>{step.title}</h2>
        <p>{step.text}</p>
        <div className="row">
          <button className="ghost" onClick={onClose}>
            Beenden
          </button>
          <span className="spacer" />
          {index > 0 && <button onClick={onBack}>Zurück</button>}
          <button className="primary" onClick={onNext} autoFocus>
            {index + 1 < count ? 'Weiter' : 'Fertig'}
          </button>
        </div>
      </div>
    </>
  );
}
