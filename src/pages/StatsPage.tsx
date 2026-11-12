import { DetailTable, rate } from '../components/StatsViews';
import { CATALOG } from '../dictation/catalog';
import { KIND_LABELS } from '../dictation/model';
import { CHORD_TYPES, INVERSIONS, chordAnswerId, chordAnswerLabel, ChordType, Inversion } from '../music/chords';
import { INTERVALS, intervalById } from '../music/intervals';
import { RULE_IDS, RULE_TITLES } from '../satz/rules';
import { aggregateStats, resetStats, satzFirstChecks, useAppData } from '../storage/store';

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
  const firstChecks = satzFirstChecks(data.satz);
  const ruleCounts: Record<string, number> = {};
  for (const a of firstChecks) for (const [r, n] of Object.entries(a.violations)) ruleCounts[r] = (ruleCounts[r] ?? 0) + n;
  const analysisErrors = firstChecks.reduce((s2, a) => s2 + a.analysisErrors, 0);
  const analysisLabels = firstChecks.reduce((s2, a) => s2 + a.analysisLabels, 0);
  const direct = Object.values(data.satz.direct);
  const directShown: Record<string, number> = {};
  for (const d of direct) for (const [r, n] of Object.entries(d.shown)) directShown[r] = (directShown[r] ?? 0) + n;
  const directSessions = direct.reduce((s2, d) => s2 + d.sessions, 0);

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

      <h2>Tonsatz</h2>
      <details className="card">
        <summary>Regelverstöße bei der ersten Prüfung ({firstChecks.length} Sätze)</summary>
        {firstChecks.length === 0 ? (
          <p className="muted small">Noch kein Satz geprüft. Es zählt nur die erste Prüfung eines Satzes (ohne Direktmodus).</p>
        ) : (
          <table className="stats">
            <tbody>
              {RULE_IDS.filter((r) => ruleCounts[r]).sort((a, b) => ruleCounts[b] - ruleCounts[a]).map((r) => (
                <tr key={r}>
                  <td>{RULE_TITLES[r]}</td>
                  <td className="num">{ruleCounts[r]}×</td>
                </tr>
              ))}
              {RULE_IDS.every((r) => !ruleCounts[r]) && (
                <tr>
                  <td colSpan={2}>Keine Regelverstöße.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </details>
      <details className="card">
        <summary>Harmonieanalyse</summary>
        <p className="small" style={{ margin: 0 }}>
          {analysisLabels === 0
            ? 'Noch keine Analyse geprüft.'
            : `${analysisLabels - analysisErrors} von ${analysisLabels} Angaben richtig, ${analysisErrors} falsch (erste Prüfung je Satz).`}
        </p>
      </details>
      <details className="card">
        <summary>Direktmodus ({directSessions}× bearbeitet)</summary>
        {Object.keys(directShown).length === 0 ? (
          <p className="muted small">Im Direktmodus wurden noch keine Fehler angezeigt.</p>
        ) : (
          <table className="stats">
            <thead>
              <tr>
                <th>Regel</th>
                <th>angezeigt</th>
              </tr>
            </thead>
            <tbody>
              {RULE_IDS.filter((r) => directShown[r]).sort((a, b) => directShown[b] - directShown[a]).map((r) => (
                <tr key={r}>
                  <td>{RULE_TITLES[r]}</td>
                  <td className="num">{directShown[r]}×</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <button onClick={() => confirm('Alle Tonsatz-Prüfungen, angefangenen Sätze und die Direktmodus-Statistik löschen? Hochgeladene Melodien bleiben erhalten.') && resetStats('satz')}>
          Tonsatz löschen
        </button>
      </div>
    </div>
  );
}
