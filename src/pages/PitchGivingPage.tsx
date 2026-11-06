import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAudioRunning, play, stopAll, unlockAudio } from '../audio/engine';
import { MicFrame, useMic } from '../audio/mic';
import { PitchHold, VoiceType, classifyVoice, freqToMidi } from '../audio/pitchDetect';
import { useAutoNext } from '../components/autoNext';
import { useHotkeys } from '../components/hotkeys';
import SolutionScore from '../components/SolutionScore';
import { LiveStats } from '../components/StatsViews';
import { useTour } from '../components/Tour';
import { germanName, germanNameWithOctave, toMidi } from '../music/pitch';
import {
  SING_ORDER,
  VOICE_LABEL,
  SungResult,
  VOICE_NAMES,
  evaluateSung,
  expectedMidi,
  formatCents,
  makePitchGivingTask,
  nearestNoteName,
} from '../music/pitchGiving';
import { ChordTask } from '../music/tasks';
import { updateSettings, useSettings } from '../storage/store';

const A4 = 69;
/** Nach dem Abspielen so lange nicht zuhören, damit das Klavier nicht als Gesang zählt (ms). */
const MUTE_A = 2400;
const MUTE_CHORD = 2400;

type Mic = ReturnType<typeof useMic>;

interface Shared {
  mic: Mic;
  handler: React.RefObject<MicFrame>;
  playA: () => void;
  playChord: (midi: number[]) => void;
}

/** Abweichung eines falschen Tons in Halbtönen, z. B. „2 Halbtöne zu tief“. */
function describeMiss(cents: number): string {
  const semis = Math.max(1, Math.round(Math.abs(cents) / 100));
  return `${semis === 1 ? 'ein Halbton' : `${semis} Halbtöne`} zu ${cents > 0 ? 'hoch' : 'tief'}`;
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
      {mic.state !== 'an' && (
        <button onClick={() => void mic.start()} disabled={mic.state === 'startet'}>
          🎤 Mikrofon einschalten
        </button>
      )}
      {mic.state === 'an' && <span className="muted small">🎤 Mikrofon an</span>}
    </>
  );
}

/* ---------- Erkennung der Stimmlage ---------- */

