import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isPlaying, onAudioState, play, playKey, stopAll, transportSeconds } from '../audio/engine';
import BetaBadge from '../components/BetaBadge';
import { useHotkeys } from '../components/hotkeys';
import Piano from '../components/Piano';
import { useTour } from '../components/Tour';
import { BASE_LABELS, BaseValue, Duration, durationTicks, measureIndexAt, newId } from '../dictation/model';
import { ACCIDENTAL_SYMBOLS, Pitch, germanNameWithOctave, spellForKey, toMidi } from '../music/pitch';
import { AnalysisView, LabelCheck, autoAnalysis, checkAnalysis, formatLabel, parseLabel } from '../satz/analysis';
import { findSong, pickRandomSong } from '../satz/catalog';
import {
  cloneVoices,
  contextAlter,
  deleteFromVoice,
  insertInVoice,
  moveToVoice,
  semitone,
  setPitch,
  snapTick,
  toggleTie,
} from '../satz/editing';
import { cssVar, violationMarks } from '../satz/marks';
import { ALTO, BASS, DEFAULT_SATZ_TEMPO, MODE_LABELS, SNote, SatzMode, Song, TENOR, VOICE_LABELS, noteEndS } from '../satz/model';
import { writeSongXml } from '../satz/musicxml';
import { satzSounds, timeMap, totalTicksOf } from '../satz/playback';
import { printSatz } from '../satz/print';
import { RULE_TITLES, Violation, checkSatz, directViolations, reportableViolations, violationKey } from '../satz/rules';
import SatzScore, { SatzHit } from '../satz/SatzScore';
import { TRANSPOSE_INTERVALS, Transposition, transposeSong, transposeVoices, transposedFifths, transpositionLabel } from '../satz/transpose';
import { TextRow } from '../satz/render';
import {
  LowerVoiceChoice,
  SatzCheckMode,
  addSatzAttempt,
  clearSatzProgress,
  getState,
  recordDirectSession,
  recordDirectShown,
  saveSatzProgress,
  updateSatzSong,
  updateSettings,
  useAppData,
} from '../storage/store';
import { keyFromFifths, keyName } from '../satz/theory';

const BASES: BaseValue[] = ['w', 'h', 'q', '8'];
const BASE_KEYS: Record<string, BaseValue> = { '1': 'w', '2': 'h', '4': 'q', '8': '8' };
const FUNCTION_BUTTONS = ['T', 'S', 'D', 'Tp', 'Sp', 'Dp', 'Tg', 'DD', 'Dv', '(D)'];
const DEGREE_BUTTONS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', '(V)'];
const SUFFIX_BUTTONS = ['7', '9', '65', '_3', '_5', '_7'];

interface State {
  /** Alto, tenor, bass (displayed key) */
  lower: SNote[][];
  analysis: Record<number, string>;
}

