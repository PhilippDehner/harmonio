import { useMemo, useState } from 'react';
import Piano from '../components/Piano';
import ScoreView from '../components/ScoreView';
import { Pitch, allSpellings, diatonicIndex, fromDiatonicIndex, keyAlter, spellForKey, toMidi, ACCIDENTAL_SYMBOLS } from '../music/pitch';
import { StaffDef } from '../score/render';
import { distributeChorale, deleteNote, insertNote, moveNoteInTime, updatePitch } from './editing';
import { BaseValue, BASE_LABELS, DNote, Dictation, Duration, durationTicks, noteEnd } from './model';

export function staffDefs(d: Dictation): StaffDef[] {
  if (d.kind === 'vierstimmig') return [{ clef: 'treble', voices: [0, 1, 2] }, { clef: 'bass', voices: [3] }];
  if (d.kind === 'zweistimmig') return [{ clef: 'treble', voices: [0] }, { clef: 'bass', voices: [1] }];
  return [{ clef: 'treble', voices: [0] }];
}

/** Tonumfang des Diktats plus etwas Puffer. */
export function dictationRange(d: Dictation): [number, number] {
  const all = d.voices.flat().map((n) => toMidi(n.pitch));
  return [Math.min(...all) - 3, Math.max(...all) + 3];
}

interface Props {
  d: Dictation;
  input: DNote[][];
  setInput: (v: DNote[][]) => void;
  mode: 'klaviatur' | 'notenblatt';
  measure: number;
  setMeasure: (m: number) => void;
}

const BASES: BaseValue[] = ['w', 'h', 'q', '8'];

