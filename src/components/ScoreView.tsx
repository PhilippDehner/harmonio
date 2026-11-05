import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RenderInput, ScoreLayout, hitTest, renderScore } from '../score/render';
import { useSettings } from '../storage/store';

type Props = Omit<RenderInput, 'width'> & {
  className?: string;
  onHit?: (hit: NonNullable<ReturnType<typeof hitTest>>, layout: ScoreLayout, raw: { x: number; y: number }) => void;
  ariaLabel: string;
};

/** React-Hülle für den VexFlow-Notensatz mit Klickauswertung. */
export default function ScoreView({ className, onHit, ariaLabel, ...input }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<ScoreLayout | null>(null);
  const [width, setWidth] = useState(0);
  const { theme } = useSettings();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || width <= 0) return;
    try {
      layoutRef.current = renderScore(ref.current, { ...input, width });
    } catch (e) {
      console.error(e);
    }
  });
  // `theme` sorgt für Neuzeichnen beim Umschalten des Farbschemas
  void theme;

  return (
    <div
      ref={ref}
      className={`score ${onHit ? 'clickable' : ''} ${className ?? ''}`}
      role={onHit ? 'application' : 'img'}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!onHit || !layoutRef.current || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const hit = hitTest(layoutRef.current, input.measures, x, y);
        if (hit) onHit(hit, layoutRef.current, { x, y });
      }}
    />
  );
}
