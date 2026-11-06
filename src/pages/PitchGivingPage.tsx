import { useCallback, useEffect, useRef, useState } from 'react';
import { isAudioRunning, play, stopAll, unlockAudio } from '../audio/engine';
import { MicFrame, useMic } from '../audio/mic';
import { PitchHold, VoiceType, classifyVoice, freqToMidi } from '../audio/pitchDetect';
import { useAutoNext } from '../components/autoNext';
import { useHotkeys } from '../components/hotkeys';
import BetaBadge, { BetaNotice } from '../components/BetaBadge';
import SolutionScore from '../components/SolutionScore';
import { LiveStats } from '../components/StatsViews';
import { useTour } from '../components/Tour';
import { Pitch, germanName, germanNameWithOctave, toMidi } from '../music/pitch';
import {
  SING_ORDERS,
  VOICE_LABEL,
  SungResult,
  VOICE_NAMES,
  evaluateSung,
  expectedMidi,
  describeIntonation,
  formatCents,
  functionName,
  keyFifthsOf,
  makePitchGivingTask,
  nearestNoteName,
  singOrder,
  sungPitch,
  sungStatus,
} from '../music/pitchGiving';
import { ChordTask } from '../music/tasks';
import {
  Settings,
  loadPitchGivingCurrent,
  pitchGivingOptions,
  savePitchGivingCurrent,
  updateSettings,
  useSettings,
} from '../storage/store';

const A4 = 69;
/** Ignore the microphone this long after playback so the piano does not count as singing (ms). */
const MUTE_A = 2400;
const MUTE_CHORD = 2400;

type Mic = ReturnType<typeof useMic>;

interface Shared {
  mic: Mic;
  handler: React.RefObject<MicFrame>;
  playA: () => void;
  playChord: (midi: number[]) => void;
}

function LivePitch({ midi }: { midi: number | null }) {
  if (midi === null) return <span className="muted">…</span>;
  const cents = Math.round((midi - Math.round(midi)) * 100);
  return (
    <span>
      <b>{nearestNoteName(midi)}</b> <span className="muted small">{formatCents(cents)}</span>
    </span>
  );
}

function MicControls({ mic }: { mic: Mic }) {
  return (
    <>
      {mic.state !== 'on' && (
        <button onClick={() => void mic.start()} disabled={mic.state === 'starting'}>
          🎤 Mikrofon einschalten
        </button>
      )}
      {mic.state === 'on' && (
        <button onClick={mic.stop} title="Mikrofon ausschalten, z. B. um dir selbst Töne vorzusingen">
          🎤 Mikrofon ausschalten
        </button>
      )}
    </>
  );
}

/* ---------- Voice type detection ---------- */