export default function DictationEditor({ d, input, setInput, mode, measure, setMeasure }: Props) {
  const chorale = d.kind === 'vierstimmig';
  const staves = staffDefs(d);
  const [base, setBase] = useState<BaseValue>('q');
  const [dotted, setDotted] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [activeStaff, setActiveStaff] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursorTick, setCursorTick] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pianoVisible, setPianoVisible] = useState(true);

  const m = d.measures[measure];
  const dur: Duration = { base, dotted, triplet };
  const range = useMemo(() => dictationRange(d), [d]);
  const allNotes = input.flat();
  const selected = allNotes.find((n) => n.id === selectedId) ?? null;
  const voiceOfStaff = (s: number) => staves[s].voices[0];

  // Eingabeposition: gewählt oder Ende der letzten Note im Takt
  const cursor = useMemo(() => {
    if (chorale) return null;
    if (cursorTick !== null && cursorTick >= m.start && cursorTick < m.start + m.ticks) return cursorTick;
    const notes = input[voiceOfStaff(activeStaff)].filter((n) => n.start >= m.start && n.start < m.start + m.ticks);
    const end = notes.length ? Math.max(...notes.map(noteEnd)) : m.start;
    return end < m.start + m.ticks ? end : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorTick, input, measure, activeStaff, chorale]);

  function flash(msg: string) {
    setMessage(msg);
    window.setTimeout(() => setMessage((cur) => (cur === msg ? null : cur)), 2500);
  }

  /** Vorzeichen im Kontext: Tonart und vorangehende Noten im Takt. */
  function contextAlter(step: number, octave: number, staff: number, tick: number): number {
    const prev = staves[staff].voices
      .flatMap((v) => input[v])
      .filter((n) => n.start >= m.start && n.start < tick && n.pitch.step === step && n.pitch.octave === octave)
      .sort((a, b) => b.start - a.start)[0];
    return prev ? prev.pitch.alter : keyAlter(step, d.keyFifths);
  }

  function setVoice(v: number, notes: DNote[]) {
    const next = input.map((x, i) => (i === v ? notes : x));
    setInput(next);
  }

  /* ---------- Melodie (ein-/zweistimmig) ---------- */

  function placeNote(staff: number, tick: number, pitch: Pitch) {
    const v = voiceOfStaff(staff);
    const r = insertNote(input[v], d.measures, tick, dur, pitch);
    if (!r.ok) {
      flash(r.message);
      return;
    }
    setVoice(v, r.notes);
    setSelectedId(r.id);
    const end = tick + durationTicks(dur);
    if (end >= m.start + m.ticks && measure < d.measures.length - 1) {
      setCursorTick(null);
    } else setCursorTick(end);
  }

  /* ---------- Vierstimmig ---------- */

  function choraleState() {
    const upper = d.measures.map((mm) => [0, 1, 2].flatMap((v) => input[v].filter((n) => n.start === mm.start).map((n) => n.pitch)));
    const bass = d.measures.map((mm) => input[3].find((n) => n.start === mm.start)?.pitch ?? null);
    return { upper, bass };
  }

  function toggleChoraleNote(staff: number, pitch: Pitch) {
    if (measure === 0) {
      flash('Der erste Akkord ist vorgegeben.');
      return;
    }
    const { upper, bass } = choraleState();
    const di = diatonicIndex(pitch);
    if (staff === 0) {
      const list = upper[measure];
      const existing = list.findIndex((p) => diatonicIndex(p) === di);
      if (existing >= 0) list.splice(existing, 1);
      else if (list.length >= 3) {
        flash('Oben sind höchstens drei Töne möglich. Erst einen Ton entfernen.');
        return;
      } else list.push(pitch);
    } else {
      bass[measure] = bass[measure] && diatonicIndex(bass[measure]!) === di ? null : pitch;
    }
    const voices = distributeChorale(upper, bass, d.measures, true);
    setInput(voices);
    const sel = voices.flat().find((n) => n.start === m.start && diatonicIndex(n.pitch) === di);
    setSelectedId(sel?.id ?? null);
  }

  /* ---------- Klick ins Notensystem ---------- */

  function onHit(hit: { staff: number; tick: number; pitch: Pitch }) {
    setActiveStaff(hit.staff);
    if (chorale) {
      if (mode !== 'notenblatt') return;
      const p = { ...hit.pitch, alter: contextAlter(hit.pitch.step, hit.pitch.octave, hit.staff, m.start) };
      toggleChoraleNote(hit.staff, p);
      return;
    }
    const v = voiceOfStaff(hit.staff);
    const notesHere = input[v].filter((n) => n.start >= m.start && n.start < m.start + m.ticks);
    // Mögliche Positionen: jede Viertel sowie Enden vorhandener Noten
    const candidates = new Set<number>();
    for (let t = m.start; t < m.start + m.ticks; t += 24) candidates.add(t);
    notesHere.forEach((n) => noteEnd(n) < m.start + m.ticks && candidates.add(noteEnd(n)));
    notesHere.forEach((n) => candidates.add(n.start));
    const tick = Array.from(candidates).reduce((best, c) => (Math.abs(c - hit.tick) < Math.abs(best - hit.tick) ? c : best), m.start);
    const at = notesHere.find((n) => n.start === tick);
    if (at) {
      if (mode === 'notenblatt' && selectedId === at.id && !at.given) {
        const p = { ...hit.pitch, alter: contextAlter(hit.pitch.step, hit.pitch.octave, hit.staff, tick) };
        setVoice(v, updatePitch(input[v], at.id, p));
      } else setSelectedId(at.id);
      setCursorTick(noteEnd(at) < m.start + m.ticks ? noteEnd(at) : null);
      return;
    }
    if (mode === 'notenblatt') {
      const p = { ...hit.pitch, alter: contextAlter(hit.pitch.step, hit.pitch.octave, hit.staff, tick) };
      placeNote(hit.staff, tick, p);
    } else {
      setCursorTick(tick);
      setSelectedId(null);
    }
  }

  function onPianoKey(midi: number) {
    const pitch = spellForKey(midi, d.keyFifths);
    if (chorale) {
      toggleChoraleNote(activeStaff, pitch);
      return;
    }
    if (cursor === null) {
      flash('Der Takt ist voll. Wähle eine Position im Takt oder gehe zum nächsten Takt.');
      return;
    }
    placeNote(activeStaff, cursor, pitch);
  }

  /* ---------- Bearbeiten der ausgewählten Note ---------- */

  function editSelected(fn: (n: DNote) => Pitch) {
    if (!selected || selected.given) return;
    const p = fn(selected);
    if (chorale) {
      const { upper, bass } = choraleState();
      const ci = d.measures.findIndex((mm) => mm.start === selected.start);
      const isBass = input[3].some((n) => n.id === selected.id);
      if (isBass) bass[ci] = p;
      else {
        const idx = upper[ci].findIndex((q) => toMidi(q) === toMidi(selected.pitch) && q.step === selected.pitch.step);
        if (idx >= 0) upper[ci][idx] = p;
      }
      const voices = distributeChorale(upper, bass, d.measures, true);
      setInput(voices);
      const sel = voices.flat().find((n) => n.start === selected.start && diatonicIndex(n.pitch) === diatonicIndex(p) && n.pitch.alter === p.alter);
      setSelectedId(sel?.id ?? null);
      return;
    }
    const v = input.findIndex((voice) => voice.some((n) => n.id === selected.id));
    setVoice(v, updatePitch(input[v], selected.id, p));
  }

  function deleteSelected() {
    if (!selected || selected.given) return;
    if (chorale) {
      const isBass = input[3].some((n) => n.id === selected.id);
      toggleChoraleNote(isBass ? 1 : 0, selected.pitch);
      setSelectedId(null);
      return;
    }
    const v = input.findIndex((voice) => voice.some((n) => n.id === selected.id));
    setVoice(v, deleteNote(input[v], selected.id));
    setCursorTick(selected.start);
    setSelectedId(null);
  }

  function moveSelected(delta: number) {
    if (!selected || selected.given || chorale) return;
    const v = input.findIndex((voice) => voice.some((n) => n.id === selected.id));
    const r = moveNoteInTime(input[v], d.measures, selected.id, delta);
    if (!r.ok) flash(r.message);
    else setVoice(v, r.notes);
  }

  const step = (n: DNote, delta: number) => {
    const di = diatonicIndex(n.pitch) + delta;
    const p = fromDiatonicIndex(di);
    return { ...p, alter: keyAlter(p.step, d.keyFifths) };
  };

  const label = chorale ? 'Akkord' : 'Takt';
  const hasPickup = !chorale && d.measures.length > 1 && d.measures[0].ticks < d.measures[1].ticks;

  return (
    <div className="stack">
      <div className="toolbar">
        <button onClick={() => setMeasure(Math.max(0, measure - 1))} disabled={measure === 0} aria-label={`${label} zurück`}>
          ◀ <kbd className="hint">←</kbd>
        </button>
        <span aria-live="polite">
          {hasPickup && measure === 0
            ? 'Auftakt'
            : `${label} ${measure + (hasPickup ? 0 : 1)} / ${d.measures.length - (hasPickup ? 1 : 0)}`}
        </span>
        <button
          onClick={() => setMeasure(Math.min(d.measures.length - 1, measure + 1))}
          disabled={measure === d.measures.length - 1}
          aria-label={`${label} vor`}
        >
          ▶ <kbd className="hint">→</kbd>
        </button>
        {staves.length > 1 && (
          <div className="segmented" role="group" aria-label="Zeile wählen">
            <button aria-pressed={activeStaff === 0} onClick={() => setActiveStaff(0)}>
              obere Zeile
            </button>
            <button aria-pressed={activeStaff === 1} onClick={() => setActiveStaff(1)}>
              untere Zeile
            </button>
          </div>
        )}
      </div>

      {!chorale && (
        <div className="toolbar" role="group" aria-label="Notenwert">
          <div className="segmented">
            {BASES.map((b) => (
              <button key={b} aria-pressed={base === b} onClick={() => setBase(b)}>
                {BASE_LABELS[b]}
              </button>
            ))}
          </div>
          <label className="toggle">
            <input type="checkbox" checked={dotted} onChange={(e) => setDotted(e.target.checked)} /> punktiert
          </label>
          <label className="toggle">
            <input type="checkbox" checked={triplet} onChange={(e) => setTriplet(e.target.checked)} /> Triole
          </label>
        </div>
      )}

      <div className="editor-staff" id="dk-editor">
        <ScoreView
          ariaLabel={`Eingabe ${label} ${measure + 1}`}
          keyFifths={d.keyFifths}
          beats={d.beats}
          beatType={d.beatType}
          showTime={!chorale && measure === 0}
          barlines={!chorale}
          measures={d.measures}
          staves={staves}
          voices={input}
          fromMeasure={measure}
          toMeasure={measure + 1}
          scale={window.innerWidth < 600 ? 1.1 : 1.35}
          pxPerQuarter={60}
          fill
          selectedId={selectedId}
          activeStaff={activeStaff}
          cursor={cursor !== null ? { staff: activeStaff, tick: cursor } : null}
          onHit={onHit}
        />
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          {chorale
            ? mode === 'notenblatt'
              ? 'Ins System tippen: Ton hinzufügen oder entfernen. Oben drei Töne, unten der Bass.'
              : 'Zeile wählen und Tasten drücken: Ton hinzufügen oder entfernen.'
            : mode === 'notenblatt'
              ? 'Notenwert wählen, dann ins System tippen. Eine Note antippen wählt sie aus, erneutes Tippen ändert die Tonhöhe.'
              : 'Notenwert wählen, Position im System antippen (oder fortlaufend), dann Taste drücken.'}
        </p>
      </div>

      {message && (
        <div className="feedback info" role="status">
          {message}
        </div>
      )}

      <div className="toolbar" role="group" aria-label="Ausgewählte Note bearbeiten">
        <span className="muted small">Auswahl:</span>
        <button disabled={!selected || selected.given} onClick={() => editSelected((n) => step(n, 1))} aria-label="Höher">
          ▲
        </button>
        <button disabled={!selected || selected.given} onClick={() => editSelected((n) => step(n, -1))} aria-label="Tiefer">
          ▼
        </button>
        {[-2, -1, 0, 1, 2].map((a) => (
          <button
            key={a}
            disabled={!selected || selected.given}
            onClick={() => editSelected((n) => ({ ...n.pitch, alter: a }))}
            aria-label={['Doppel-B', 'B', 'Auflösungszeichen', 'Kreuz', 'Doppelkreuz'][a + 2]}
          >
            {ACCIDENTAL_SYMBOLS[a]}
          </button>
        ))}
        <button
          disabled={!selected || selected.given}
          onClick={() =>
            editSelected((n) => {
              const opts = allSpellings(toMidi(n.pitch));
              const i = opts.findIndex((o) => o.step === n.pitch.step && o.alter === n.pitch.alter);
              return opts[(i + 1) % opts.length];
            })
          }
        >
          enharm.
        </button>
        {!chorale && (
          <>
            <button disabled={!selected || selected.given} onClick={() => moveSelected(-12)} aria-label="Früher">
              ⇠
            </button>
            <button disabled={!selected || selected.given} onClick={() => moveSelected(12)} aria-label="Später">
              ⇢
            </button>
          </>
        )}
        <button disabled={!selected || selected.given} onClick={deleteSelected}>
          Löschen
        </button>
      </div>

      {mode === 'klaviatur' && (
        <div className="stack">
          <button className="ghost small" onClick={() => setPianoVisible((v) => !v)} aria-expanded={pianoVisible}>
            {pianoVisible ? 'Klaviatur ausblenden' : 'Klaviatur einblenden'}
          </button>
          {pianoVisible && <Piano low={range[0]} high={range[1]} keyFifths={d.keyFifths} onKey={onPianoKey} />}
        </div>
      )}
    </div>
  );
}
