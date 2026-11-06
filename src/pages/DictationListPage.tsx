import { Link, useNavigate, useParams } from 'react-router-dom';
import { KINDS, entriesOf, pickRandom } from '../dictation/catalog';
import { DictationKind, KIND_LABELS } from '../dictation/model';
import BetaBadge, { ChoraleBetaNotice } from '../components/BetaBadge';
import { dictationStatus, useAppData } from '../storage/store';

export default function DictationListPage() {
  const { kind: kindParam } = useParams();
  const kind = (KINDS.includes(kindParam as DictationKind) ? kindParam : 'monophonic') as DictationKind;
  const data = useAppData();
  const navigate = useNavigate();
  const entries = entriesOf(kind);
  const done = new Set(data.dictations.attempts.map((a) => a.dictationId));

  return (
    <div className="stack">
      <h1>
        {KIND_LABELS[kind]}
        {kind === 'four-part' && <BetaBadge />}
      </h1>
      {kind === 'four-part' && <ChoraleBetaNotice />}
      <p className="muted">
        Wähle ein Diktat aus der Liste oder lass dir eines zufällig geben. Noch nicht gemachte Diktate werden dabei
        bevorzugt.
      </p>
      <div className="row">
        <button
          className="primary"
          disabled={entries.length === 0}
          onClick={() => {
            const e = pickRandom(kind, done);
            if (e) navigate(`/dictation/${kind}/${e.number}`);
          }}
        >
          🎲 Zufälliges Diktat
        </button>
        <span className="muted small">
          <span className="status-icon status-done">✓</span> erledigt · <span className="status-icon status-started">◐</span>{' '}
          angefangen
        </span>
      </div>
      {entries.length === 0 ? (
        <p>In dieser Kategorie gibt es noch keine Diktate.</p>
      ) : (
        <ul className="dict-list">
          {entries.map((e) => {
            const status = dictationStatus(data.dictations, e.id);
            return (
              <li key={e.id}>
                <Link to={`/dictation/${kind}/${e.number}`}>
                  <span>Diktat {e.number}</span>
                  <span
                    className={`status-icon status-${status}`}
                    aria-label={status === 'done' ? 'erledigt' : status === 'started' ? 'angefangen' : 'offen'}
                  >
                    {status === 'done' ? '✓' : status === 'started' ? '◐' : ''}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