function VoiceSetup({ mic, handler, playA }: Shared) {
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
      <h1 style={{ margin: 0 }}>Tonangabe</h1>
      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Stimmlage erkennen</h2>
        <p style={{ margin: 0 }}>
          Damit die Übung weiß, in welcher Oktave du singst: Hör dir das A (440 Hz) an und singe es danach auf einem
          bequemen Vokal nach, bis es erkannt ist.
        </p>
        <div className="play-area">
          <button className="primary" onClick={() => void startListening()} disabled={mic.state === 'startet'}>
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
              <button onClick={() => updateSettings({ voiceType: guess === 'mann' ? 'frau' : 'mann' })}>
                Nein, {VOICE_LABEL[guess === 'mann' ? 'frau' : 'mann']}
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
          <button onClick={() => updateSettings({ voiceType: 'mann' })}>Männerstimme</button>
          <button onClick={() => updateSettings({ voiceType: 'frau' })}>Frauenstimme</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Übung ---------- */

type Results = (SungResult | null)[];

function Exercise({ voice, mic, handler, playA, playChord }: Shared & { voice: VoiceType }) {
  const settings = useSettings();
  const [task, setTask] = useState<ChordTask>(() => makePitchGivingTask());
  const [results, setResults] = useState<Results>([null, null, null, null]);
  const [pos, setPos] = useState(0);
  const [live, setLive] = useState<number | null>(null);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const hold = useRef(new PitchHold());
  const posRef = useRef(0);
  const resultsRef = useRef<Results>([null, null, null, null]);
  const timer = useRef<number | null>(null);
  const done = pos >= SING_ORDER.length;

  const tour = useTour('tonangabe', [
    { title: 'Tonangabe', text: 'Du siehst einen vierstimmigen Akkord und hörst nur das A (440 Hz). Finde davon ausgehend die Töne des Akkords.' },
    { selector: '#tg-a', title: 'A abspielen', text: 'Spiele das A beliebig oft ab (Leertaste).' },
    { selector: '#tg-voices', title: 'Singen', text: 'Singe die vier Töne nacheinander von unten nach oben (Bass, Tenor, Alt, Sopran) und halte jeden kurz, bis er erkannt ist. Setze zwischen den Tönen kurz ab.' },
  ]);

  handler.current = (freq, time) => {
    if (posRef.current >= SING_ORDER.length) return;
    const r = hold.current.push(time, freq);
    setLive(hold.current.current());
    if (r === null) return;
    const vi = SING_ORDER[posRef.current];
    const res = evaluateSung(r, expectedMidi(task.voicing.notes[vi], vi, voice));
    posRef.current += 1;
    const finished = posRef.current >= SING_ORDER.length;
    const updated = [...resultsRef.current];
    updated[vi] = res;
    resultsRef.current = updated;
    setResults(updated);
    if (finished) {
      const ok = updated.every((x) => x?.correct);
      setSession((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    }
    setPos(posRef.current);
    setLive(null);
  };

  const resetSinging = useCallback(() => {
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
    setTask(makePitchGivingTask());
    resetSinging();
    timer.current = window.setTimeout(() => {
      if (isAudioRunning()) playA();
    }, 1000);
  }, [playA, resetSinging]);

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

  const chordMidi = task.voicing.notes.map(toMidi);

  useHotkeys((e, key) => {
    if (key === ' ') {
      e.preventDefault();
      playA();
    } else if (done && key === 'Enter') {
      e.preventDefault();
      next();
    } else if (done && key.toUpperCase() === 'K') {
      e.preventDefault();
      playChord(chordMidi);
    }
  });

  const allCorrect = done && results.every((r) => r?.correct);
  const correctCount = results.filter((r) => r?.correct).length;
  const autoNextIn = useAutoNext(done, allCorrect, next);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Tonangabe</h1>
        <span className="spacer" />
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          Hilfe
        </button>
      </div>

      <div className="toolbar">
        <span>
          Stimmlage: <b>{VOICE_LABEL[voice]}</b>
        </span>
        <Link to="/einstellungen" className="small">
          ändern
        </Link>
        <label className="toggle">
          <input type="checkbox" checked={settings.showStats} onChange={(e) => updateSettings({ showStats: e.target.checked })} />
          Statistik
        </label>
      </div>

      <div className="solution-scores">
        <SolutionScore
          sounds={[task.voicing.notes]}
          satb
          marked={done ? [results.map((r) => !r?.correct)] : undefined}
          ariaLabel={`Akkord: ${task.voicing.notes.map(germanNameWithOctave).join(', ')}`}
        />
      </div>

      <div className="play-area card">
        <button id="tg-a" className="primary" onClick={playA}>
          ▶ A (440 Hz) <kbd className="hint">Leertaste</kbd>
        </button>
        <MicControls mic={mic} />
        {done && (
          <button onClick={() => playChord(chordMidi)}>
            ▶ Akkord <kbd className="hint">K</kbd>
          </button>
        )}
        {pos > 0 && <button onClick={resetSinging}>Neu singen</button>}
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
            {SING_ORDER.map((vi, i) => {
              const r = results[vi];
              const current = i === pos && !done;
              const target = germanName(task.voicing.notes[vi]);
              return (
                <tr key={vi} className={current ? 'current' : r ? (r.correct ? 'ok' : 'err') : ''}>
                  <th scope="row">{VOICE_NAMES[vi]}</th>
                  <td>
                    {r ? (
                      <>
                        {r.correct ? '✓' : '✗'} {target}
                        <span className="muted small">
                          {' '}
                          – gesungen: {nearestNoteName(freqToMidi(r.freq))},{' '}
                          {r.correct ? formatCents(r.cents) : describeMiss(r.cents)}
                          {r.correct && r.octaveShift !== 0 &&
                            ` · ${Math.abs(r.octaveShift) === 1 ? 'eine' : Math.abs(r.octaveShift)} Oktave ${r.octaveShift > 0 ? 'höher' : 'tiefer'} als erwartet`}
                        </span>
                      </>
                    ) : current ? (
                      mic.state === 'an' ? (
                        <>
                          jetzt singen – gehört: <LivePitch midi={live} />
                        </>
                      ) : (
                        <span className="muted">Mikrofon einschalten, dann singen</span>
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
      </div>

      {done && (
        <div className={`feedback ${allCorrect ? 'ok' : 'err'}`} role="status">
          {allCorrect ? 'Alle vier Töne richtig.' : `${correctCount} von 4 Tönen richtig.`}
        </div>
      )}
      {tour.element}
    </div>
  );
}

/* ---------- Seite ---------- */

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
