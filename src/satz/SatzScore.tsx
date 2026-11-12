import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSettings } from '../storage/store';
import { SatzLayout, SatzRenderInput, hitTestSatz, noteNear, renderSatz } from './render';

export type SatzHit = NonNullable<ReturnType<typeof hitTestSatz>> & { note: { id: string; voice: number } | null };

type Props = Omit<SatzRenderInput, 'width'> & {
  className?: string;
  ariaLabel: string;
  onHit?: (hit: SatzHit) => void;
  /** Follow the playback position by scrolling */
  follow?: boolean;
  id?: string;
  /** Receives the rendered element (e.g. for printing) */
  onRendered?: (el: HTMLDivElement) => void;
};

/** React wrapper for the four-part score with click handling and auto-scroll. */
export default function SatzScore({ className, ariaLabel, onHit, follow, id, onRendered, ...input }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<SatzLayout | null>(null);
  const [width, setWidth] = useState(0);
  const { theme } = useSettings();
  void theme;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!ref.current || width <= 0) return;
    try {
      layoutRef.current = renderSatz(ref.current, { ...input, width });
      onRendered?.(ref.current);
    } catch (e) {
      console.error(e);
    }
  });

  // Keep the playback position in view
  useEffect(() => {
    if (!follow || input.playTick == null || !layoutRef.current || !wrap.current) return;
    const m = layoutRef.current.measures.find((ml) => {
      const mm = input.measures[ml.index];
      return input.playTick! >= mm.start && input.playTick! < mm.start + mm.ticks;
    });
    if (!m) return;
    const box = wrap.current;
    if (input.singleLine) {
      if (m.left < box.scrollLeft || m.right > box.scrollLeft + box.clientWidth) {
        box.scrollTo({ left: Math.max(0, m.left - 40), behavior: 'smooth' });
      }
    } else {
      const rect = box.getBoundingClientRect();
      const top = rect.top + m.top;
      const bottom = top + (m.staves[1]?.bottom ?? 0) - m.top;
      if (top < 60 || bottom > window.innerHeight - 20) {
        window.scrollTo({ top: window.scrollY + top - 80, behavior: 'smooth' });
      }
    }
  }, [follow, input.playTick, input.measures, input.singleLine]);

  return (
    <div ref={wrap} id={id} className={`satz-score ${input.singleLine ? 'single-line' : ''} ${className ?? ''}`}>
      <div
        ref={ref}
        className={`score ${onHit ? 'clickable' : ''}`}
        role={onHit ? 'application' : 'img'}
        aria-label={ariaLabel}
        onClick={(e) => {
          if (!onHit || !layoutRef.current || !ref.current) return;
          const rect = ref.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const hit = hitTestSatz(layoutRef.current, input.measures, x, y);
          if (hit) onHit({ ...hit, note: noteNear(layoutRef.current, x, y) });
        }}
      />
    </div>
  );
}