function VoiceSetup({ mic, handler, playA }: Shared) {
  const settings = useSettings();
  const [step, setStep] = useState<'intro' | 'listen' | 'confirm'>('intro');
  const [live, setLive] = useState<number | null>(null);
  const [detected, setDetected] = useState<number | null>(null);
  const hold = useRef(new PitchHold(800, 40));

  handler.current = (freq, time) => {
    if (step !== 'listen') return;
    const r = hold.current.push(time, freq);
    setLive(hold.current.current());
    if (r !== null) {
      setDetected(r);
      setStep('confirm');
    }
  };

  async function startListening() {
    await unlockAudio();
    hold.current.reset();
    setLive(null);
    setDetected(null);
    playA();
    setStep('listen');
    await mic.start();
  }

  const guess = detected !== null ? classifyVoice(detected) : null;

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>
        Tonangabe <BetaBadge />
      </h1>
      <BetaNotice />
      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Stimmlage erkennen</h2>
        <p style={{ margin: 0 }}>
          Damit die Übung weiß, in welcher Oktave du singst: Hör dir das A ({settings.tuningA4} Hz) an und singe es danach auf einem
          bequemen Vokal nach, bis es erkannt ist.
        </p>
        <div className="play-area">
          <button className="primary" onClick={() => void startListening()} disabled={mic.state === 'starting'}>
            ▶ A spielen und nachsingen
          </button>
          {step === 'listen' && (
            <>
              <button onClick={playA}>▶ A nochmal</button>
              <span>
                Gehört: <LivePitch midi={live} />
              </span>
            </>
          )}
        </div>
        {mic.error && (
          <div className="feedback err" role="status">
            {mic.error}
          </div>
        )}
        {step === 'confirm' && guess && detected !== null && (
          <div className="feedback info stack" role="status">
            <div>
              Gesungen: ca. {Math.round(detected)} Hz ({nearestNoteName(freqToMidi(detected))}). Du hast vermutlich eine{' '}
              <b>{VOICE_LABEL[guess]}</b>. Stimmt das?
            </div>
            <div className="row">
              <button className="primary" onClick={() => updateSettings({ voiceType: guess })} autoFocus>
                Ja
              </button>
              <button onClick={() => updateSettings({ voiceType: guess === 'male' ? 'female' : 'male' })}>
                Nein, {VOICE_LABEL[guess === 'male' ? 'female' : 'male']}
              </button>
              <button onClick={() => void startListening()}>Nochmal singen</button>
            </div>
          </div>
        )}
      </div>
      <div className="card stack">
        <p className="muted small" style={{ margin: 0 }}>
          Ohne Mikrofon festlegen (später in den Einstellungen änderbar):
        </p>
        <div className="row">
          <button onClick={() => updateSettings({ voiceType: 'male' })}>Männerstimme</button>
          <button onClick={() => updateSettings({ voiceType: 'female' })}>Frauenstimme</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Exercise ---------- */

type Results = (SungResult | null)[];

/** Checkbox options; within each group at least one must stay checked. */
const OPTION_GROUPS: { label: string; items: { key: keyof Settings; label: string; title: string }[] }[] = [
  {
    label: 'Vorzeichen',
    items: [
      { key: 'pgFewAccidentals', label: 'wenige', title: 'Tonarten mit bis zu 3 Vorzeichen' },
      { key: 'pgManyAccidentals', label: 'viele', title: 'Tonarten mit 4 bis 7 Vorzeichen' },
    ],
  },
  {
    label: 'Tongeschlecht',
    items: [
      { key: 'pgMajor', label: 'Dur', title: 'Durakkorde' },
      { key: 'pgMinor', label: 'Moll', title: 'Mollakkorde' },
    ],
  },
];

function PitchGivingOptionsBar() {
  const settings = useSettings();
  return (
    <div id="tg-options" className="toolbar">
      {OPTION_GROUPS.map((g) => {
        const checkedCount = g.items.filter((it) => settings[it.key]).length;
        return (
          <div key={g.label} className="option-group" role="group" aria-label={g.label}>
            <span className="option-group-label muted small">{g.label}</span>
            {g.items.map((it) => {
              const checked = settings[it.key] as boolean;
              return (
                <label key={it.key} className="toggle" title={it.title}>
                  <input
                    type="checkbox"
                    checked={checked}
                    // The last checked box of a group cannot be unchecked
                    disabled={checked && checkedCount === 1}
                    onChange={(e) => updateSettings({ [it.key]: e.target.checked })}
                  />
                  {it.label}
                </label>
              );
            })}
          </div>
        );
      })}
      <div className="option-group" role="group" aria-label="Lage">
        <span className="option-group-label muted small">Lage</span>
        <label className="toggle" title="Ohne Haken: enge Lage der Oberstimmen und Töne in mittlerer Höhe (nahe am A)">
          <input type="checkbox" checked={settings.pgWide} onChange={(e) => updateSettings({ pgWide: e.target.checked })} />
          auch weite Lagen
        </label>
      </div>
      <div className="option-group" role="group" aria-label="Bass">
        <span className="option-group-label muted small">Bass</span>
        <label className="toggle" title="Ohne Haken: Der Bass singt immer den Grundton. Mit Haken: auch Terz oder Quinte im Bass (Umkehrungen)">
          <input
            type="checkbox"
            checked={settings.pgInversions}
            onChange={(e) => updateSettings({ pgInversions: e.target.checked })}
          />
          auch Umkehrungen
        </label>
      </div>
    </div>
  );
}

function Exercise({ voice, mic, handler, playA, playChord }: Shared & { voice: VoiceType }) {
  const settings = useSettings();
  const options = pitchGivingOptions(settings);
  const optionsKey = JSON.stringify(options);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Last open chord (e.g. after switching pages), if it still matches the options
  const [saved] = useState(() => {
    const c = loadPitchGivingCurrent<ChordTask, SungResult | null>();
    return c && c.optionsKey === optionsKey && c.task?.voicing && c.results?.length === 4 ? c : null;
  });
  const [task, setTask] = useState<ChordTask>(() => saved?.task ?? makePitchGivingTask(options));
  const [results, setResults] = useState<Results>(saved?.results ?? [null, null, null, null]);
  const [pos, setPos] = useState(saved?.pos ?? 0);
  const [live, setLive] = useState<number | null>(null);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const hold = useRef(new PitchHold());
  const posRef = useRef(saved?.pos ?? 0);
  const resultsRef = useRef<Results>(saved?.results ?? [null, null, null, null]);
  const timer = useRef<number | null>(null);
  /** Only the first attempt counts: set once a wrong note was taken back or the chord was re-sung. */
  const firstTryFailed = useRef(false);
  /** The current chord has already been counted in the statistics. */
  const counted = useRef(false);
  const order = singOrder(task.voicing, task.root, task.type, settings.singOrder);
  const orderRef = useRef(order);
  orderRef.current = order;
  const done = pos >= order.length;

  const tour = useTour('pitch-giving', [
    { title: 'Tonangabe', text: `Du siehst einen vierstimmigen Akkord und hörst nur das A (${settings.tuningA4} Hz). Finde davon ausgehend die Töne des Akkords.` },
    { selector: '#tg-a', title: 'A abspielen', text: 'Spiele das A beliebig oft ab (Leertaste).' },
    { selector: '#tg-options', title: 'Schwierigkeit', text: 'Wähle Tonarten mit wenigen oder vielen Vorzeichen, Dur und/oder Moll, ob auch weite Lagen mit Tönen weit weg vom A vorkommen und ob der Bass auch Terz oder Quinte singen darf (Umkehrungen) statt immer den Grundton.' },
    { selector: '#tg-new', title: 'Neue Übung', text: 'Mit „Neue Übung“ (N) bekommst du jederzeit einen anderen Akkord. Übersprungene Akkorde zählen nicht in der Statistik.' },
    { selector: '#tg-voices', title: 'Singen', text: `Singe die vier Töne nacheinander ${SING_ORDERS.find((o) => o.id === settings.singOrder)!.text} und halte jeden kurz, bis er erkannt ist. Du musst nichts anklicken: Nach jedem erkannten Ton geht es automatisch mit der nächsten Stimme weiter. Setze zwischen den Tönen nur kurz ab. Die Reihenfolge wählst du oben unter „Reihenfolge“.` },
  ]);

  handler.current = (freq, time) => {
    if (posRef.current >= orderRef.current.length) return;
    const r = hold.current.push(time, freq);
    setLive(hold.current.current());
    if (r === null) return;
    const vi = orderRef.current[posRef.current];
    const res = evaluateSung(r, expectedMidi(task.voicing.notes[vi], vi, voice));
    posRef.current += 1;
    const finished = posRef.current >= orderRef.current.length;
    const updated = [...resultsRef.current];
    updated[vi] = res;
    resultsRef.current = updated;
    setResults(updated);
    if (finished && !counted.current) {
      counted.current = true;
      const ok = !firstTryFailed.current && updated.every((x) => x?.octaveOk);
      setSession((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    }
    setPos(posRef.current);
    setLive(null);
  };

  const resetSinging = useCallback(() => {
    if (resultsRef.current.some((r) => r && !r.octaveOk)) firstTryFailed.current = true;
    hold.current.reset();
    posRef.current = 0;
    resultsRef.current = [null, null, null, null];
    setPos(0);
    setResults(resultsRef.current);
    setLive(null);
  }, []);

  const next = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    stopAll();
    setTask(makePitchGivingTask(optionsRef.current));
    resetSinging();
    firstTryFailed.current = false;
    counted.current = false;
    timer.current = window.setTimeout(() => {
      if (isAudioRunning()) playA();
    }, 1000);
  }, [playA, resetSinging]);

  /** Take back the last sung note (only offered if it was not right) and sing it again. */
  const undoLast = () => {
    if (posRef.current === 0) return;
    const vi = orderRef.current[posRef.current - 1];
    if (resultsRef.current[vi]?.octaveOk !== false) return;
    firstTryFailed.current = true;
    hold.current.reset();
    posRef.current -= 1;
    const updated = [...resultsRef.current];
    updated[vi] = null;
    resultsRef.current = updated;
    setResults(updated);
    setPos(posRef.current);
    setLive(null);
  };

  /** Skip the current chord after asking; skipped chords do not count. */
  const skip = () => {
    if (confirm('Diesen Akkord wirklich überspringen? Er zählt nicht in der Statistik.')) next();
  };

  // Remember the open chord and the notes sung so far
  useEffect(() => {
    savePitchGivingCurrent({ optionsKey: JSON.stringify(optionsRef.current), task, results, pos });
  }, [task, results, pos]);

  // Difficulty changed: new chord matching the options
  const firstOptions = useRef(true);
  useEffect(() => {
    if (firstOptions.current) {
      firstOptions.current = false;
      return;
    }
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  useEffect(() => {
    timer.current = window.setTimeout(() => {
      if (isAudioRunning()) playA();
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Microphone switched off: forget a half-held note
  useEffect(() => {
    if (mic.state === 'on') return;
    hold.current.reset();
    setLive(null);
  }, [mic.state]);

  const chordMidi = task.voicing.notes.map(toMidi);
  // Key signature of the chord's key instead of accidentals on the notes
  const keyFifths = keyFifthsOf(task.root, task.type === 'minor') ?? 0;

  const lastVoice = pos > 0 ? order[pos - 1] : null;
  const canUndo = lastVoice !== null && results[lastVoice]?.octaveOk === false;

  useHotkeys((e, key) => {
    if (key === ' ') {
      e.preventDefault();
      playA();
    } else if (canUndo && key.toUpperCase() === 'Z') {
      e.preventDefault();
      undoLast();
    } else if (!done && key.toUpperCase() === 'N') {
      e.preventDefault();
      skip();
    } else if (done && key === 'Enter') {
      e.preventDefault();
      next();
    } else if (done && key.toUpperCase() === 'K') {
      e.preventDefault();
      playChord(chordMidi);
    } else if (done && key.toUpperCase() === 'T') {
      e.preventDefault();
      playSung();
    }
  });

  const allCorrect = done && results.every((r) => r?.octaveOk);
  const pitchesCorrect = done && results.every((r) => r?.correct);
  const correctCount = results.filter((r) => r?.octaveOk).length;
  const octaveCount = results.filter((r) => r && sungStatus(r) === 'octave').length;
  const marks = results.map((r) => (!r?.correct ? true : r.octaveOk ? false : 'warn'));
  const meanCents = Math.round(results.reduce((sum, r) => sum + Math.abs(r?.cents ?? 0), 0) / 4);
  const autoNextIn = useAutoNext(done, allCorrect, next);
  // Chord as sung (wrong notes replaced), in the written octaves
  const sungVoicing: Pitch[] | null =
    done && !pitchesCorrect ? task.voicing.notes.map((p, i) => sungPitch(p, results[i]!, task.root)) : null;
  const playSung = () => sungVoicing && playChord(sungVoicing.map(toMidi));

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>
          Tonangabe <BetaBadge />
        </h1>
        <span className="spacer" />
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          Hilfe
        </button>
      </div>
      <BetaNotice />

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Reihenfolge">
          {SING_ORDERS.map((o) => (
            <button
              key={o.id}
              aria-pressed={settings.singOrder === o.id}
              title={`Singen ${o.text}`}
              onClick={() => {
                // Order changed in the middle of singing: start over
                if (o.id !== settings.singOrder && !done) resetSinging();
                updateSettings({ singOrder: o.id });
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={settings.showStats} onChange={(e) => updateSettings({ showStats: e.target.checked })} />
          Statistik
        </label>
      </div>
      <PitchGivingOptionsBar />

      <div className="solution-scores">
        <SolutionScore
          sounds={[task.voicing.notes]}
          satb
          keyFifths={keyFifths}
          marked={done ? [marks] : undefined}
          title={sungVoicing ? 'Akkord' : undefined}
          ariaLabel={`Akkord: ${task.voicing.notes.map(germanNameWithOctave).join(', ')}`}
        />
        {sungVoicing && (
          <SolutionScore
            title="Deine Töne"
            sounds={[sungVoicing]}
            satb
            keyFifths={keyFifths}
            marked={[marks]}
            ariaLabel={`Deine Töne: ${sungVoicing.map(germanNameWithOctave).join(', ')}`}
          />
        )}
      </div>

      <div className="play-area card">
        <button id="tg-a" className="primary" onClick={playA}>
          ▶ A ({settings.tuningA4} Hz) <kbd className="hint">Leertaste</kbd>
        </button>
        <MicControls mic={mic} />
        {done && (
          <button onClick={() => playChord(chordMidi)}>
            ▶ Akkord <kbd className="hint">K</kbd>
          </button>
        )}
        {sungVoicing && (
          <button onClick={playSung}>
            ▶ Deine Töne <kbd className="hint">T</kbd>
          </button>
        )}
        {pos > 0 && <button onClick={resetSinging}>Neu singen</button>}
        {!done && (
          <button id="tg-new" onClick={skip} title="Anderen Akkord, zählt nicht in der Statistik">
            Neue Übung <kbd className="hint">N</kbd>
          </button>
        )}
        {done && (
          <button onClick={next} autoFocus>
            Weiter{autoNextIn !== null && ` (${autoNextIn} s)`} <kbd className="hint">↵</kbd>
          </button>
        )}
        <span className="spacer" />
        {settings.showStats && <LiveStats {...session} />}
      </div>

      {mic.error && (
        <div className="feedback err" role="status">
          {mic.error}
        </div>
      )}

      <div id="tg-voices" className="card">
        <table className="voice-list">
          <tbody>
            {order.map((vi, i) => {
              const r = results[vi];
              const current = i === pos && !done;
              const undoButton =
                canUndo && vi === lastVoice ? (
                  <>
                    {' '}
                    <button className="mini" onClick={undoLast} title="Diesen Ton zurücknehmen und nochmal singen (zählt nicht als erster Versuch)">
                      ↶ nochmal <kbd className="hint">Z</kbd>
                    </button>
                  </>
                ) : null;
              const target = germanName(task.voicing.notes[vi]);
              return (
                <tr key={vi} className={current ? 'current' : r ? { ok: 'ok', octave: 'warn', wrong: 'err' }[sungStatus(r)] : ''}>
                  <th scope="row">
                    {VOICE_NAMES[vi]}
                    {settings.singOrder === 'function' && (
                      <span className="muted small"> ({functionName(task.voicing.notes[vi], task.root, task.type)})</span>
                    )}
                  </th>
                  <td>
                    {r ? (
                      r.correct ? (
                        <>
                          {r.octaveOk ? '✓ richtig' : '~ falsche Oktave'}: {target}
                          <span className="small">
                            {' '}
                            – {describeIntonation(r.cents)}
                            {r.octaveShift !== 0 &&
                              ` · ${Math.abs(r.octaveShift) === 1 ? 'eine' : Math.abs(r.octaveShift)} Oktave ${r.octaveShift > 0 ? 'höher' : 'tiefer'} als erwartet`}
                          </span>
                          {undoButton}
                        </>
                      ) : (
                        <>
                          ✗ falsch: {target}
                          <span className="small"> – gesungen: {germanName(sungPitch(task.voicing.notes[vi], r, task.root))}</span>{' '}
                          <button
                            className="mini"
                            onClick={() => playChord([toMidi(sungPitch(task.voicing.notes[vi], r, task.root))])}
                            aria-label={`Gesungenen Ton ${germanName(sungPitch(task.voicing.notes[vi], r, task.root))} anhören`}
                          >
                            ▶ gesungen
                          </button>{' '}
                          <button
                            className="mini"
                            onClick={() => playChord([toMidi(task.voicing.notes[vi])])}
                            aria-label={`Richtigen Ton ${target} anhören`}
                          >
                            ▶ richtig
                          </button>
                          {undoButton}
                        </>
                      )
                    ) : current ? (
                      mic.state === 'on' ? (
                        <>
                          jetzt singen – gehört: <LivePitch midi={live} />
                          <span className="muted small"> (danach automatisch weiter)</span>
                        </>
                      ) : (
                        <span className="muted">
                          {pos > 0 ? 'Mikrofon aus – zum Weitersingen einschalten' : 'Mikrofon einschalten, dann singen'}
                        </span>
                      )
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small" style={{ marginBottom: 0 }}>
          <b>Cent</b> ist ein Maß für feine Tonhöhenunterschiede: Ein Halbton hat 100 Cent. Ein Ton gilt als richtig,
          wenn er höchstens 50 Cent neben dem Zielton liegt, also näher an ihm als am Nachbarton. Stimmt der Ton, aber
          nicht die Oktave, wird er orange markiert. Bei richtigen Tönen
          zeigt die Cent-Zahl, wie sauber du intoniert hast: Bis etwa 10 Cent ist die Abweichung kaum hörbar, ab etwa
          20 Cent klingt der Akkord merklich unsauber.
        </p>
      </div>

      {done && (
        <div className={`feedback ${allCorrect ? 'ok' : pitchesCorrect ? 'warn' : 'err'}`} role="status">
          {allCorrect
            ? `Alle vier Töne richtig – im Schnitt ${meanCents} Cent daneben.`
            : pitchesCorrect
              ? `Alle Tonnamen richtig, aber ${octaveCount === 1 ? 'ein Ton' : `${octaveCount} Töne`} in der falschen Oktave.`
              : `${correctCount} von 4 Tönen richtig${octaveCount ? `, ${octaveCount} in der falschen Oktave` : ''}.`}
        </div>
      )}
      {tour.element}
    </div>
  );
}

/* ---------- Page ---------- */

export default function PitchGivingPage() {
  const { voiceType } = useSettings();
  const handler = useRef<MicFrame>(() => {});
  const muteUntil = useRef(0);
  const mic = useMic((freq, time) => handler.current(time < muteUntil.current ? null : freq, time));

  const playA = useCallback(() => {
    muteUntil.current = performance.now() + MUTE_A;
    void play({ sounds: [{ time: 0, midi: [A4], duration: 2 }] });
  }, []);
  const playChord = useCallback((midi: number[]) => {
    muteUntil.current = performance.now() + MUTE_CHORD;
    void play({ sounds: [{ time: 0, midi, duration: 2 }] });
  }, []);

  const shared: Shared = { mic, handler, playA, playChord };
  return voiceType ? <Exercise key={voiceType} voice={voiceType} {...shared} /> : <VoiceSetup {...shared} />;
}
