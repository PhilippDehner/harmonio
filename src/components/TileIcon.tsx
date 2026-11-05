/** Kleine Notensymbole für die Kacheln der Startseite (reines SVG, folgt der Textfarbe). */

export type TileIconKind = 'interval' | 'chord' | 'mono' | 'two' | 'four';

/** Notenkopf: x-Position, Stufe (0 = unterste Linie, 2 = zweite Linie …), gefüllt?, Hals. */
type N = { x: number; s: number; filled?: boolean; stem?: 'up' | 'down' };
type Staff = { top: number; notes: N[] };

const SP = 5; // Linienabstand
const W = 120;
const H = 60;
const STEM = 3.5 * SP;

function yOf(top: number, s: number) {
  return top + 4 * SP - (s * SP) / 2;
}

function StaffSvg({ top, notes }: Staff) {
  const lines = [0, 1, 2, 3, 4].map((i) => top + i * SP);
  return (
    <g>
      {lines.map((y) => (
        <line key={y} x1={4} x2={W - 4} y1={y} y2={y} strokeWidth={0.8} opacity={0.55} />
      ))}
      <line x1={W - 4} x2={W - 4} y1={top} y2={top + 4 * SP} strokeWidth={0.8} opacity={0.55} />
      {notes.map((n, i) => {
        const y = yOf(top, n.s);
        const ledgers: number[] = [];
        for (let s = -2; s >= n.s; s -= 2) ledgers.push(s);
        for (let s = 10; s <= n.s; s += 2) ledgers.push(s);
        const rx = 3.3;
        return (
          <g key={i}>
            {ledgers.map((s) => (
              <line key={s} x1={n.x - 5.5} x2={n.x + 5.5} y1={yOf(top, s)} y2={yOf(top, s)} strokeWidth={0.8} />
            ))}
            <ellipse
              cx={n.x}
              cy={y}
              rx={rx}
              ry={2.4}
              transform={`rotate(-20 ${n.x} ${y})`}
              fill={n.filled ? 'currentColor' : 'none'}
              strokeWidth={n.filled ? 0 : 1.3}
            />
            {n.stem === 'up' && <line x1={n.x + rx - 0.4} x2={n.x + rx - 0.4} y1={y - 0.5} y2={y - STEM} strokeWidth={1} />}
            {n.stem === 'down' && <line x1={n.x - rx + 0.4} x2={n.x - rx + 0.4} y1={y + 0.5} y2={y + STEM} strokeWidth={1} />}
          </g>
        );
      })}
    </g>
  );
}

const SINGLE_TOP = (H - 4 * SP) / 2;

const ICONS: Record<TileIconKind, Staff[]> = {
  // Quinte, gleichzeitig
  interval: [{ top: SINGLE_TOP, notes: [{ x: 60, s: 0 }, { x: 60, s: 4 }] }],
  // Septakkord in Terzschichtung
  chord: [{ top: SINGLE_TOP, notes: [2, 4, 6, 8].map((s) => ({ x: 60, s })) }],
  // kurze Melodie
  mono: [
    {
      top: SINGLE_TOP,
      notes: [
        { x: 22, s: 2, filled: true, stem: 'up' },
        { x: 44, s: 4, filled: true, stem: 'up' },
        { x: 66, s: 3, filled: true, stem: 'up' },
        { x: 88, s: 7, filled: true, stem: 'down' },
        { x: 106, s: 6, filled: true, stem: 'down' },
      ],
    },
  ],
  // zwei Stimmen: oben Hals nach oben, unten Hals nach unten
  two: [
    {
      top: SINGLE_TOP,
      notes: [
        ...[6, 7, 8, 7].map((s, i) => ({ x: 24 + i * 26, s, filled: true, stem: 'up' as const })),
        ...[1, 2, 1, 0].map((s, i) => ({ x: 24 + i * 26, s, filled: true, stem: 'down' as const })),
      ],
    },
  ],
  // vierstimmiger Satz auf zwei Systemen (ganze Noten)
  four: [
    { top: 8, notes: [[8, 4], [7, 5], [8, 4]].flatMap(([a, b], i) => [{ x: 30 + i * 32, s: a }, { x: 30 + i * 32, s: b }]) },
    { top: 36, notes: [[6, 2], [5, 0], [6, 2]].flatMap(([a, b], i) => [{ x: 30 + i * 32, s: a }, { x: 30 + i * 32, s: b }]) },
  ],
};

export default function TileIcon({ kind }: { kind: TileIconKind }) {
  const staves = ICONS[kind];
  return (
    <svg className="tile-icon" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" stroke="currentColor" fill="none">
      {kind === 'four' && <line x1={4} x2={4} y1={8} y2={36 + 4 * SP} strokeWidth={0.8} opacity={0.55} />}
      {staves.map((st, i) => (
        <StaffSvg key={i} {...st} />
      ))}
    </svg>
  );
}
