import { useEffect, useRef } from 'react';
import { germanName, isBlackKey, mod, spellForKey } from '../music/pitch';

interface Props {
  low: number;
  high: number;
  keyFifths: number;
  onKey: (midi: number) => void;
  disabled?: boolean;
}

const WHITE_W = 40;
const BLACK_W = 26;

/** Bildschirm-Klaviatur; schwarze Tasten werden passend zur Tonart benannt. */
export default function Piano({ low, high, keyFifths, onKey, disabled }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  // Bereich auf weiße Tasten erweitern
  let lo = low;
  while (isBlackKey(lo)) lo--;
  let hi = high;
  while (isBlackKey(hi)) hi++;
  const keys: { midi: number; black: boolean; x: number }[] = [];
  let whiteIndex = 0;
  for (let m = lo; m <= hi; m++) {
    if (isBlackKey(m)) keys.push({ midi: m, black: true, x: whiteIndex * WHITE_W - BLACK_W / 2 });
    else {
      keys.push({ midi: m, black: false, x: whiteIndex * WHITE_W });
      whiteIndex++;
    }
  }

  // Mitte (eingestrichenes c) sichtbar machen
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const c4 = keys.find((k) => k.midi === 60);
    if (c4) el.scrollLeft = Math.max(0, c4.x - el.clientWidth / 2 + WHITE_W);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);

  return (
    <div className="piano-wrap" ref={wrap}>
      <div className="piano" style={{ width: whiteIndex * WHITE_W }} role="group" aria-label="Klaviatur">
        {keys.map((k) => {
          const p = spellForKey(k.midi, keyFifths);
          const name = germanName(p, true);
          const label = mod(k.midi, 12) === 0 ? `${name}${octaveMark(k.midi)}` : name;
          return (
            <button
              key={k.midi}
              className={k.black ? 'black' : 'white'}
              style={k.black ? { left: k.x } : undefined}
              disabled={disabled}
              onClick={() => onKey(k.midi)}
              aria-label={`Taste ${name}${octaveMark(k.midi)}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function octaveMark(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return octave >= 4 ? "'".repeat(octave - 3) : octave === 3 ? '' : '';
}
