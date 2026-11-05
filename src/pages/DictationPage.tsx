import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isPlaying, onAudioState, play, stopAll, transportSeconds } from '../audio/engine';
import { useHotkeys } from '../components/hotkeys';
import ScoreView from '../components/ScoreView';
import { useTour } from '../components/Tour';
import DictationEditor, { staffDefs } from '../dictation/DictationEditor';
import { KINDS, loadDictation, pickRandom } from '../dictation/catalog';
import { initialInput } from '../dictation/editing';
import { VoiceResult, evaluateChorale, evaluateVoice, summarize } from '../dictation/evaluate';
import { DNote, Dictation, DictationKind, KIND_LABELS, newId, sortNotes } from '../dictation/model';
import { introPlan, melodySeconds, secondsPerTick, voiceSounds } from '../dictation/playback';
import { germanNameWithOctave } from '../music/pitch';
import { NoteStyle } from '../score/render';
import {
  DictationAttempt,
  InputMode,
  addAttempt,
  clearProgress,
  getState,
  saveProgress,
  updateSettings,
  useAppData,
} from '../storage/store';

const MODE_LABELS: Record<InputMode, string> = {
  papier: 'Papier',
  klaviatur: 'Klaviatur',
  notenblatt: 'Notenblatt',
};

function evaluate(d: Dictation, input: DNote[][]): VoiceResult[] {
  if (d.kind === 'vierstimmig') return evaluateChorale(d.voices, input);
  return d.voices.map((sol, i) => evaluateVoice(sol, input[i] ?? []));
}

