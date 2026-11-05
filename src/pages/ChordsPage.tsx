import { useCallback, useEffect, useRef, useState } from 'react';
import { isAudioRunning, play, stopAll } from '../audio/engine';
import { useAutoNext } from '../components/autoNext';
import { useHotkeys } from '../components/hotkeys';
import NoteNamer from '../components/NoteNamer';
import SolutionScore from '../components/SolutionScore';
import { DetailTable, LiveStats } from '../components/StatsViews';
import { useTour } from '../components/Tour';
import {
  CHORD_TYPES,
  ChordType,
  INVERSIONS,
  Inversion,
  chordAnswerId,
  chordAnswerLabel,
  chordNamingSolution,
  isCorrectChordNaming,
} from '../music/chords';
import { germanName, germanNameWithOctave, toMidi } from '../music/pitch';
import { ChordTask, answerChordMidi, chooseAdaptive, makeChordTask } from '../music/tasks';
import { aggregateStats, getState, recordChord, recordNaming, updateSettings, useAppData } from '../storage/store';

type Phase = 'answer' | 'naming' | 'done';

function allAnswerIds(level: 1 | 2): string[] {
  const ids: string[] = [];
  for (const t of CHORD_TYPES) {
    if (level === 1 || t.id === 'uberm') ids.push(chordAnswerId(t.id, null));
    else for (const inv of INVERSIONS) ids.push(chordAnswerId(t.id, inv.id));
  }
  return ids;
}

function parseAnswerId(id: string): { type: ChordType; inversion: Inversion | null } {
  const [type, inv] = id.split('-');
  return { type: type as ChordType, inversion: (inv as Inversion) ?? null };
}

function newTask(level: 1 | 2, adaptive: boolean): ChordTask {
  const s = aggregateStats(getState().stats);
  const id = chooseAdaptive(allAnswerIds(level), s.chords[String(level)] ?? {}, adaptive);
  const { type, inversion } = parseAnswerId(id);
  const inv: Inversion = inversion ?? (['grund', 'sext', 'quartsext'] as Inversion[])[Math.floor(Math.random() * 3)];
  return makeChordTask(type, type === 'uberm' && level === 2 ? 'grund' : inv);
}

function InversionLabel({ id }: { id: Inversion }) {
  if (id === 'grund') return <span>Grundst.</span>;
  if (id === 'sext') return <span>6</span>;
  return (
    <span className="figured" aria-hidden="true">
      <span>6</span>
      <span>4</span>
    </span>
  );
}