interface Checked {
  violations: Violation[];
  labels: LabelCheck[];
  version: number;
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileName(title: string) {
  return title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'satz';
}

/** Remount on every song change so that no state carries over. */
export default function SatzRoute() {
  const { songId } = useParams();
  return <SatzPage key={songId} songId={songId ?? ''} />;
}

function SatzPage({ songId }: { songId: string }) {
  const navigate = useNavigate();
  const data = useAppData();
  const settings = data.settings;
  const mode: SatzMode = settings.satzMode;
  const checkMode: SatzCheckMode = settings.satzCheck;
  const narrow = useNarrow();
  const original = useMemo(() => findSong(songId), [songId]);
  const songSettings = data.satz.songs[songId] ?? { transposition: null, tempo: null };
  const transposition = songSettings.transposition;
  const song: Song | null = useMemo(() => (original ? transposeSong(original, transposition) : null), [original, transposition]);
  const tempo = songSettings.tempo ?? original?.tempo ?? DEFAULT_SATZ_TEMPO;

  /* ---------- Satz state with undo/redo ---------- */
  const [state, setStateRaw] = useState<State>(() => {
    const p = getState().satz.progress[songId];
    const t = getState().satz.songs[songId]?.transposition ?? null;
    return p ? { lower: transposeVoices(p.voices, t), analysis: p.analysis ?? {} } : { lower: [[], [], []], analysis: {} };
  });
  const undoStack = useRef<State[]>([]);
  const redoStack = useRef<State[]>([]);
  const [version, setVersion] = useState(0);
  const [touched, setTouched] = useState(false);

  const commit = useCallback((next: State) => {
    setStateRaw((cur) => {
      undoStack.current = [...undoStack.current, cur].slice(-200);
      redoStack.current = [];
      return next;
    });
    setVersion((v) => v + 1);
    setTouched(true);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setStateRaw((cur) => {
      redoStack.current.push(cur);
      return prev;
    });
    setVersion((v) => v + 1);
    setTouched(true);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setStateRaw((cur) => {
      undoStack.current.push(cur);
      return next;
    });
    setVersion((v) => v + 1);
    setTouched(true);
  }, []);

  const voices: SNote[][] = useMemo(
    () => (song ? [song.melody.map((n) => ({ ...n, given: true })), ...state.lower] : [[], [], [], []]),
    [song, state.lower],
  );

  // Save progress (in the original key)
  useEffect(() => {
    if (!touched || !original) return;
    saveSatzProgress({
      songId,
      updated: Date.now(),
      voices: transposeVoices(state.lower, transposition, true),
      analysis: state.analysis,
    });
  }, [state, touched, original, songId, transposition]);

  /* ---------- Input state ---------- */
  const [base, setBase] = useState<BaseValue>('q');
  const [dotted, setDotted] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [restMode, setRestMode] = useState(false);
  const [pendingAcc, setPendingAcc] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ voice: number; tick: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analysisTick, setAnalysisTick] = useState<number | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState('');
  const dur: Duration = { base, dotted, triplet };
  const lowerChoice: LowerVoiceChoice = settings.satzLowerVoice;
  const inputMode = settings.satzInput;

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage((cur) => (cur === msg ? null : cur)), 3000);
  }, []);

  const selected = useMemo(() => voices.flat().find((n) => n.id === selectedId) ?? null, [voices, selectedId]);
  const selectedVoice = selected ? voices.findIndex((v) => v.some((n) => n.id === selected.id)) : -1;

  /* ---------- Checking ---------- */
  const result = useMemo(
    () => (song ? checkSatz({ voices, measures: song.measures, keyFifths: song.keyFifths, mode }) : null),
    [song, voices, mode],
  );
  const [checked, setChecked] = useState<Checked | null>(null);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [view, setView] = useState<'own' | 'solution'>('own');
  const [showAuto, setShowAuto] = useState(false);
  const attempts = data.satz.attempts.filter((a) => a.songId === songId);
  const everChecked = attempts.length > 0 || checked !== null;

  const directShown = useMemo(() => (result && checkMode === 'direct' ? directViolations(result) : []), [result, checkMode]);
  const seenKeys = useRef(new Set<string>());
  const directSessionCounted = useRef(false);
  useEffect(() => {
    if (checkMode !== 'direct') return;
    const fresh = directShown.filter((v) => !seenKeys.current.has(violationKey(v)));
    fresh.forEach((v) => seenKeys.current.add(violationKey(v)));
    if (fresh.length && touched) recordDirectShown(fresh.map((v) => v.rule));
  }, [directShown, checkMode, touched]);
  useEffect(() => {
    if (checkMode === 'direct' && touched && !directSessionCounted.current) {
      directSessionCounted.current = true;
      recordDirectSession();
    }
  }, [checkMode, touched]);

  const checkValid = checked && checked.version === version;
  const shownViolations: Violation[] =
    view === 'solution' ? [] : checkValid ? checked!.violations : checkMode === 'direct' ? directShown : [];

  function doCheck() {
    if (!song || !result) return;
    stopAll();
    const labels = checkAnalysis(result, state.analysis);
    const violations = reportableViolations(result);
    const counts: Record<string, number> = {};
    for (const v of violations) counts[v.rule] = (counts[v.rule] ?? 0) + 1;
    addSatzAttempt({
      id: newId('t'),
      songId,
      date: Date.now(),
      mode,
      direct: checkMode === 'direct',
      transposition,
      voices: transposeVoices(state.lower, transposition, true),
      analysis: state.analysis,
      violations: counts,
      analysisErrors: labels.filter((l) => !l.ok).length,
      analysisLabels: labels.length,
    });
    setChecked({ violations, labels, version });
    setSelectedViolation(null);
    setView('own');
  }

  /* ---------- Solution ---------- */
  const solutionResult = useMemo(
    () =>
      song?.solution ? checkSatz({ voices: song.solution, measures: song.measures, keyFifths: song.keyFifths, mode }) : null,
    [song, mode],
  );
  const analysisView: AnalysisView = settings.satzAnalysisView;
  const autoRows = useCallback(
    (r: ReturnType<typeof checkSatz> | null): TextRow[][] => {
      if (!r) return [];
      const labels = autoAnalysis(r);
      const fn: TextRow[] = labels.filter((l) => l.function).map((l) => ({ tick: l.tick, text: formatLabel(l.function!) }));
      const dg: TextRow[] = labels.map((l) => ({ tick: l.tick, text: formatLabel(l.degree) }));
      return analysisView === 'function' ? [fn] : analysisView === 'degree' ? [dg] : [fn, dg];
    },
    [analysisView],
  );

  /* ---------- Playback ---------- */
  const [playing, setPlaying] = useState(isPlaying());
  const [playTick, setPlayTick] = useState<number | null>(null);
  const [mute, setMute] = useState([false, false, false, false]);
  useEffect(() => onAudioState(() => setPlaying(isPlaying())), []);
  useEffect(() => () => stopAll(), []);
  const playRef = useRef<{ fromTick: number; voices: SNote[][] } | null>(null);

  useEffect(() => {
    if (!playing || !song) {
      setPlayTick(null);
      return;
    }
    let raf = 0;
    let lastMeasure = -1;
    const loop = () => {
      const ref = playRef.current;
      if (ref) {
        const tm = timeMap(ref.voices, tempo);
        const tick = tm.tickAt(tm.secAt(ref.fromTick) + Math.max(0, transportSeconds() - 0.05));
        const mi = measureIndexAt(song.measures, tick);
        if (mi !== lastMeasure) {
          lastMeasure = mi;
          setPlayTick(song.measures[mi].start);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, song, tempo]);

  const shownVoices = view === 'solution' && song?.solution ? song.solution : voices;

  function startPlay(onlyMelody = false) {
    if (!song) return;
    if (isPlaying()) {
      stopAll();
      return;
    }
    const from = selected ? song.measures[measureIndexAt(song.measures, selected.start)].start : 0;
    const muteNow = onlyMelody ? [false, true, true, true] : mute;
    playRef.current = { fromTick: from, voices: shownVoices };
    void play({ sounds: satzSounds(shownVoices, tempo, from, muteNow) });
  }

  /* ---------- Editing ---------- */
  function setLower(nextLower: SNote[][], analysis = state.analysis) {
    commit({ lower: nextLower, analysis });
  }

  function voiceForClick(staff: number, tick: number, pitch: Pitch): number {
    if (staff === 0) return ALTO;
    if (lowerChoice === 'tenor') return TENOR;
    if (lowerChoice === 'bass') return BASS;
    const t = voices[TENOR].find((n) => n.start <= tick && tick < noteEndS(n));
    const b = voices[BASS].find((n) => n.start <= tick && tick < noteEndS(n));
    if (t && !b) return BASS;
    if (b && !t) return TENOR;
    if (t && b) {
      const m = toMidi(pitch);
      return Math.abs(toMidi(t.pitch) - m) <= Math.abs(toMidi(b.pitch) - m) ? TENOR : BASS;
    }
    // Boundary around the small e (E3)
    return toMidi(pitch) >= 52 ? TENOR : BASS;
  }

  function placeAt(voice: number, tick: number, pitch: Pitch | null) {
    if (!song) return;
    const r = insertInVoice(voices[voice], song.measures, tick, dur, pitch);
    if (!r.ok) {
      flash(r.message);
      return;
    }
    const nextLower = state.lower.map((v, i) => (i + 1 === voice ? r.notes : v));
    setLower(nextLower);
    setSelectedId(r.id);
    setPendingAcc(null);
    if (dotted) setDotted(false);
    const end = tick + durationTicks(dur);
    const m = song.measures[measureIndexAt(song.measures, Math.min(end, totalTicksOf([song.melody]) - 1))];
    setCursor({ voice, tick: end < totalTicksOf([song.melody]) ? (end >= m.start ? end : m.start) : tick });
    if (pitch) void playKey(toMidi(pitch), 0.6);
  }

  function pitchWithAccidental(p: Pitch, staff: number, tick: number): Pitch {
    if (!song) return p;
    if (pendingAcc !== null) return { ...p, alter: pendingAcc };
    const m = song.measures[measureIndexAt(song.measures, tick)];
    const staffNotes = staff === 0 ? [...voices[0], ...voices[1]] : [...voices[2], ...voices[3]];
    return { ...p, alter: contextAlter(staffNotes, m, p.step, p.octave, tick, song.keyFifths) };
  }

  function onHit(hit: SatzHit) {
    if (!song) return;
    if (view === 'solution') return;
    const m = song.measures[hit.measure];
    const tick = snapTick(voices, m, hit.tick, dur);
    setAnalysisTick(tickForAnalysis(tick));
    if (hit.note) {
      setSelectedId(hit.note.id);
      const n = voices[hit.note.voice].find((x) => x.id === hit.note!.id);
      if (n) setCursor({ voice: hit.note.voice === 0 ? ALTO : hit.note.voice, tick: noteEndS(n) });
      return;
    }
    const p = pitchWithAccidental(hit.pitch, hit.staff, tick);
    const voice = voiceForClick(hit.staff, tick, p);
    if (inputMode === 'keyboard') {
      setCursor({ voice, tick });
      setSelectedId(null);
      return;
    }
    // Same position and voice as the selected note: change its pitch
    const existing = voices[voice].find((n) => n.start === tick);
    if (existing && existing.id === selectedId && !existing.given && !restMode) {
      setLower(state.lower.map((v, i) => (i + 1 === voice ? setPitch(v, existing.id, p) : v)));
      setPendingAcc(null);
      void playKey(toMidi(p), 0.6);
      return;
    }
    placeAt(voice, tick, restMode ? null : p);
  }

  function onPianoKey(midi: number) {
    if (!song) return;
    if (!cursor) {
      flash('Erst eine Position im Notensystem antippen.');
      return;
    }
    placeAt(cursor.voice, cursor.tick, restMode ? null : spellForKey(midi, song.keyFifths));
  }

  function editSelected(fn: (n: SNote) => SNote | null) {
    if (!selected || selected.given || selectedVoice < 1) return;
    const next = fn(selected);
    if (!next) return;
    setLower(state.lower.map((v, i) => (i + 1 === selectedVoice ? v.map((n) => (n.id === selected.id ? next : n)) : v)));
    if (!next.rest) void playKey(toMidi(next.pitch), 0.5);
  }

  function deleteSelected() {
    if (!selected || selected.given || selectedVoice < 1) return;
    setLower(state.lower.map((v, i) => (i + 1 === selectedVoice ? deleteFromVoice(v, selected.id) : v)));
    setCursor({ voice: selectedVoice, tick: selected.start });
    setSelectedId(null);
  }

  function tieSelected() {
    if (!selected || selected.given || selectedVoice < 1) return;
    const r = toggleTie(state.lower[selectedVoice - 1], selected.id);
    if (!r.ok) {
      flash(r.message);
      return;
    }
    setLower(state.lower.map((v, i) => (i + 1 === selectedVoice ? r.notes : v)));
  }

  function assignSelected(target: number) {
    if (!song || !selected || selected.given || selectedVoice < 1) return;
    const r = moveToVoice(voices, song.measures, selected.id, target);
    if (!r.ok) {
      flash(r.message);
      return;
    }
    setLower(r.voices.slice(1));
    setSelectedId(r.id);
  }

  function chooseDuration(change: Partial<Duration>) {
    const next = { ...dur, ...change };
    setBase(next.base);
    setDotted(next.dotted);
    setTriplet(next.triplet);
    // Change the duration of the selected note
    if (song && selected && !selected.given && selectedVoice >= 1) {
      const r = insertInVoice(
        voices[selectedVoice].filter((n) => n.id !== selected.id),
        song.measures,
        selected.start,
        next,
        selected.rest ? null : selected.pitch,
      );
      if (!r.ok) {
        flash(r.message);
        return;
      }
      setLower(state.lower.map((v, i) => (i + 1 === selectedVoice ? r.notes : v)));
      setSelectedId(r.id);
    }
  }

  /* ---------- Analysis ---------- */
  function tickForAnalysis(tick: number): number {
    if (!song) return tick;
    // Snap to the onset of a soprano note or any voice
    const onsets = Array.from(new Set(voices.flatMap((v) => v.map((n) => n.start)))).sort((a, b) => a - b);
    let best = onsets[0] ?? 0;
    for (const o of onsets) if (o <= tick) best = o;
    return best;
  }
  useEffect(() => {
    if (analysisTick === null) return;
    setAnalysisDraft(state.analysis[analysisTick] ?? '');
  }, [analysisTick, state.analysis]);
  useEffect(() => {
    if (selected) setAnalysisTick(selected.start);
  }, [selected]);

  function saveAnalysis(text: string) {
    if (analysisTick === null) return;
    const t = text.trim();
    if (t) {
      const p = parseLabel(t);
      if ('error' in p) {
        flash(p.error);
        return;
      }
    }
    const analysis = { ...state.analysis };
    if (t) analysis[analysisTick] = t;
    else delete analysis[analysisTick];
    commit({ lower: state.lower, analysis });
  }

  /* ---------- Transposition ---------- */
  function changeTransposition(t: Transposition | null) {
    if (!original) return;
    if (t && transposedFifths(original.keyFifths, t) === null) {
      flash('Diese Tonart hätte mehr als 7 Vorzeichen. Bitte ein anderes Intervall wählen.');
      return;
    }
    stopAll();
    const inOriginal = transposeVoices(state.lower, transposition, true);
    const next = transposeVoices(inOriginal, t);
    commit({ lower: next, analysis: state.analysis });
    updateSatzSong(songId, { transposition: t });
    setChecked(null);
  }

  /* ---------- Hotkeys ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox'))) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useHotkeys((e, key) => {
    if (e.key === ' ') {
      e.preventDefault();
      startPlay();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!selected || selected.given) return;
      e.preventDefault();
      editSelected((n) => (n.rest ? null : { ...n, pitch: semitone(n.pitch, e.key === 'ArrowUp') }));
    } else if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (BASE_KEYS[key]) {
      chooseDuration({ base: BASE_KEYS[key] });
    } else if (key === '.') {
      chooseDuration({ dotted: !dotted });
    } else if (key === 't' || key === 'T') {
      chooseDuration({ triplet: !triplet });
    } else if (key === 'p' || key === 'P') {
      setRestMode((r) => !r);
    } else if (key === '#' || key === '+') {
      setPendingAcc((a) => (a === 1 ? null : 1));
    } else if (key === '-') {
      setPendingAcc((a) => (a === -1 ? null : -1));
    } else if (key === 'n' || key === 'N') {
      setPendingAcc((a) => (a === 0 ? null : 0));
    } else if (key === 'h' || key === 'H') {
      tieSelected();
    } else if (key === 'Escape') {
      setSelectedId(null);
    }
  });

  /* ---------- Tour ---------- */
  const tour = useTour('satz', [
    { title: 'Tonsatz', text: 'Die Melodie (Sopran) ist vorgegeben. Schreibe Alt, Tenor und Bass dazu – die Regeln werden automatisch geprüft.' },
    { selector: '#sz-options', title: 'Chor- oder Orgelsatz', text: 'Wähle Chor- oder Orgelsatz und ob Fehler erst beim Prüfen oder direkt angezeigt werden. Beides lässt sich jederzeit umschalten. Hier kannst du die Melodie auch transponieren.' },
    { selector: '#sz-tools', title: 'Eingabe', text: 'Notenwert wählen, dann ins Notensystem tippen. Oben ist jede Note Alt; unten wählst du Tenor, Bass oder „automatisch“. Kreuz/B vor dem Tippen oder danach mit ↑/↓ um einen Halbton verschieben.' },
    { selector: '#sz-score', title: 'Notenbild', text: 'Eine Note antippen wählt sie aus: dann kannst du sie verschieben, löschen, binden oder einer anderen Stimme zuweisen.' },
    { selector: '#sz-play', title: 'Anhören', text: 'Den eigenen Satz oder nur die Melodie abspielen (Leertaste). Einzelne Stimmen lassen sich stummschalten, das Tempo ist einstellbar.' },
    { selector: '#sz-analysis', title: 'Harmonieanalyse', text: 'Optional: Funktionen oder Stufen über den Satz schreiben, z. B. „D7_3“ oder „(D7)“. Sie werden beim Prüfen mitgeprüft.' },
    { selector: '#sz-check', title: 'Prüfen', text: 'Regelverstöße werden im Notenbild markiert und erklärt. Danach kannst du weiter korrigieren und erneut prüfen.' },
  ]);

  if (!original || !song) {
    return (
      <div className="stack">
        <p>Dieses Lied wurde nicht gefunden.</p>
        <Link className="btn" to="/satz">
          Zur Liedliste
        </Link>
      </div>
    );
  }

  const marks = violationMarks(shownViolations, selectedViolation);
  const solutionMarks = solutionResult ? violationMarks(solutionResult.violations) : null;
  const labelRows: TextRow[] = Object.entries(state.analysis).map(([t, text]) => {
    const tick = Number(t);
    const c = checkValid ? checked!.labels.find((l) => l.tick === tick) : undefined;
    return { tick, text: formatLabel(text), color: c ? cssVar(c.ok ? '--ok' : '--err') : undefined };
  });
  const ownRows: TextRow[][] = [labelRows, ...(showAuto && everChecked && result ? autoRows(result) : [])];
  const textRows = view === 'solution' ? autoRows(solutionResult) : ownRows;
  const keyText = keyName(keyFromFifths(song.keyFifths));
  const hasPickup = song.measures.length > 1 && song.measures[0].ticks < song.measures[1].ticks;
  const measureOf = (tick: number) => measureIndexAt(song.measures, tick) + (hasPickup ? 0 : 1);
  const done = attempts.length > 0;

  function exportXml(withAnalysis: boolean) {
    const xml = writeSongXml({
      title: song!.title,
      keyFifths: song!.keyFifths,
      beats: song!.beats,
      beatType: song!.beatType,
      tempo,
      measures: song!.measures,
      voices: shownVoices,
      analysis: withAnalysis && view === 'own' ? state.analysis : undefined,
    });
    download(`${fileName(song!.title)}.musicxml`, xml, 'application/vnd.recordare.musicxml+xml');
  }

  return (
    <div className="stack satz-page">
      <div className="row">
        <h1 style={{ margin: 0 }}>
          {song.title}
          <BetaBadge />
        </h1>
        <span className="spacer" />
        <Link className="btn" to="/satz">
          Liste
        </Link>
        <Link className="btn" to="/satz/regeln">
          Regeln
        </Link>
        <button onClick={tour.start} aria-label="Hilfe: Tour starten">
          Hilfe
        </button>
      </div>

      <div className="card small">
        {keyText}-Dur · {song.beats}/{song.beatType}-Takt · {MODE_LABELS[mode]}
        {transposition && <> · transponiert: {transpositionLabel(transposition)}</>}
        {done && <> · <span className="status-icon status-done">✓</span> geprüft</>}
        {song.uploaded && <> · eigene Melodie</>}
      </div>

      <div className="card stack" id="sz-options">
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Satzart">
            {(['choir', 'organ'] as SatzMode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => updateSettings({ satzMode: m })}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Prüfung">
            <button aria-pressed={checkMode === 'end'} onClick={() => updateSettings({ satzCheck: 'end' })}>
              Prüfen am Ende
            </button>
            <button aria-pressed={checkMode === 'direct'} onClick={() => updateSettings({ satzCheck: 'direct' })}>
              Direkt prüfen
            </button>
          </div>
        </div>
        <div className="toolbar">
          <label htmlFor="sz-transpose">Transponieren:</label>
          <select
            id="sz-transpose"
            value={transposition?.interval ?? ''}
            onChange={(e) => changeTransposition(e.target.value ? { interval: e.target.value, up: transposition?.up ?? true } : null)}
          >
            <option value="">Originaltonart</option>
            {TRANSPOSE_INTERVALS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          {transposition && (
            <div className="segmented" role="group" aria-label="Richtung">
              <button aria-pressed={transposition.up} onClick={() => changeTransposition({ ...transposition, up: true })}>
                aufwärts
              </button>
              <button aria-pressed={!transposition.up} onClick={() => changeTransposition({ ...transposition, up: false })}>
                abwärts
              </button>
            </div>
          )}
        </div>
      </div>

      {view === 'own' && (
        <div className="stack" id="sz-tools">
          <div className="toolbar" role="group" aria-label="Notenwert">
            <div className="segmented">
              {BASES.map((b) => (
                <button key={b} aria-pressed={base === b} onClick={() => chooseDuration({ base: b })}>
                  {BASE_LABELS[b]} <kbd className="hint">{{ w: '1', h: '2', q: '4', '8': '8' }[b]}</kbd>
                </button>
              ))}
            </div>
            <label className="toggle">
              <input type="checkbox" checked={dotted} onChange={(e) => chooseDuration({ dotted: e.target.checked })} /> punktiert{' '}
              <kbd className="hint">.</kbd>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={triplet} onChange={(e) => chooseDuration({ triplet: e.target.checked })} /> Triole{' '}
              <kbd className="hint">t</kbd>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={restMode} onChange={(e) => setRestMode(e.target.checked)} /> Pause{' '}
              <kbd className="hint">p</kbd>
            </label>
          </div>
          <div className="toolbar">
            <span className="small">Vorzeichen für die nächste Note:</span>
            <div className="segmented" role="group" aria-label="Vorzeichen">
              {[1, -1, 0].map((a) => (
                <button key={a} aria-pressed={pendingAcc === a} onClick={() => setPendingAcc((x) => (x === a ? null : a))}>
                  {ACCIDENTAL_SYMBOLS[a]} <kbd className="hint">{a === 1 ? '#' : a === -1 ? '-' : 'n'}</kbd>
                </button>
              ))}
            </div>
            <span className="small">Bassschlüssel:</span>
            <div className="segmented" role="group" aria-label="Stimme im Bassschlüssel">
              {(['tenor', 'bass', 'auto'] as LowerVoiceChoice[]).map((c) => (
                <button key={c} aria-pressed={lowerChoice === c} onClick={() => updateSettings({ satzLowerVoice: c })}>
                  {c === 'tenor' ? 'Tenor' : c === 'bass' ? 'Bass' : 'automatisch'}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Eingabe">
              <button aria-pressed={inputMode === 'score'} onClick={() => updateSettings({ satzInput: 'score' })}>
                Notenblatt
              </button>
              <button aria-pressed={inputMode === 'keyboard'} onClick={() => updateSettings({ satzInput: 'keyboard' })}>
                Klaviatur
              </button>
            </div>
          </div>
        </div>
      )}

      {everChecked && song.solution && (
        <div className="segmented" role="group" aria-label="Ansicht">
          <button aria-pressed={view === 'own'} onClick={() => setView('own')}>
            Eigener Satz
          </button>
          <button aria-pressed={view === 'solution'} onClick={() => setView('solution')}>
            Beispiellösung
          </button>
        </div>
      )}

      <SatzScore
        id="sz-score"
        ariaLabel={view === 'solution' ? 'Beispiellösung' : 'Eigener Satz'}
        keyFifths={song.keyFifths}
        beats={song.beats}
        beatType={song.beatType}
        measures={song.measures}
        voices={shownVoices}
        scale={narrow ? 1 : 1.1}
        singleLine={narrow}
        pxPerQuarter={narrow ? 44 : 40}
        noteStyles={view === 'solution' ? solutionMarks?.noteStyles : marks.noteStyles}
        lines={view === 'solution' ? solutionMarks?.lines : marks.lines}
        selectedId={view === 'own' ? selectedId : null}
        cursor={view === 'own' && inputMode === 'keyboard' ? cursor : null}
        playTick={playTick}
        follow
        showLyrics
        givenColor={view === 'own'}
        textRows={textRows}
        onHit={view === 'own' ? onHit : undefined}
      />
      <p className="muted small" style={{ margin: 0 }}>
        {view === 'solution'
          ? 'Beispiellösung mit automatischer Harmonieanalyse. Markierte Stellen verstoßen gegen eine Regel.'
          : inputMode === 'keyboard'
            ? 'Position im System antippen, dann Taste drücken. Die Eingabe läuft in derselben Stimme weiter.'
            : 'Notenwert wählen, dann ins System tippen. Oben: Alt. Unten: Tenor oder Bass. Note antippen = auswählen.'}
      </p>

      {message && (
        <div className="feedback info" role="status">
          {message}
        </div>
      )}

      {view === 'own' && (
        <div className="toolbar" role="group" aria-label="Ausgewählte Note bearbeiten">
          <span className="muted small">
            Auswahl:{' '}
            {selected
              ? `${VOICE_LABELS[selectedVoice]} ${selected.rest ? 'Pause' : germanNameWithOctave(selected.pitch)}`
              : '–'}
          </span>
          <button disabled={!selected || selected.given || selected.rest} onClick={() => editSelected((n) => ({ ...n, pitch: semitone(n.pitch, true) }))} aria-label="Halbton höher">
            ▲ <kbd className="hint">↑</kbd>
          </button>
          <button disabled={!selected || selected.given || selected.rest} onClick={() => editSelected((n) => ({ ...n, pitch: semitone(n.pitch, false) }))} aria-label="Halbton tiefer">
            ▼ <kbd className="hint">↓</kbd>
          </button>
          <button disabled={!selected || selected.given || selected.rest} onClick={tieSelected}>
            Haltebogen <kbd className="hint">h</kbd>
          </button>
          {[ALTO, TENOR, BASS].map((v) => (
            <button key={v} disabled={!selected || selected.given || selectedVoice === v} onClick={() => assignSelected(v)}>
              → {VOICE_LABELS[v]}
            </button>
          ))}
          <button disabled={!selected || selected.given} onClick={deleteSelected}>
            Löschen <kbd className="hint">Entf</kbd>
          </button>
          <button disabled={!undoStack.current.length} onClick={undo} aria-label="Rückgängig">
            ↶ <kbd className="hint">Strg+Z</kbd>
          </button>
          <button disabled={!redoStack.current.length} onClick={redo} aria-label="Wiederholen">
            ↷ <kbd className="hint">Strg+Y</kbd>
          </button>
        </div>
      )}

      {view === 'own' && inputMode === 'keyboard' && (
        <div className="stack">
          <div className="toolbar">
            <span className="small">Stimme:</span>
            <div className="segmented" role="group" aria-label="Stimme für die Klaviatur">
              {[ALTO, TENOR, BASS].map((v) => (
                <button key={v} aria-pressed={cursor?.voice === v} onClick={() => setCursor({ voice: v, tick: cursor?.tick ?? 0 })}>
                  {VOICE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
          <Piano low={36} high={84} keyFifths={song.keyFifths} onKey={onPianoKey} />
        </div>
      )}

      <div className="play-area card" id="sz-play">
        <button className="primary" onClick={() => startPlay()}>
          {playing ? '■ Stopp' : view === 'solution' ? '▶ Lösung abspielen' : '▶ Satz abspielen'} <kbd className="hint">Leertaste</kbd>
        </button>
        <button onClick={() => startPlay(true)} disabled={playing}>
          Nur Melodie
        </button>
        <span className="small muted">{selected ? 'ab dem Takt der Auswahl' : 'von Anfang an'}</span>
        <div className="toolbar">
          {VOICE_LABELS.map((label, v) => (
            <label key={v} className="toggle">
              <input type="checkbox" checked={!mute[v]} onChange={(e) => setMute((m) => m.map((x, i) => (i === v ? !e.target.checked : x)))} />{' '}
              {label}
            </label>
          ))}
        </div>
        <label className="row small" style={{ gap: 6 }}>
          Tempo
          <input
            type="range"
            min={40}
            max={160}
            step={2}
            value={tempo}
            onChange={(e) => updateSatzSong(songId, { tempo: Number(e.target.value) })}
          />
          {tempo} ♩/min
        </label>
      </div>

      {view === 'own' && (
        <details className="card stack" id="sz-analysis" open={Object.keys(state.analysis).length > 0 || undefined}>
          <summary>Harmonieanalyse (optional)</summary>
          <p className="muted small" style={{ margin: 0 }}>
            Note oder Stelle im Satz antippen, dann Funktion oder Stufe eingeben. Umkehrungen über den Basston: „_3“ = Terz
            im Bass. Zwischendominanten in Klammern, z. B. „(D7)“. Tonartwechsel mit Vorsatz, z. B. „G: D7“.
          </p>
          {analysisTick === null ? (
            <p className="small">Erst eine Stelle im Notenbild antippen.</p>
          ) : (
            <>
              <div className="row">
                <span className="small">Stelle: Takt {measureOf(analysisTick)}</span>
                <input
                  type="text"
                  value={analysisDraft}
                  placeholder="z. B. D7_3"
                  aria-label="Analyse an dieser Stelle"
                  onChange={(e) => setAnalysisDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAnalysis(analysisDraft);
                  }}
                  style={{ width: '9em' }}
                />
                <button onClick={() => saveAnalysis(analysisDraft)}>Übernehmen</button>
                <button onClick={() => saveAnalysis('')} disabled={!state.analysis[analysisTick]}>
                  Entfernen
                </button>
                {analysisDraft && <span className="analysis-preview">{formatLabel(analysisDraft)}</span>}
              </div>
              <div className="toolbar">
                {[...FUNCTION_BUTTONS, ...DEGREE_BUTTONS, ...SUFFIX_BUTTONS].map((b) => (
                  <button
                    key={b}
                    className="small"
                    onClick={() =>
                      setAnalysisDraft((d) => {
                        if (b.startsWith('(')) return d.startsWith('(') ? d : `(${d || b.slice(1, -1)})`;
                        if (/^[_0-9]/.test(b)) return d + b;
                        return b;
                      })
                    }
                  >
                    {b.startsWith('_') ? `${b.slice(1)} im Bass` : formatLabel(b)}
                  </button>
                ))}
              </div>
            </>
          )}
        </details>
      )}

      {view === 'own' && (
        <div className="row" id="sz-check">
          <button className="primary" onClick={doCheck}>
            {everChecked ? 'Erneut prüfen' : 'Prüfen'}
          </button>
          <button
            onClick={() => {
              if (!confirm('Alle eigenen Stimmen und die Analyse löschen und neu anfangen?')) return;
              clearSatzProgress(songId);
              commit({ lower: [[], [], []], analysis: {} });
              setChecked(null);
              setSelectedId(null);
            }}
          >
            Neu anfangen
          </button>
          <button
            onClick={() => {
              const done2 = new Set(getState().satz.attempts.map((a) => a.songId));
              done2.add(songId);
              const e = pickRandomSong(done2);
              if (e) navigate(`/satz/lied/${encodeURIComponent(e.id)}`);
            }}
          >
            Nächstes zufälliges Lied
          </button>
        </div>
      )}

      {checked && !checkValid && view === 'own' && (
        <div className="feedback info small">Seit der letzten Prüfung geändert – zum Aktualisieren erneut prüfen.</div>
      )}

      {view === 'own' && (checkValid || checkMode === 'direct') && (
        <ViolationList
          violations={shownViolations}
          selected={selectedViolation}
          onSelect={setSelectedViolation}
          title={checkValid ? 'Prüfung' : 'Direkte Prüfung (nur Stellen mit allen vier Stimmen)'}
          measureOf={measureOf}
        />
      )}
      {view === 'own' && checkValid && checked!.labels.length > 0 && (
        <div className="card small">
          <b>Harmonieanalyse:</b> {checked!.labels.filter((l) => l.ok).length} von {checked!.labels.length} Angaben passen.
          <ul className="plain-list">
            {checked!.labels
              .filter((l) => !l.ok)
              .map((l) => (
                <li key={l.tick}>
                  <span className="text-err">{formatLabel(l.text)}</span> (Takt{' '}
                  {measureOf(l.tick)}): {l.message}
                </li>
              ))}
          </ul>
        </div>
      )}
      {view === 'solution' && solutionResult && (
        <ViolationList violations={solutionResult.violations} selected={null} onSelect={() => undefined} title="Regelprüfung der Beispiellösung" measureOf={measureOf} />
      )}

      {(everChecked || view === 'solution') && (
        <div className="toolbar">
          <span className="small">Automatische Analyse:</span>
          {view === 'own' && (
            <label className="toggle">
              <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> für den eigenen Satz anzeigen
            </label>
          )}
          <div className="segmented" role="group" aria-label="Analyse">
            {(
              [
                ['function', 'Funktionen'],
                ['degree', 'Stufen'],
                ['both', 'beides'],
              ] as [AnalysisView, string][]
            ).map(([v, label]) => (
              <button key={v} aria-pressed={analysisView === v} onClick={() => updateSettings({ satzAnalysisView: v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <details className="card stack">
        <summary>Exportieren</summary>
        <ExportPanel
          onXml={exportXml}
          onPdf={(withMarks, withAnalysis) =>
            printSatz({
              title: song.title,
              subtitle: `${keyText}-Dur · ${MODE_LABELS[mode]}${view === 'solution' ? ' · Beispiellösung' : ''}`,
              keyFifths: song.keyFifths,
              beats: song.beats,
              beatType: song.beatType,
              measures: song.measures,
              voices: shownVoices,
              noteStyles: withMarks ? (view === 'solution' ? solutionMarks?.noteStyles : violationMarks(result ? reportableViolations(result) : []).noteStyles) : undefined,
              lines: withMarks ? (view === 'solution' ? solutionMarks?.lines : violationMarks(result ? reportableViolations(result) : []).lines) : undefined,
              textRows: withAnalysis ? textRows : undefined,
            })
          }
        />
      </details>

      {attempts.length > 0 && (
        <details className="card">
          <summary>Bisherige Prüfungen ({attempts.length})</summary>
          <div className="table-wrap">
            <table className="stats">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Satzart</th>
                  <th>Fehler</th>
                  <th>Analyse</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...attempts].reverse().map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.date).toLocaleString('de-DE')}</td>
                    <td>
                      {MODE_LABELS[a.mode]}
                      {a.direct ? ' (direkt)' : ''}
                    </td>
                    <td className="num">{Object.values(a.violations).reduce((x, y) => x + y, 0)}</td>
                    <td className="num">{a.analysisLabels ? `${a.analysisLabels - a.analysisErrors}/${a.analysisLabels}` : '–'}</td>
                    <td>
                      <button
                        className="small"
                        onClick={() => {
                          if (!confirm('Diesen Versuch laden? Der aktuelle Stand lässt sich mit Rückgängig wiederherstellen.')) return;
                          commit({ lower: transposeVoices(cloneVoices(a.voices), transposition), analysis: a.analysis });
                        }}
                      >
                        laden
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {tour.element}
    </div>
  );
}

function ViolationList({
  violations,
  selected,
  onSelect,
  title,
  measureOf,
}: {
  violations: Violation[];
  selected: Violation | null;
  onSelect: (v: Violation | null) => void;
  title: string;
  measureOf: (tick: number) => number;
}) {
  if (violations.length === 0) {
    return (
      <div className="feedback ok" role="status">
        {title}: keine Regelverstöße gefunden.
      </div>
    );
  }
  return (
    <div className="card stack violations" role="status">
      <b>
        {title}: {violations.length} Regelverstö{violations.length === 1 ? 'ß' : 'ße'}
      </b>
      <ul className="plain-list">
        {violations.map((v, i) => (
          <li key={i} className={selected === v ? 'active' : ''}>
            <button className="link-button" onClick={() => onSelect(selected === v ? null : v)}>
              <b>{RULE_TITLES[v.rule]}:</b> {v.rule === 'rhythm' ? '' : `Takt ${measureOf(v.tick)}: `}
              {v.message}
            </button>{' '}
            <Link to={`/satz/regeln/${v.rule}`} className="small">
              Regel ansehen
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExportPanel({ onXml, onPdf }: { onXml: (withAnalysis: boolean) => void; onPdf: (marks: boolean, analysis: boolean) => void }) {
  const [marks, setMarks] = useState(true);
  const [analysis, setAnalysis] = useState(true);
  return (
    <div className="stack">
      <div className="toolbar">
        <label className="toggle">
          <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> mit Fehlermarkierung
        </label>
        <label className="toggle">
          <input type="checkbox" checked={analysis} onChange={(e) => setAnalysis(e.target.checked)} /> mit Harmonieanalyse
        </label>
      </div>
      <div className="row">
        <button onClick={() => onXml(analysis)}>MusicXML herunterladen</button>
        <button onClick={() => onPdf(marks, analysis)}>PDF (Drucken)</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        PDF: Es öffnet sich der Druckdialog – dort „Als PDF speichern“ wählen.
      </p>
    </div>
  );
}