function stylesFor(results: VoiceResult[], cssVar: (n: string) => string): Record<string, NoteStyle> {
  const styles: Record<string, NoteStyle> = {};
  const err = cssVar('--err');
  const follow = cssVar('--follow');
  const rhythm = cssVar('--rhythm');
  for (const r of results) {
    for (const n of r.notes) {
      const head = n.pitch === 'error' ? err : n.pitch === 'follow' ? follow : n.rhythmError ? rhythm : undefined;
      styles[n.noteId] = { head, stem: n.rhythmError ? rhythm : undefined };
    }
    for (const id of r.missing) styles[id] = { head: rhythm, stem: rhythm };
  }
  return styles;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Neu einhängen bei jedem Diktatwechsel, damit kein Zustand übernommen wird. */
export default function DictationRoute() {
  const { kind, id } = useParams();
  return <DictationPage key={`${kind}-${id}`} />;
}

function DictationPage() {
  const { kind: kindParam, id: numParam } = useParams();
  const kind = (KINDS.includes(kindParam as DictationKind) ? kindParam : 'einstimmig') as DictationKind;
  const dictationId = `${kind}-${numParam}`;
  const navigate = useNavigate();
  const data = useAppData();
  const mode = data.settings.inputMode;

  const [d, setD] = useState<Dictation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [askResume, setAskResume] = useState(false);
  const [input, setInputState] = useState<DNote[][]>([]);
  const [measure, setMeasure] = useState(0);
  const [paperPos, setPaperPos] = useState(0);
  const [introPlayed, setIntroPlayed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [checked, setChecked] = useState<{ results: VoiceResult[] | null; input: DNote[][] | null } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [viewAttempt, setViewAttempt] = useState<DictationAttempt | null>(null);
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [playing, setPlaying] = useState(isPlaying());
  const playRef = useRef<{ from: number; offset: number } | null>(null);

  const tour = useTour('diktat', [
    { title: 'Diktat', text: 'Höre die Melodie und notiere sie. Taktart, Tonart (Vorzeichen) und Anfangstöne sind vorgegeben.' },
    { selector: '#dk-mode', title: 'Eingabe', text: 'Schreibe auf Papier und kontrolliere selbst, oder gib die Noten über Klaviatur oder Notenblatt ein.' },
    { selector: '#dk-play', title: 'Abspielen', text: 'Beim ersten Abspielen erklingen Kadenz und Einzählen. Danach spielst du ab der gewählten Stelle (Leertaste: Abspielen und Stopp).' },
    { selector: '#dk-check', title: 'Prüfen', text: 'Am Ende wird ausgewertet: Fehler, Folgefehler und Rhythmusfehler werden farbig markiert.' },
  ]);

  // Laden
  useEffect(() => {
    let cancelled = false;
    setD(null);
    setChecked(null);
    setShowSolution(false);
    setViewAttempt(null);
    loadDictation(dictationId)
      .then((dict) => {
        if (cancelled) return;
        setD(dict);
        const progress = getState().dictations.progress[dictationId];
        if (progress) setAskResume(true);
        else startFresh(dict);
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictationId]);

  useEffect(() => onAudioState(() => setPlaying(isPlaying())), []);

  function startFresh(dict: Dictation) {
    setInputState(initialInput(dict));
    setMeasure(0);
    setPaperPos(0);
    setIntroPlayed(false);
    setTouched(false);
    setChecked(null);
    setShowSolution(false);
    setViewAttempt(null);
  }

  function resume() {
    const p = getState().dictations.progress[dictationId];
    if (p && d) {
      setInputState(p.input.length ? p.input : initialInput(d));
      if (p.mode === 'papier') setPaperPos(p.position);
      else setMeasure(Math.min(p.position, d.measures.length - 1));
      setIntroPlayed(p.introPlayed);
      setTouched(true);
      if (p.mode !== mode) updateSettings({ inputMode: p.mode });
    }
    setAskResume(false);
  }

  // Zwischenstand speichern
  useEffect(() => {
    if (!d || !touched || checked) return;
    saveProgress({
      dictationId,
      updated: Date.now(),
      mode,
      input,
      position: mode === 'papier' ? paperPos : measure,
      introPlayed,
    });
  }, [d, touched, checked, input, measure, paperPos, introPlayed, mode, dictationId]);

  // Fortschritt der Wiedergabe (Zeitleiste im Papier-Modus)
  useEffect(() => {
    if (!playing || !d) return;
    let raf = 0;
    const tick = () => {
      const ref = playRef.current;
      if (ref) {
        const pos = ref.from + Math.max(0, transportSeconds() - ref.offset);
        if (mode === 'papier') setPaperPos(Math.min(pos, melodySeconds(d)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, d, mode]);

  const setInput = useCallback((v: DNote[][]) => {
    setInputState(v);
    setTouched(true);
  }, []);

  const startPlayback = useCallback(() => {
    if (!d) return;
    if (isPlaying()) {
      stopAll();
      return;
    }
    const spt = secondsPerTick(d.tempo);
    if (!introPlayed) {
      const intro = introPlan(d);
      const sounds = [...intro.sounds, ...voiceSounds(d.voices, d.tempo, 0, intro.melodyOffset)];
      playRef.current = { from: 0, offset: intro.melodyOffset + 0.05 };
      void play({ sounds, clicks: intro.clicks });
      setIntroPlayed(true);
      setTouched(true);
      return;
    }
    const fromTick = mode === 'papier' ? 0 : d.measures[measure].start;
    let fromSec = mode === 'papier' ? paperPos : fromTick * spt;
    if (mode === 'papier' && fromSec >= melodySeconds(d) - 0.05) fromSec = 0;
    playRef.current = { from: fromSec, offset: 0.05 };
    void play({ sounds: voiceSounds(d.voices, d.tempo, 0), from: fromSec });
  }, [d, introPlayed, mode, measure, paperPos]);

  function playOwnInput() {
    if (!d) return;
    const shown = viewAttempt?.input ?? checked?.input ?? input;
    const fromTick = d.measures[measure].start;
    playRef.current = null;
    void play({ sounds: voiceSounds(shown, d.tempo, fromTick) });
  }

  function doCheck() {
    if (!d) return;
    stopAll();
    setConfirmCheck(false);
    if (mode === 'papier') {
      addAttempt({
        id: newId('a'),
        dictationId,
        date: Date.now(),
        mode,
        pitchErrors: null,
        rhythmErrors: null,
        followErrors: null,
        input: null,
      });
      setChecked({ results: null, input: null });
      setShowSolution(true);
      return;
    }
    const results = evaluate(d, input);
    const s = summarize(results);
    addAttempt({
      id: newId('a'),
      dictationId,
      date: Date.now(),
      mode,
      pitchErrors: s.pitchErrors,
      rhythmErrors: s.rhythmErrors,
      followErrors: s.followErrors,
      input,
    });
    setChecked({ results, input });
    setShowSolution(false);
  }

  useHotkeys((e) => {
    if (!d || askResume) return;
    if (e.key === ' ') {
      e.preventDefault();
      startPlayback();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey) {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (mode === 'papier') {
        stopAll();
        setPaperPos((p) => Math.max(0, Math.min(melodySeconds(d), p + dir * 5)));
      } else setMeasure((m) => Math.max(0, Math.min(d.measures.length - 1, m + dir)));
    }
  });

  const attempts = data.dictations.attempts.filter((a) => a.dictationId === dictationId);
  const nextRandom = () => {
    const done = new Set(getState().dictations.attempts.map((a) => a.dictationId));
    done.add(dictationId);
    const e = pickRandom(kind, done);
    if (e) navigate(`/diktat/${kind}/${e.number}`);
  };

  const evaluation = useMemo(() => {
    if (!d) return null;
    if (viewAttempt?.input) return { results: evaluate(d, viewAttempt.input), input: viewAttempt.input };
    if (checked?.results && checked.input) return { results: checked.results, input: checked.input };
    return null;
  }, [d, viewAttempt, checked]);

  if (error) return <p>Fehler: {error}</p>;
  if (!d) return <p>Lade Diktat …</p>;

  const staves = staffDefs(d);
  const chorale = d.kind === 'vierstimmig';
  const startNotes = d.voices.map((v) => sortNotes(v)[0]).filter(Boolean);
  const locked = checked !== null || viewAttempt !== null;
  const summary = evaluation ? summarize(evaluation.results) : null;

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>
          {KIND_LABELS[d.kind]} {d.number}
        </h1>
        <span className="spacer" />
        <Link className="btn" to={`/diktat/${kind}`}>
          Liste
        </Link>
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          ? Hilfe
        </button>
      </div>

      <div className="card small">
        {!chorale && (
          <>
            Taktart: <b>{d.beats}/{d.beatType}</b> ·{' '}
          </>
        )}
        {chorale ? (
          <>
            {d.measures.length} Akkorde · erster Akkord vorgegeben
          </>
        ) : (
          <>
            Anfangston{startNotes.length > 1 ? 'e' : ''}:{' '}
            <b>{startNotes.map((n) => germanNameWithOctave(n.pitch)).join(' / ')}</b>
          </>
        )}
      </div>

      {!locked && (
        <div className="toolbar" id="dk-mode">
          <span>Eingabe:</span>
          <div className="segmented" role="group" aria-label="Eingabemodus">
            {(Object.keys(MODE_LABELS) as InputMode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => updateSettings({ inputMode: m })}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="play-area card">
        <button id="dk-play" className="primary" onClick={startPlayback}>
          {playing ? '■ Stopp' : '▶ Abspielen'} <kbd className="hint">Leertaste</kbd>
        </button>
        {mode !== 'papier' && (
          <button onClick={playOwnInput} disabled={playing}>
            Eigene Eingabe anhören
          </button>
        )}
        {!introPlayed && <span className="muted small">Beim ersten Abspielen: Kadenz und Einzählen</span>}
      </div>

      {mode === 'papier' && (
        <div className="card timeline">
          <label className="small" htmlFor="dk-timeline">
            Position: {formatTime(paperPos)} / {formatTime(melodySeconds(d))}{' '}
            <span className="muted">(Pfeiltasten: ±5 Sekunden)</span>
          </label>
          <input
            id="dk-timeline"
            type="range"
            min={0}
            max={melodySeconds(d)}
            step={0.1}
            value={paperPos}
            onChange={(e) => {
              stopAll();
              setPaperPos(Number(e.target.value));
            }}
          />
          {!showSolution && (
            <ScoreView
              ariaLabel="Vorgaben: Schlüssel, Vorzeichen, Taktart und Anfangstöne"
              keyFifths={d.keyFifths}
              beats={d.beats}
              beatType={d.beatType}
              showTime={!chorale}
              barlines={!chorale}
              measures={d.measures}
              staves={staves}
              voices={initialInput(d)}
              fromMeasure={0}
              toMeasure={Math.min(2, d.measures.length)}
              scale={1}
            />
          )}
        </div>
      )}

      {mode !== 'papier' && !locked && (
        <>
          <p className="hint-landscape muted small">Tipp: Im Querformat ist die Eingabe bequemer.</p>
          <DictationEditor d={d} input={input} setInput={setInput} mode={mode} measure={measure} setMeasure={setMeasure} />
          <div className="overview" title="Übersicht – Takt antippen zum Springen">
            <ScoreView
              ariaLabel="Übersicht der Eingabe"
              keyFifths={d.keyFifths}
              beats={d.beats}
              beatType={d.beatType}
              showTime={!chorale}
              barlines={!chorale}
              measures={d.measures}
              staves={staves}
              voices={input}
              fromMeasure={0}
              toMeasure={d.measures.length}
              scale={0.7}
              highlightMeasure={measure}
              fillRests
              onHit={(hit) => setMeasure(hit.measure)}
            />
          </div>
        </>
      )}

      {!locked && (
        <div className="row" id="dk-check">
          {mode === 'papier' ? (
            <button className="primary" onClick={doCheck}>
              Lösung anzeigen
            </button>
          ) : (
            <button className="primary" onClick={() => setConfirmCheck(true)}>
              Prüfen
            </button>
          )}
          <button onClick={() => { clearProgress(dictationId); startFresh(d); }}>Neu anfangen</button>
        </div>
      )}

      {locked && (
        <div className="stack">
          {evaluation && summary && (
            <>
              <div className="feedback info" role="status">
                {viewAttempt ? `Versuch vom ${new Date(viewAttempt.date).toLocaleString('de-DE')}: ` : 'Auswertung: '}
                Tonhöhenfehler: <b>{summary.pitchErrors}</b> · Folgefehler: <b>{summary.followErrors}</b>
                {!chorale && (
                  <>
                    {' '}
                    · Rhythmusfehler: <b>{summary.rhythmErrors}</b>
                  </>
                )}
              </div>
              <div className="segmented" role="group" aria-label="Ansicht">
                <button aria-pressed={!showSolution} onClick={() => setShowSolution(false)}>
                  Eigene Eingabe
                </button>
                <button aria-pressed={showSolution} onClick={() => setShowSolution(true)}>
                  Lösung
                </button>
              </div>
              <div className="legend">
                <span style={{ ['--c' as string]: 'var(--err)' }}>Fehler (Tonhöhe)</span>
                <span style={{ ['--c' as string]: 'var(--follow)' }}>Folgefehler</span>
                {!chorale && <span style={{ ['--c' as string]: 'var(--rhythm)' }}>Rhythmusfehler / fehlende Note</span>}
              </div>
            </>
          )}
          {(showSolution || evaluation) && (
            <div className="overview" style={{ cursor: 'default' }}>
              <ScoreView
                ariaLabel={showSolution ? 'Lösung' : 'Eigene Eingabe mit Markierungen'}
                keyFifths={d.keyFifths}
                beats={d.beats}
                beatType={d.beatType}
                showTime={!chorale}
                barlines={!chorale}
                measures={d.measures}
                staves={staves}
                voices={showSolution || !evaluation ? d.voices : evaluation.input}
                noteStyles={evaluation ? stylesFor(evaluation.results, cssVar) : undefined}
                fillRests={!showSolution && !!evaluation}
                fromMeasure={0}
                toMeasure={d.measures.length}
                scale={window.innerWidth < 600 ? 0.8 : 1}
              />
            </div>
          )}
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                clearProgress(dictationId);
                startFresh(d);
              }}
            >
              Erneut von vorne
            </button>
            <button onClick={nextRandom}>Nächstes zufälliges Diktat</button>
            <Link className="btn" to={`/diktat/${kind}`}>
              Zur Liste
            </Link>
          </div>
        </div>
      )}

      {attempts.length > 0 && (
        <details className="card">
          <summary>Bisherige Versuche ({attempts.length})</summary>
          <div className="table-wrap">
            <table className="stats">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Eingabe</th>
                  <th>Tonhöhe</th>
                  <th>Folge</th>
                  <th>Rhythmus</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.date).toLocaleString('de-DE')}</td>
                    <td>{MODE_LABELS[a.mode]}</td>
                    {a.pitchErrors === null ? (
                      <td colSpan={3} className="muted">
                        selbst kontrolliert
                      </td>
                    ) : (
                      <>
                        <td className="num">{a.pitchErrors}</td>
                        <td className="num">{a.followErrors}</td>
                        <td className="num">{chorale ? '–' : a.rhythmErrors}</td>
                      </>
                    )}
                    <td>
                      {a.input && (
                        <button
                          onClick={() => {
                            setViewAttempt(a);
                            setShowSolution(false);
                          }}
                        >
                          ansehen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {viewAttempt && !checked && (
            <button onClick={() => setViewAttempt(null)}>Zurück zur eigenen Eingabe</button>
          )}
        </details>
      )}

      {askResume && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="resume-title">
          <div className="dialog stack">
            <h2 id="resume-title" style={{ marginTop: 0 }}>
              Angefangenes Diktat
            </h2>
            <p>Du hast dieses Diktat bereits angefangen. Möchtest du weitermachen oder neu anfangen?</p>
            <div className="row">
              <button className="primary" onClick={resume} autoFocus>
                Weitermachen
              </button>
              <button
                onClick={() => {
                  clearProgress(dictationId);
                  startFresh(d);
                  setAskResume(false);
                }}
              >
                Neu anfangen
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCheck && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="check-title">
          <div className="dialog stack">
            <h2 id="check-title" style={{ marginTop: 0 }}>
              Diktat prüfen?
            </h2>
            <p>Nach dem Prüfen sind keine Änderungen mehr möglich.</p>
            <div className="row">
              <button className="primary" onClick={doCheck} autoFocus>
                Prüfen
              </button>
              <button onClick={() => setConfirmCheck(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
      {tour.element}
    </div>
  );
}
