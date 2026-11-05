import { Counts } from '../storage/store';

export function rate(c: { correct: number; wrong: number }): string {
  const total = c.correct + c.wrong;
  return total === 0 ? '–' : `${Math.round((c.correct / total) * 100)} %`;
}

export function LiveStats({ correct, wrong }: { correct: number; wrong: number }) {
  return (
    <div className="live-stats" aria-live="polite">
      <span>
        Richtig: <b>{correct}</b>
      </span>
      <span>
        Falsch: <b>{wrong}</b>
      </span>
      <span>
        Trefferquote: <b>{rate({ correct, wrong })}</b>
      </span>
    </div>
  );
}

/** Tabelle: Werte pro Intervall/Akkord und häufige Verwechslungen. */
export function DetailTable({
  bucket,
  items,
  labelOf,
}: {
  bucket: Record<string, Counts> | undefined;
  items: string[];
  labelOf: (id: string) => string;
}) {
  const rows = items.map((id) => ({ id, c: bucket?.[id] ?? { correct: 0, wrong: 0, confusions: {} } }));
  const any = rows.some((r) => r.c.correct + r.c.wrong > 0);
  if (!any) return <p className="muted small">Noch keine Daten.</p>;
  return (
    <div className="table-wrap">
      <table className="stats">
        <thead>
          <tr>
            <th scope="col">Aufgabe</th>
            <th scope="col">Richtig</th>
            <th scope="col">Falsch</th>
            <th scope="col">Quote</th>
            <th scope="col">Häufig verwechselt mit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, c }) => {
            const conf = Object.entries(c.confusions ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([k, n]) => `${labelOf(k)} (${n}×)`)
              .join(', ');
            return (
              <tr key={id}>
                <td>{labelOf(id)}</td>
                <td className="num">{c.correct}</td>
                <td className="num">{c.wrong}</td>
                <td className="num">{rate(c)}</td>
                <td>{conf || '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
