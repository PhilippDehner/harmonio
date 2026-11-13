import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isPlaying, play, stopAll } from '../audio/engine';
import { durationTicks } from '../dictation/model';
import { violationMarks } from '../satz/marks';
import { parseVoice } from '../satz/notation';
import { satzSounds } from '../satz/playback';
import { RULE_INFO, RuleExample, RuleInfo } from '../satz/ruleInfo';
import { checkSatz } from '../satz/rules';
import SatzScore from '../satz/SatzScore';
import { useSettings } from '../storage/store';

function Example({ info, kind }: { info: RuleInfo; kind: 'wrong' | 'right' }) {
  const ex: RuleExample = info[kind];
  const { theme } = useSettings();
  const data = useMemo(() => {
    const voices = ex.voices.map((t, v) => parseVoice(t, `${info.id}-${kind}-${v}-`));
    const total = Math.max(...voices.flat().map((n) => n.start + durationTicks(n.dur)));
    const measures = [{ start: 0, ticks: total }];
    const r = checkSatz({ voices, measures, keyFifths: 0, mode: 'choir', fragment: info.fragment });
    return { voices, measures, violations: r.violations };
  }, [ex, info, kind]);
  // `theme`: recompute colors after switching the color scheme
  const marks = useMemo(() => violationMarks(data.violations), [data.violations, theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`rule-example ${kind}`}>
      <div className="row" style={{ gap: 8 }}>
        <b className={kind === 'wrong' ? 'text-err' : 'text-ok'}>{kind === 'wrong' ? '✗ Falsch' : '✓ Richtig'}</b>
        <button
          className="small"
          onClick={() => {
            if (isPlaying()) stopAll();
            else void play({ sounds: satzSounds(data.voices, 60) });
          }}
          aria-label={`${kind === 'wrong' ? 'Falsches' : 'Richtiges'} Beispiel anhören`}
        >
          ▶ Anhören
        </button>
      </div>
      <SatzScore
        ariaLabel={`${info.title}: ${kind === 'wrong' ? 'falsches' : 'richtiges'} Beispiel`}
        keyFifths={0}
        beats={4}
        beatType={4}
        measures={data.measures}
        voices={data.voices}
        scale={1}
        pxPerQuarter={34}
        noteStyles={kind === 'wrong' ? marks.noteStyles : undefined}
        lines={kind === 'wrong' ? marks.lines : undefined}
      />
      <p className="small muted" style={{ margin: 0 }}>
        {ex.caption}
      </p>
    </div>
  );
}

export default function SatzRulesPage() {
  const { ruleId } = useParams();
  useEffect(() => {
    if (!ruleId) return;
    const el = document.getElementById(`regel-${ruleId}`);
    el?.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
  }, [ruleId]);
  useEffect(() => () => stopAll(), []);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Tonsatz: Regeln</h1>
        <span className="spacer" />
        <Link className="btn" to="/satz">
          Zur Liedliste
        </Link>
      </div>
      <p className="muted">
        Diese Regeln prüft Harmonio bei jedem Satz – immer das volle Regelwerk. Zu jeder Regel gibt es ein falsches und ein
        richtiges Beispiel in C-Dur (Chorsatz) zum Anhören. Grenzfälle zählen als Fehler.
      </p>
      <nav className="card small rule-index" aria-label="Regeln">
        {RULE_INFO.map((r, i) => (
          <Link key={r.id} to={`/satz/regeln/${r.id}`}>
            {i + 1}. {r.title}
          </Link>
        ))}
      </nav>
      {RULE_INFO.map((info, i) => (
        <section key={info.id} id={`regel-${info.id}`} className={`card stack rule-card ${ruleId === info.id ? 'focus' : ''}`}>
          <h2 style={{ margin: 0 }}>
            {i + 1}. {info.title}
          </h2>
          <p style={{ margin: 0 }}>{info.text}</p>
          <div className="rule-examples">
            <Example info={info} kind="wrong" />
            <Example info={info} kind="right" />
          </div>
        </section>
      ))}
    </div>
  );
}
