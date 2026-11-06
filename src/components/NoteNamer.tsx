import { useEffect, useRef, useState } from 'react';
import { PitchName, STEP_LETTERS, germanName } from '../music/pitch';
import { useHotkeys } from './hotkeys';

const ACCS: { alter: number; label: string; aria: string; key: string }[] = [
  { alter: -2, label: '𝄫', aria: 'Doppel-B', key: 'bb' },
  { alter: -1, label: '♭', aria: 'B', key: 'b' },
  { alter: 0, label: 'keins', aria: 'ohne Vorzeichen', key: '↵' },
  { alter: 1, label: '♯', aria: 'Kreuz', key: '#' },
  { alter: 2, label: '𝄪', aria: 'Doppelkreuz', key: '##' },
];

const KEY_TO_STEP: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, h: 6 };

interface Props {
  prompt: React.ReactNode;
  slots: string[];
  onSubmit: (answers: PitchName[]) => void;
  /** After checking: correct? and solution text */
  result: { correct: boolean; solution: string } | null;
}

/**
 * Entering note names in two steps: first the step, then the accidental.
 * Multiple notes (chord) are all entered first and then checked together.
 */
export default function NoteNamer({ prompt, slots, onSubmit, result }: Props) {
  const [answers, setAnswers] = useState<(PitchName | null)[]>(slots.map(() => null));
  const [active, setActive] = useState(0);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [pendingAlter, setPendingAlter] = useState(0);
  const timer = useRef<number | null>(null);
  const done = result !== null;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function commit(step: number, alter: number) {
    if (timer.current) window.clearTimeout(timer.current);
    const next = [...answers];
    next[active] = { step, alter };
    setAnswers(next);
    setPendingStep(null);
    setPendingAlter(0);
    const firstEmpty = next.findIndex((a) => a === null);
    if (firstEmpty >= 0) setActive(firstEmpty);
    else if (slots.length === 1) onSubmit(next as PitchName[]);
  }

  function submitAll() {
    if (answers.every((a) => a !== null)) onSubmit(answers as PitchName[]);
  }

  useHotkeys((e, key) => {
    if (done) return;
    const k = key.toLowerCase();
    if (k in KEY_TO_STEP && !(k === 'b')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      setPendingStep(KEY_TO_STEP[k]);
      setPendingAlter(0);
      return;
    }
    if (pendingStep !== null && (key === 'b' || key === '#')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const alter =
        key === 'b' ? (pendingAlter < 0 ? Math.max(-2, pendingAlter - 1) : -1) : pendingAlter > 0 ? Math.min(2, pendingAlter + 1) : 1;
      setPendingAlter(alter);
      if (timer.current) window.clearTimeout(timer.current);
      const step = pendingStep;
      timer.current = window.setTimeout(() => commit(step, alter), Math.abs(alter) === 2 ? 50 : 800);
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (pendingStep !== null) commit(pendingStep, pendingAlter);
      else if (slots.length > 1) submitAll();
    }
  });

  return (
    <div className="namer card stack" aria-live="polite">
      <div>{prompt}</div>
      <div className="slots" role="group" aria-label="Eingegebene Töne">
        {slots.map((label, i) => {
          const a = answers[i];
          const showPending = i === active && pendingStep !== null;
          const text = showPending ? germanName({ step: pendingStep!, alter: pendingAlter }) + ' …' : a ? germanName(a) : '–';
          return (
            <button
              key={label}
              className={`slot ${i === active && !done ? 'selected' : ''}`}
              onClick={() => !done && setActive(i)}
              disabled={done}
              aria-label={`${label}: ${a ? germanName(a) : 'leer'}`}
            >
              <span className="muted small">{label}</span> <b>{text}</b>
            </button>
          );
        })}
      </div>
      {!done && (
        <>
          <div className="steps" role="group" aria-label="Stammton">
            {STEP_LETTERS.map((l, step) => (
              <button
                key={l}
                className={pendingStep === step ? 'selected' : ''}
                onClick={() => {
                  setPendingStep(step);
                  setPendingAlter(0);
                }}
                aria-label={`Stammton ${l}`}
              >
                {l} <kbd className="hint">{l.toLowerCase()}</kbd>
              </button>
            ))}
          </div>
          <div className="accs" role="group" aria-label="Vorzeichen">
            {ACCS.map((a) => (
              <button
                key={a.alter}
                disabled={pendingStep === null}
                onClick={() => pendingStep !== null && commit(pendingStep, a.alter)}
                aria-label={a.aria}
              >
                {a.label} <kbd className="hint">{a.key}</kbd>
              </button>
            ))}
          </div>
          {slots.length > 1 && (
            <button className="primary" disabled={answers.some((a) => a === null)} onClick={submitAll}>
              Prüfen <kbd className="hint">↵</kbd>
            </button>
          )}
        </>
      )}
      {result && (
        <div className={`feedback ${result.correct ? 'ok' : 'err'}`}>
          {result.correct ? 'Richtig benannt!' : `Leider falsch. Richtig: ${result.solution}`}
        </div>
      )}
    </div>
  );
}
