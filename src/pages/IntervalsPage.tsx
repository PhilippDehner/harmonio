import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAudioRunning, play, stopAll } from '../audio/engine';
import { useHotkeys } from '../components/hotkeys';
import NoteNamer from '../components/NoteNamer';
import { DetailTable, LiveStats } from '../components/StatsViews';
import { useTour } from '../components/Tour';
import {
  IntervalDef,
  availableIntervals,
  correctSecondNotes,
  intervalById,
  intervalFromShortcut,
  isCorrectNaming,
  isShortcutPrefix,
} from '../music/intervals';
import { germanName, toMidi } from '../music/pitch';
import { IntervalPlayMode, IntervalTask, chooseAdaptive, makeIntervalTask } from '../music/tasks';
import {
  RANGES,
  aggregateStats,
  getState,
  recordInterval,
  recordNaming,
  updateSettings,
  useAppData,
} from '../storage/store';

const MODES: { id: IntervalPlayMode; label: string }[] = [
  { id: 'harmonisch', label: 'gleichzeitig' },
  { id: 'aufwaerts', label: 'aufwärts' },
  { id: 'abwaerts', label: 'abwärts' },
];

type Phase = 'answer' | 'naming' | 'done';

function newTask(mode: IntervalPlayMode, extended: boolean, adaptive: boolean, range: [number, number]): IntervalTask {
  const list = availableIntervals(extended);
  const s = aggregateStats(getState().stats);
  const id = chooseAdaptive(
    list.map((i) => i.id),
    s.intervals[mode] ?? {},
    adaptive,
  );
  return makeIntervalTask(intervalById(id), mode, range);
}