export default function ChordsPage() {
  const data = useAppData();
  const settings = data.settings;
  const level = settings.chordLevel;
  const [task, setTask] = useState<ChordTask>(() => newTask(level, settings.adaptive));
  const [phase, setPhase] = useState<Phase>('answer');
  const [typeAnswer, setTypeAnswer] = useState<ChordType | null>(null);
  const [invAnswer, setInvAnswer] = useState<Inversion | null>(null);
  const [namingResult, setNamingResult] = useState<{ correct: boolean; solution: string } | null>(null);
  const [session, setSession] = useState({ correct: 0, wrong: 0 });
  const timer = useRef<number | null>(null);

  const tour = useTour('akkorde', [
    { title: 'Akkorde', text: 'Hier hörst du zufällige vierstimmige Akkorde und bestimmst den Akkordtyp.' },
    { selector: '#ch-level', title: 'Stufe', text: 'In der zweiten Stufe bestimmst du zusätzlich die Umkehrung. Dafür zählt nur der Basston.' },
    { selector: '#ch-play', title: 'Abspielen', text: 'Spiele den Akkord beliebig oft ab (Leertaste).' },
    { selector: '#ch-types', title: 'Akkordtyp', text: 'Wähle erst den Typ (Tasten D, M, V, Ü), dann ggf. die Umkehrung (1, 2, 3).' },
  ]);

  const playTask = useCallback((t: ChordTask) => {
    void play({ sounds: [{ time: 0, midi: t.voicing.notes.map(toMidi) }] });
  }, []);

  const next = useCallback(
    (lvl?: 1 | 2) => {
      if (timer.current) window.clearTimeout(timer.current);
      stopAll();
      const s = getState().settings;
      const t = newTask(lvl ?? s.chordLevel, s.adaptive);
      setTask(t);
      setPhase('answer');
      setTypeAnswer(null);
      setInvAnswer(null);
      setNamingResult(null);
      timer.current = window.setTimeout(() => {
        if (isAudioRunning()) playTask(t);
      }, 1000);
    },
    [playTask],
  );

  useEffect(() => {
    timer.current = window.setTimeout(() => {
      if (isAudioRunning()) playTask(task);
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsInversion = (type: ChordType | null) => level === 2 && type !== null && type !== 'uberm';

  function evaluate(type: ChordType, inversion: Inversion | null) {
    stopAll();
    const checkInv = level === 2 && task.type !== 'uberm';
    const correctId = chordAnswerId(task.type, checkInv ? task.inversion : null);
    const givenId = chordAnswerId(type, level === 2 && type !== 'uberm' ? inversion : null);
    const correct = correctId === givenId;
    recordChord(String(level), correctId, correct, correct ? undefined : givenId);
    setSession((s) => ({ correct: s.correct + (correct ? 1 : 0), wrong: s.wrong + (correct ? 0 : 1) }));
    setPhase(correct && settings.chordNaming ? 'naming' : 'done');
  }

  function chooseType(type: ChordType) {
    if (phase !== 'answer') return;
    setTypeAnswer(type);
    if (!needsInversion(type)) evaluate(type, null);
    else if (invAnswer) evaluate(type, invAnswer);
  }

  function chooseInversion(inv: Inversion) {
    if (phase !== 'answer' || !needsInversion(typeAnswer ?? 'dur')) return;
    setInvAnswer(inv);
    if (typeAnswer) evaluate(typeAnswer, inv);
  }

  useHotkeys((e, key) => {
    if (key === ' ') {
      e.preventDefault();
      playTask(task);
      return;
    }
    if (phase === 'done' && key === 'Enter') {
      e.preventDefault();
      next();
      return;
    }
    if (phase !== 'answer') return;
    const k = key.toUpperCase();
    const type = CHORD_TYPES.find((t) => t.key === k || (t.id === 'uberm' && k === 'U'));
    if (type) {
      e.preventDefault();
      chooseType(type.id);
      return;
    }
    const inv = INVERSIONS.find((i) => i.key === key);
    if (inv && level === 2) {
      e.preventDefault();
      chooseInversion(inv.id);
    }
  });

  const checkInv = level === 2 && task.type !== 'uberm';
  const isCorrect =
    phase !== 'answer' &&
    typeAnswer === task.type &&
    (!checkInv || invAnswer === task.inversion);
  const autoNextIn = useAutoNext(phase === 'done', isCorrect && (!namingResult || namingResult.correct), next);
  const solutionLabel = chordAnswerLabel(task.type, checkInv ? task.inversion : null);
  const givenLabel = typeAnswer ? chordAnswerLabel(typeAnswer, level === 2 && typeAnswer !== 'uberm' ? invAnswer : null) : '';
  const playGiven = () => {
    if (!typeAnswer) return;
    const inv = level === 2 && typeAnswer !== 'uberm' && invAnswer ? invAnswer : task.inversion;
    stopAll();
    void play({ sounds: [{ time: 0, midi: answerChordMidi(task, typeAnswer, inv) }] });
  };
  const stats = aggregateStats(data.stats);
  const naming = chordNamingSolution(task.root, task.type);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Akkorde</h1>
        <span className="spacer" />
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          Hilfe
        </button>
      </div>

      <div className="toolbar" id="ch-level">
        <span>Stufe:</span>
        <div className="segmented" role="group" aria-label="Stufe">
          {([1, 2] as const).map((l) => (
            <button
              key={l}
              aria-pressed={level === l}
              onClick={() => {
                updateSettings({ chordLevel: l });
                next(l);
              }}
            >
              {l === 1 ? 'nur Typ' : 'Typ und Umkehrung'}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={settings.chordNaming} onChange={(e) => updateSettings({ chordNaming: e.target.checked })} />
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
        <button id="ch-play" className="primary" onClick={() => playTask(task)}>
          ▶ Abspielen <kbd className="hint">Leertaste</kbd>
        </button>
        {phase !== 'answer' && !isCorrect && <button onClick={playGiven}>▶ Deine Antwort</button>}
        {phase !== 'answer' && (
          <button onClick={() => next()} autoFocus>
            Weiter{autoNextIn !== null && ` (${autoNextIn} s)`} <kbd className="hint">↵</kbd>
          </button>
        )}
        <span className="spacer" />
        {settings.showStats && <LiveStats {...session} />}
      </div>

      <div id="ch-types" className="answer-grid chords" role="group" aria-label="Akkordtyp">
        {CHORD_TYPES.map((t) => {
          let cls = typeAnswer === t.id ? 'selected' : '';
          if (phase !== 'answer') {
            if (t.id === task.type) cls = 'correct';
            else if (t.id === typeAnswer) cls = 'wrong';
          }
          return (
            <button key={t.id} className={cls} onClick={() => chooseType(t.id)} disabled={phase !== 'answer' && !cls} aria-label={t.long}>
              <span className="label-long">{t.long}</span>
              <span className="label-short">{t.short}</span>
              <kbd className="hint">{t.key}</kbd>
            </button>
          );
        })}
      </div>

      {level === 2 && (
        <div className="answer-grid inversions" role="group" aria-label="Umkehrung">
          {INVERSIONS.map((inv) => {
            const disabledByType = typeAnswer === 'uberm' || (phase !== 'answer' && task.type === 'uberm');
            let cls = invAnswer === inv.id ? 'selected' : '';
            if (phase !== 'answer' && checkInv) {
              if (inv.id === task.inversion) cls = 'correct';
              else if (inv.id === invAnswer) cls = 'wrong';
            }
            return (
              <button
                key={inv.id}
                className={cls}
                onClick={() => chooseInversion(inv.id)}
                disabled={disabledByType || (phase !== 'answer' && !cls)}
                aria-label={inv.long}
              >
                <InversionLabel id={inv.id} />
                <kbd className="hint">{inv.key}</kbd>
              </button>
            );
          })}
        </div>
      )}

      {phase !== 'answer' && (
        <div className={`feedback ${isCorrect ? 'ok' : 'err'}`} role="status">
          {isCorrect ? `Richtig: ${solutionLabel}.` : `Falsch – richtig ist: ${solutionLabel} (deine Antwort: ${givenLabel}).`}
        </div>
      )}

      {phase === 'done' && (
        <SolutionScore
          sounds={[task.voicing.notes]}
          satb
          ariaLabel={`Lösung: ${task.voicing.notes.map(germanNameWithOctave).join(', ')}`}
        />
      )}

      {phase !== 'answer' && isCorrect && settings.chordNaming && (
        <NoteNamer
          key={`${task.root.step}${task.root.alter}${task.type}${task.voicing.notes.map(toMidi).join()}`}
          prompt={
            <>
              Grundton: <b>{germanName(task.root)}</b>. Wie heißen Terz und Quinte?
            </>
          }
          slots={['Terz', 'Quinte']}
          result={namingResult}
          onSubmit={(answers) => {
            const correct = isCorrectChordNaming(answers, task.root, task.type);
            recordNaming('chords', correct);
            setNamingResult({ correct, solution: naming.map((p) => germanName(p)).join(' und ') });
            setPhase('done');
          }}
        />
      )}

      {settings.showStats && (
        <details className="card">
          <summary>Ausführliche Statistik ({level === 1 ? 'nur Typ' : 'Typ und Umkehrung'})</summary>
          <DetailTable
            bucket={stats.chords[String(level)]}
            items={allAnswerIds(level)}
            labelOf={(id) => {
              const p = parseAnswerId(id);
              return chordAnswerLabel(p.type, p.inversion);
            }}
          />
        </details>
      )}
      {tour.element}
    </div>
  );
}
