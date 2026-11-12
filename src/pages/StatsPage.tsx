import { DetailTable, rate } from '../components/StatsViews';
import { CATALOG } from '../dictation/catalog';
import { KIND_LABELS } from '../dictation/model';
import { CHORD_TYPES, INVERSIONS, chordAnswerId, chordAnswerLabel, ChordType, Inversion } from '../music/chords';
import { INTERVALS, intervalById } from '../music/intervals';
import { aggregateStats, resetStats, useAppData } from '../storage/store';

const MODES = [
  { id: 'harmonic', label: 'gleichzeitig' },
  { id: 'ascending', label: 'aufwärts' },
  { id: 'descending', label: 'abwärts' },
];

function chordLabel(id: string) {
  const [t, inv] = id.split('-');
  return chordAnswerLabel(t as ChordType, (inv as Inversion) ?? null);
}

export default function StatsPage() {
  const data = useAppData();
  const s = aggregateStats(data.stats);
  const level2 = CHORD_TYPES.flatMap((t) =>
    t.id === 'augmented' ? [chordAnswerId(t.id, null)] : INVERSIONS.map((i) => chordAnswerId(t.id, i.id)),
  );
  const attempts = [...data.dictations.attempts].sort((a, b) => b.date - a.date);

  return (
    <div className="stack">
      <h1>Statistik</h1>

      <h2>Intervalle</h2>
      {MODES.map((m) => (
        <details key={m.id} className="card">
          <summary>Wiedergabe {m.label}</summary>
          <DetailTable bucket={s.intervals[m.id]} items={INTERVALS.map((i) => i.id)} labelOf={(id) => intervalById(id).long} />
        </details>
      ))}

      <h2>Akkorde</h2>
      <details className="card">
        <summary>Stufe 1: nur Akkordtyp</summary>
        <DetailTable bucket={s.chords['1']} items={CHORD_TYPES.map((t) => t.id)} labelOf={chordLabel} />
      </details>
      <details className="card">
        <summary>Stufe 2: Typ und Umkehrung</summary>
        <DetailTable bucket={s.chords['2']} items={level2} labelOf={chordLabel} />
      </details>

      <h2>Tonangabe</h2>
      <details className="card">
        <summary>Dur- und Mollakkorde</summary>
        <DetailTable
          bucket={s.pitchGiving}
          items={['major', 'minor']}
          labelOf={(id) => (id === 'major' ? 'Durakkorde' : 'Mollakkorde')}
        />
      </details>

      <h2>Tonbenennung</h2>
      <details className="card">
        <summary>Intervalle und Akkorde</summary>
        <table className="stats">
          <tbody>
            <tr>
              <td>Intervalle</td>
              <td className="num">{s.naming.intervals.correct} richtig</td>
              <td className="num">{s.naming.intervals.wrong} falsch</td>
              <td className="num">{rate(s.naming.intervals)}</td>
            </tr>
            <tr>
              <td>Akkorde</td>
              <td className="num">{s.naming.chords.correct} richtig</td>
              <td className="num">{s.naming.chords.wrong} falsch</td>
              <td className="num">{rate(s.naming.chords)}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <h2>Diktate</h2>
      <details className="card">
        <summary>Geprüfte Diktate ({attempts.length})</summary>
        {attempts.length === 0 ? (
          <p className="muted small">Noch keine Diktate geprüft.</p>
        ) : (
          <div className="table-wrap">
            <table className="stats">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Diktat</th>
                  <th>Tonhöhe</th>
                  <th>Folge</th>
                  <th>Rhythmus</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const e = CATALOG.find((c) => c.id === a.dictationId);
                  return (
                    <tr key={a.id}>
                      <td>{new Date(a.date).toLocaleDateString('de-DE')}</td>
                      <td>{e ? `${KIND_LABELS[e.kind]} ${e.number}` : a.dictationId}</td>
                      {a.pitchErrors === null ? (
                        <td colSpan={3} className="muted">
                          Papier, selbst kontrolliert
                        </td>
                      ) : (
                        <>
                          <td className="num">{a.pitchErrors}</td>
                          <td className="num">{a.followErrors}</td>
                          <td className="num">{e?.kind === 'four-part' ? '–' : a.rhythmErrors}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <h2>Daten löschen</h2>
      <div className="row">
        <button
          onClick={() => confirm('Statistik der Intervalle, Akkorde und Tonangabe löschen?') && resetStats('exercises')}
        >
          Übungsstatistik löschen
        </button>
        <button
          onClick={() => confirm('Alle Diktatversuche und angefangenen Diktate löschen?') && resetStats('dictations')}
        >
          Diktate löschen
        </button>
      </div>
    </div>
  );
}