export default function IntervalsPage() {
  const data = useAppData();
  const settings = data.settings;
  const range = RANGES[settings.range].midi;
  const mode = settings.intervalMode;
  const [task, setTask] = useState<IntervalTask>(() =>
    newTask(mode, settings.intervalExtended, settings.adaptive, range),
  );
  const [phase, setPhase] = useState<Phase>('answer');
  const [given, setGiven] = useState<string | null>(null);
  const [namingResult, setNamingResult] = useState<{ correct: boolean; solution: string } | null>(null);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const bufferRef = useRef('');
  const autoPlayTimer = useRef<number | null>(null);
  const intervals = useMemo(() => availableIntervals(settings.intervalExtended), [settings.intervalExtended]);

  const tour = useTour('intervalle', [
    { title: 'Intervalle', text: 'Hier hörst du zufällige Intervalle und bestimmst sie. Die Übung läuft, bis du sie verlässt.' },
    { selector: '#iv-mode', title: 'Wiedergabe', text: 'Wähle, ob die Töne gleichzeitig, aufwärts oder abwärts erklingen.' },
    { selector: '#iv-play', title: 'Abspielen', text: 'Spiele die Aufgabe beliebig oft ab (Leertaste).' },
    { selector: '#iv-answers', title: 'Antworten', text: 'Klicke auf das Intervall oder nutze die Tastatur, z. B. 3 und dann k für die kleine Terz.' },
    { selector: '#iv-options', title: 'Optionen', text: 'Erweiterte Intervalle über die Oktave, Tonbenennung und adaptive Auswahl lassen sich hier zuschalten.' },
  ]);

  const playTask = useCallback((t: IntervalTask) => {
    const a = toMidi(t.start);
    const b = toMidi(t.second);
    if (getState().settings.intervalMode === 'harmonisch') {
      void play({ sounds: [{ time: 0, midi: [a, b] }] });
    } else {
      void play({ sounds: [{ time: 0, midi: [a] }, { time: 1.0, midi: [b] }] });
    }
  }, []);

  const next = useCallback(
    (opts?: { mode?: IntervalPlayMode; extended?: boolean }) => {
      if (autoPlayTimer.current) window.clearTimeout(autoPlayTimer.current);
      stopAll();
      const s = getState().settings;
      const t = newTask(opts?.mode ?? s.intervalMode, opts?.extended ?? s.intervalExtended, s.adaptive, RANGES[s.range].midi);
      setTask(t);
      setPhase('answer');
      setGiven(null);
      setNamingResult(null);
      bufferRef.current = '';
      autoPlayTimer.current = window.setTimeout(() => {
        if (isAudioRunning()) playTask(t);
      }, 1000);
    },
    [playTask],
  );

  // Erste Aufgabe automatisch abspielen
  useEffect(() => {
    autoPlayTimer.current = window.setTimeout(() => {
      if (isAudioRunning()) playTask(task);
    }, 700);
    return () => {
      if (autoPlayTimer.current) window.clearTimeout(autoPlayTimer.current);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function answer(iv: IntervalDef) {
    if (phase !== 'answer') return;
    stopAll();
    const correct = iv.id === task.interval.id;
    setGiven(iv.id);
    recordInterval(mode, task.interval.id, correct, correct ? undefined : iv.id);
    setSession((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    setPhase(correct && settings.intervalNaming ? 'naming' : 'done');
  }

  useHotkeys((e) => {
    if (e.key === ' ') {
      e.preventDefault();
      playTask(task);
      return;
    }
    if (phase === 'done' && e.key === 'Enter') {
      e.preventDefault();
      next();
      return;
    }
    if (phase !== 'answer') return;
    const k = e.key === 'T' ? 'T' : e.key.toLowerCase();
    if (!/^[0-9kgt]$/i.test(k)) return;
    const buf = bufferRef.current + k;
    const hit = intervalFromShortcut(buf, settings.intervalExtended);
    const isPrefix = isShortcutPrefix(buf, settings.intervalExtended);
    if (hit && !isPrefix) {
      bufferRef.current = '';
      answer(hit);
    } else if (isPrefix) {
      bufferRef.current = buf;
    } else {
      bufferRef.current = /[0-9]/.test(k) && isShortcutPrefix(k, settings.intervalExtended) ? k : '';
    }
  });

  const directionWord = task.up ? 'aufwärts' : 'abwärts';
  const correctNames = correctSecondNotes(task.start, task.interval, task.up).map((p) => germanName(p));
  const stats = aggregateStats(data.stats);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Intervalle</h1>
        <span className="spacer" />
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          ? Hilfe
        </button>
      </div>

      <div className="toolbar" id="iv-mode">
        <span>Wiedergabe:</span>
        <div className="segmented" role="group" aria-label="Wiedergabe">
          {MODES.map((m) => (
            <button
              key={m.id}
              aria-pressed={mode === m.id}
              onClick={() => {
                updateSettings({ intervalMode: m.id });
                next({ mode: m.id });
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="muted small">
          Tonumfang {settings.range} ({RANGES[settings.range].text})
        </span>
      </div>

      <div className="toolbar" id="iv-options">
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.intervalExtended}
            onChange={(e) => {
              updateSettings({ intervalExtended: e.target.checked });
              next({ extended: e.target.checked });
            }}
          />
          über die Oktave
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.intervalNaming}
            onChange={(e) => updateSettings({ intervalNaming: e.target.checked })}
          />
          Tonbenennung
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.adaptive} onChange={(e) => updateSettings({ adaptive: e.target.checked })} />
          adaptiv
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.showStats} onChange={(e) => updateSettings({ showStats: e.target.checked })} />
          Statistik
        </label>
      </div>

      <div className="play-area card">
        <button id="iv-play" className="primary" onClick={() => playTask(task)}>
          ▶ Abspielen <kbd className="hint">Leertaste</kbd>
        </button>
        {phase !== 'answer' && (
          <button onClick={() => next()} autoFocus>
            Weiter <kbd className="hint">↵</kbd>
          </button>
        )}
        <span className="spacer" />
        {settings.showStats && <LiveStats {...session} />}
      </div>

      <div id="iv-answers" className="answer-grid" role="group" aria-label="Intervall auswählen">
        {intervals.map((iv) => {
          let cls = '';
          if (phase !== 'answer') {
            if (iv.id === task.interval.id) cls = 'correct';
            else if (iv.id === given) cls = 'wrong';
          }
          return (
            <button key={iv.id} className={cls} onClick={() => answer(iv)} disabled={phase !== 'answer' && !cls} aria-label={iv.long}>
              <span className="label-long">{iv.long}</span>
              <span className="label-short">{iv.short}</span>
              <kbd className="hint">{iv.shortcut.split('').join('+')}</kbd>
            </button>
          );
        })}
      </div>

      {phase !== 'answer' && (
        <div className={`feedback ${given === task.interval.id ? 'ok' : 'err'}`} role="status">
          {given === task.interval.id
            ? `Richtig: ${task.interval.long}.`
            : `Falsch – richtig ist: ${task.interval.long} (deine Antwort: ${intervalById(given!).long}).`}
        </div>
      )}

      {phase !== 'answer' && given === task.interval.id && settings.intervalNaming && (
        <NoteNamer
          key={`${task.start.step}${task.start.alter}${task.interval.id}${task.second.octave}`}
          prompt={
            <>
              Ausgangston: <b>{germanName(task.start)}</b>. Wie heißt der zweite Ton ({task.interval.long}{' '}
              {mode === 'harmonisch' ? 'darüber' : directionWord})?
            </>
          }
          slots={['Zweiter Ton']}
          result={namingResult}
          onSubmit={([a]) => {
            const correct = isCorrectNaming(a, task.start, task.interval, task.up);
            recordNaming('intervals', correct);
            setNamingResult({ correct, solution: correctNames.join(' oder ') });
            setPhase('done');
          }}
        />
      )}

      {settings.showStats && (
        <details className="card">
          <summary>Ausführliche Statistik ({MODES.find((m) => m.id === mode)?.label})</summary>
          <DetailTable bucket={stats.intervals[mode]} items={intervals.map((i) => i.id)} labelOf={(id) => intervalById(id).long} />
        </details>
      )}
      {tour.element}
    </div>
  );
}
