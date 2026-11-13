import { useCallback, useState, useSyncExternalStore } from 'react';
import type { DNote } from '../dictation/model';
import type { IntervalPlayMode } from '../music/tasks';
import type { VoiceType } from '../audio/pitchDetect';
import type { PitchGivingOptions, SingOrder } from '../music/pitchGiving';
import { DEFAULT_A4, setA4 } from '../audio/tuning';
import type { SNote, SatzMode } from '../satz/model';
import type { Transposition } from '../satz/transpose';
import type { AnalysisView } from '../satz/analysis';
import { migrateDictations, migrateSatz, migrateSettings, migrateStats, migrateTours } from './migrate';

const PREFIX = 'harmonio:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readRaw<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: ignore
  }
}

/* ---------- Settings ---------- */

export type RangeLevel = 'narrow' | 'medium' | 'wide';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type InputMode = 'paper' | 'keyboard' | 'score';

export interface Settings {
  range: RangeLevel;
  theme: ThemeSetting;
  intervalMode: IntervalPlayMode;
  intervalExtended: boolean;
  intervalNaming: boolean;
  chordLevel: 1 | 2;
  chordNaming: boolean;
  adaptive: boolean;
  showStats: boolean;
  inputMode: InputMode;
  /** Automatically go to the next task after a correct answer */
  autoNextCorrect: boolean;
  /** Automatically go to the next task after a wrong answer */
  autoNextWrong: boolean;
  /** Delay in seconds for both cases */
  autoNextSeconds: number;
  /** Voice type for the pitch-giving exercise; null = not detected yet */
  voiceType: VoiceType | null;
  /** Order in which the notes are sung in the pitch-giving exercise */
  singOrder: SingOrder;
  /** Concert pitch a' in Hz (410–450) */
  tuningA4: number;
  /** Pitch giving: keys with up to 3 accidentals */
  pgFewAccidentals: boolean;
  /** Pitch giving: keys with 4–7 accidentals */
  pgManyAccidentals: boolean;
  /** Pitch giving: major chords */
  pgMajor: boolean;
  /** Pitch giving: minor chords */
  pgMinor: boolean;
  /** Pitch giving: also wide positions and notes far from a' */
  pgWide: boolean;
  /** Pitch giving: also inversions (otherwise the bass always sings the root) */
  pgInversions: boolean;
  /** Key width of the collapsible keyboard, level 1 (narrow) to 5 (wide) */
  pianoKeySize: PianoKeySize;
  /** Tonsatz: choir or organ setting */
  satzMode: SatzMode;
  /** Tonsatz: show rule violations only when checking, or directly while writing */
  satzCheck: SatzCheckMode;
  /** Tonsatz: theory of the automatic analysis */
  satzAnalysisView: AnalysisView;
  /** Tonsatz: edit the own harmonic analysis in text fields below the score */
  satzAnalysisInput: boolean;
  /** Tonsatz: voice for notes in the bass clef */
  satzLowerVoice: LowerVoiceChoice;
  /** Tonsatz: input with the score or the keyboard */
  satzInput: 'score' | 'keyboard';
}

export type SatzCheckMode = 'end' | 'direct';
export type LowerVoiceChoice = 'auto' | 'tenor' | 'bass';

export type PianoKeySize = 1 | 2 | 3 | 4 | 5;
export const PIANO_KEY_SIZES: PianoKeySize[] = [1, 2, 3, 4, 5];
/** White key width in px per level. */
export const PIANO_KEY_WIDTH: Record<PianoKeySize, number> = { 1: 24, 2: 32, 3: 40, 4: 50, 5: 60 };

export const DEFAULT_SETTINGS: Settings = {
  range: 'medium',
  theme: 'system',
  intervalMode: 'ascending',
  intervalExtended: false,
  intervalNaming: false,
  chordLevel: 2,
  chordNaming: false,
  adaptive: false,
  showStats: true,
  inputMode: 'score',
  autoNextCorrect: false,
  autoNextWrong: false,
  autoNextSeconds: 2,
  voiceType: null,
  singOrder: 'up',
  tuningA4: DEFAULT_A4,
  pgFewAccidentals: true,
  pgManyAccidentals: false,
  pgMajor: true,
  pgMinor: false,
  pgWide: false,
  pgInversions: false,
  pianoKeySize: 3,
  satzMode: 'choir',
  satzCheck: 'end',
  satzAnalysisView: 'function',
  satzAnalysisInput: false,
  satzLowerVoice: 'auto',
  satzInput: 'score',
};

/** Pitch-giving options from the settings. */
export function pitchGivingOptions(s: Settings): PitchGivingOptions {
  return {
    fewAccidentals: s.pgFewAccidentals,
    manyAccidentals: s.pgManyAccidentals,
    major: s.pgMajor,
    minor: s.pgMinor,
    wide: s.pgWide,
    inversions: s.pgInversions,
  };
}

export const RANGES: Record<RangeLevel, { label: string; midi: [number, number]; text: string }> = {
  narrow: { label: 'eng', midi: [60, 72], text: "c'–c''" },
  medium: { label: 'mittel', midi: [55, 79], text: "g–g''" },
  wide: { label: 'weit', midi: [48, 84], text: "c–c'''" },
};

/* ---------- Statistics ---------- */

export interface Counts {
  correct: number;
  wrong: number;
  /** given wrong answer → count */
  confusions?: Record<string, number>;
}

export interface DeviceStats {
  updated: number;
  /** mode → interval ID → counts */
  intervals: Record<string, Record<string, Counts>>;
  /** level ("1" | "2") → chord ID → counts */
  chords: Record<string, Record<string, Counts>>;
  naming: { intervals: Counts; chords: Counts };
  /** Pitch giving: chord type ("major" | "minor") → counts (missing in older data) */
  pitchGiving?: Record<string, Counts>;
}

/** Exercises with a live counter. */
export type ExerciseKind = 'intervals' | 'chords' | 'pitchGiving';

function emptyDeviceStats(): DeviceStats {
  return {
    updated: 0,
    intervals: {},
    chords: {},
    pitchGiving: {},
    naming: { intervals: { correct: 0, wrong: 0 }, chords: { correct: 0, wrong: 0 } },
  };
}

/* ---------- Dictations ---------- */

export interface DictationAttempt {
  id: string;
  dictationId: string;
  date: number;
  mode: InputMode;
  /** Paper mode: self-checked, not counted */
  pitchErrors: number | null;
  rhythmErrors: number | null;
  followErrors: number | null;
  input: DNote[][] | null;
}

export interface DictationProgress {
  dictationId: string;
  updated: number;
  mode: InputMode;
  input: DNote[][];
  position: number;
  introPlayed: boolean;
}

export interface DictationData {
  attempts: DictationAttempt[];
  progress: Record<string, DictationProgress>;
}

/* ---------- Tonsatz ---------- */

export interface SatzAttempt {
  id: string;
  songId: string;
  date: number;
  mode: SatzMode;
  /** Checked in direct mode (own statistics) */
  direct: boolean;
  transposition: Transposition | null;
  /** Alto, tenor, bass in the original key */
  voices: SNote[][];
  analysis: Record<number, string>;
  /** Rule → number of violations */
  violations: Record<string, number>;
  analysisErrors: number;
  analysisLabels: number;
}

export interface SatzProgress {
  songId: string;
  updated: number;
  /** Alto, tenor, bass in the original key */
  voices: SNote[][];
  analysis: Record<number, string>;
}

export interface SatzSongSettings {
  transposition: Transposition | null;
  /** Playback tempo (quarter notes per minute) */
  tempo: number | null;
}

export interface SatzUpload {
  id: string;
  name: string;
  xml: string;
  added: number;
}

export interface SatzDirectStats {
  updated: number;
  /** Rule → how often a violation was shown */
  shown: Record<string, number>;
  /** How often songs were worked on in direct mode */
  sessions: number;
}

export interface SatzData {
  attempts: SatzAttempt[];
  progress: Record<string, SatzProgress>;
  songs: Record<string, SatzSongSettings>;
  uploads: SatzUpload[];
  /** Per device (merged on import by the newer state) */
  direct: Record<string, SatzDirectStats>;
}

export function emptySatz(): SatzData {
  return { attempts: [], progress: {}, songs: {}, uploads: [], direct: {} };
}

/* ---------- Overall state ---------- */

export interface AppData {
  settings: Settings;
  deviceId: string;
  stats: Record<string, DeviceStats>;
  dictations: DictationData;
  satz: SatzData;
  tours: string[];
}

function loadDeviceId(): string {
  let id = readRaw<string | null>('deviceId', null);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    write('deviceId', id);
  }
  return id;
}

function load(): AppData {
  return {
    settings: migrateSettings(read('settings', DEFAULT_SETTINGS)),
    deviceId: loadDeviceId(),
    stats: migrateStats(readRaw('stats', {})),
    dictations: migrateDictations(read<DictationData>('dictations', { attempts: [], progress: {} })),
    satz: migrateSatz(readRaw<Partial<SatzData>>('satz', {})),
    tours: migrateTours(readRaw<string[]>('tours', [])),
  };
}

/**
 * Sets the color scheme on <html> synchronously, before React re-renders,
 * so components that read CSS colors while rendering (VexFlow scores) see
 * the new values immediately.
 */
function applyTheme(theme: ThemeSetting) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

let state: AppData = load();
setA4(state.settings.tuningA4);
applyTheme(state.settings.theme);
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState(): AppData {
  return state;
}

function setState(next: AppData) {
  state = next;
  setA4(state.settings.tuningA4);
  applyTheme(state.settings.theme);
  write('settings', state.settings);
  write('stats', state.stats);
  write('dictations', state.dictations);
  write('satz', state.satz);
  write('tours', state.tours);
  emit();
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useSettings(): Settings {
  return useAppData().settings;
}

export function updateSettings(patch: Partial<Settings>) {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}

function myStats(): DeviceStats {
  return state.stats[state.deviceId] ?? emptyDeviceStats();
}

function bump(c: Counts | undefined, correct: boolean, given?: string): Counts {
  const base: Counts = c ? { ...c, confusions: { ...(c.confusions ?? {}) } } : { correct: 0, wrong: 0, confusions: {} };
  if (correct) base.correct++;
  else {
    base.wrong++;
    if (given) base.confusions![given] = (base.confusions![given] ?? 0) + 1;
  }
  return base;
}

function saveMyStats(s: DeviceStats) {
  setState({ ...state, stats: { ...state.stats, [state.deviceId]: { ...s, updated: Date.now() } } });
}

export function recordInterval(mode: string, intervalId: string, correct: boolean, given?: string) {
  const s = myStats();
  const bucket = { ...(s.intervals[mode] ?? {}) };
  bucket[intervalId] = bump(bucket[intervalId], correct, given);
  saveMyStats({ ...s, intervals: { ...s.intervals, [mode]: bucket } });
}

export function recordChord(level: string, chordId: string, correct: boolean, given?: string) {
  const s = myStats();
  const bucket = { ...(s.chords[level] ?? {}) };
  bucket[chordId] = bump(bucket[chordId], correct, given);
  saveMyStats({ ...s, chords: { ...s.chords, [level]: bucket } });
}

export function recordPitchGiving(chordType: string, correct: boolean) {
  const s = myStats();
  const bucket = { ...(s.pitchGiving ?? {}) };
  bucket[chordType] = bump(bucket[chordType], correct);
  saveMyStats({ ...s, pitchGiving: bucket });
}

export function recordNaming(kind: 'intervals' | 'chords', correct: boolean) {
  const s = myStats();
  saveMyStats({ ...s, naming: { ...s.naming, [kind]: bump(s.naming[kind], correct) } });
}

/** Sum over all devices (including imported data from other devices). */
export function aggregateStats(all: Record<string, DeviceStats>): DeviceStats {
  const out = emptyDeviceStats();
  const add = (target: Record<string, Counts>, src: Record<string, Counts>) => {
    for (const [id, c] of Object.entries(src)) {
      const t = target[id] ?? { correct: 0, wrong: 0, confusions: {} };
      t.correct += c.correct;
      t.wrong += c.wrong;
      t.confusions = { ...(t.confusions ?? {}) };
      for (const [k, v] of Object.entries(c.confusions ?? {})) t.confusions[k] = (t.confusions[k] ?? 0) + v;
      target[id] = t;
    }
  };
  for (const s of Object.values(all)) {
    for (const [mode, b] of Object.entries(s.intervals)) add((out.intervals[mode] ??= {}), b);
    for (const [lvl, b] of Object.entries(s.chords)) add((out.chords[lvl] ??= {}), b);
    add((out.pitchGiving ??= {}), s.pitchGiving ?? {});
    add(out.naming as unknown as Record<string, Counts>, s.naming as unknown as Record<string, Counts>);
  }
  return out;
}

/** All-time counts of an exercise (all modes/levels, all devices; without note naming). */
export function totalCounts(all: Record<string, DeviceStats>, kind: ExerciseKind): { correct: number; wrong: number } {
  const s = aggregateStats(all);
  const buckets =
    kind === 'pitchGiving' ? [s.pitchGiving ?? {}] : Object.values(kind === 'intervals' ? s.intervals : s.chords);
  const out = { correct: 0, wrong: 0 };
  for (const b of buckets)
    for (const c of Object.values(b)) {
      out.correct += c.correct;
      out.wrong += c.wrong;
    }
  return out;
}

/**
 * Counter for the current session: survives page changes and reloads, starts at
 * zero in a new browser tab/session (sessionStorage).
 */
export function useSessionCounter(kind: ExerciseKind) {
  const key = `${PREFIX}session:${kind}`;
  const [counts, setCounts] = useState<{ correct: number; wrong: number }>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const c = raw ? JSON.parse(raw) : null;
      if (c && Number.isFinite(c.correct) && Number.isFinite(c.wrong)) return { correct: c.correct, wrong: c.wrong };
    } catch {
      /* unavailable */
    }
    return { correct: 0, wrong: 0 };
  });
  const add = useCallback(
    (correct: boolean) =>
      setCounts((c) => {
        const next = { correct: c.correct + (correct ? 1 : 0), wrong: c.wrong + (correct ? 0 : 1) };
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* unavailable */
        }
        return next;
      }),
    [key],
  );
  return [counts, add] as const;
}

export function resetStats(kind: 'exercises' | 'dictations' | 'satz' | 'all') {
  if (kind === 'exercises' || kind === 'all') {
    state = { ...state, stats: {} };
  }
  if (kind === 'dictations' || kind === 'all') {
    state = { ...state, dictations: { attempts: [], progress: {} } };
  }
  if (kind === 'satz' || kind === 'all') {
    state = { ...state, satz: { ...state.satz, attempts: [], progress: {}, direct: {} } };
  }
  setState(state);
}

/* ---------- Dictations ---------- */

export function saveProgress(p: DictationProgress) {
  setState({
    ...state,
    dictations: { ...state.dictations, progress: { ...state.dictations.progress, [p.dictationId]: p } },
  });
}

export function clearProgress(dictationId: string) {
  const progress = { ...state.dictations.progress };
  delete progress[dictationId];
  setState({ ...state, dictations: { ...state.dictations, progress } });
}

export function addAttempt(a: DictationAttempt) {
  const progress = { ...state.dictations.progress };
  delete progress[a.dictationId];
  setState({ ...state, dictations: { attempts: [...state.dictations.attempts, a], progress } });
}

export function dictationStatus(data: DictationData, id: string): 'done' | 'started' | 'new' {
  if (data.progress[id]) return 'started';
  if (data.attempts.some((a) => a.dictationId === id)) return 'done';
  return 'new';
}

/* ---------- Tonsatz ---------- */

function setSatz(patch: Partial<SatzData>) {
  setState({ ...state, satz: { ...state.satz, ...patch } });
}

export function saveSatzProgress(p: SatzProgress) {
  setSatz({ progress: { ...state.satz.progress, [p.songId]: p } });
}

export function clearSatzProgress(songId: string) {
  const progress = { ...state.satz.progress };
  delete progress[songId];
  setSatz({ progress });
}

export function addSatzAttempt(a: SatzAttempt) {
  setSatz({ attempts: [...state.satz.attempts, a] });
}

export function updateSatzSong(songId: string, patch: Partial<SatzSongSettings>) {
  const cur = state.satz.songs[songId] ?? { transposition: null, tempo: null };
  setSatz({ songs: { ...state.satz.songs, [songId]: { ...cur, ...patch } } });
}

export function newSatzUploadId(): string {
  return `u-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function addSatzUpload(u: SatzUpload) {
  setSatz({ uploads: [...state.satz.uploads, u] });
}

export function removeSatzUpload(id: string) {
  const progress = { ...state.satz.progress };
  delete progress[id];
  const songs = { ...state.satz.songs };
  delete songs[id];
  setSatz({ uploads: state.satz.uploads.filter((u) => u.id !== id), progress, songs });
}

function myDirect(): SatzDirectStats {
  return state.satz.direct[state.deviceId] ?? { updated: 0, shown: {}, sessions: 0 };
}

/** Direct mode: a violation was shown (counted once per appearance). */
export function recordDirectShown(rules: string[]) {
  if (!rules.length) return;
  const d = myDirect();
  const shown = { ...d.shown };
  for (const r of rules) shown[r] = (shown[r] ?? 0) + 1;
  setSatz({ direct: { ...state.satz.direct, [state.deviceId]: { ...d, shown, updated: Date.now() } } });
}

/** Direct mode: a song was worked on. */
export function recordDirectSession() {
  const d = myDirect();
  setSatz({ direct: { ...state.satz.direct, [state.deviceId]: { ...d, sessions: d.sessions + 1, updated: Date.now() } } });
}

export function satzStatus(data: SatzData, id: string): 'done' | 'started' | 'new' {
  if (data.attempts.some((a) => a.songId === id)) return 'done';
  if (data.progress[id]) return 'started';
  return 'new';
}

/** Statistics of the first (non-direct) check of each song. */
export function satzFirstChecks(data: SatzData): SatzAttempt[] {
  const seen = new Set<string>();
  const out: SatzAttempt[] = [];
  for (const a of [...data.attempts].sort((x, y) => x.date - y.date)) {
    if (a.direct || seen.has(a.songId)) continue;
    seen.add(a.songId);
    out.push(a);
  }
  return out;
}

/* ---------- Pitch giving: last open exercise ---------- */

/** The chord last open in the pitch-giving exercise, so it is still there after switching pages. */
export interface PitchGivingCurrent<Task = unknown, Result = unknown> {
  /** Options the task was made with (JSON); a different value means the task no longer fits */
  optionsKey: string;
  task: Task;
  results: Result[];
  pos: number;
}

export function loadPitchGivingCurrent<Task, Result>(): PitchGivingCurrent<Task, Result> | null {
  return readRaw<PitchGivingCurrent<Task, Result> | null>('pitchGivingCurrent', null);
}

export function savePitchGivingCurrent(current: PitchGivingCurrent) {
  write('pitchGivingCurrent', current);
}

/* ---------- Tours ---------- */

export function markTourSeen(id: string) {
  if (state.tours.includes(id)) return;
  setState({ ...state, tours: [...state.tours, id] });
}

/* ---------- Export / Import ---------- */

export interface ExportFile {
  app: 'harmonio';
  version: 1;
  exported: string;
  settings: Settings;
  stats: Record<string, DeviceStats>;
  dictations: DictationData;
  /** Missing in files of older versions */
  satz?: SatzData;
  tours: string[];
}

export function exportData(): ExportFile {
  return {
    app: 'harmonio',
    version: 1,
    exported: new Date().toISOString(),
    settings: state.settings,
    stats: state.stats,
    dictations: state.dictations,
    satz: state.satz,
    tours: state.tours,
  };
}

/**
 * Merges imported data with the existing data:
 * - Settings: the imported ones win
 * - Statistics: per device the newer state (so nothing is counted twice)
 * - Dictation attempts: union (by ID)
 * - Started dictations: the newer state
 * - Seen tours: union
 */
export function mergeData(current: Omit<AppData, 'deviceId'>, incoming: ExportFile): Omit<AppData, 'deviceId'> {
  const stats = { ...current.stats };
  for (const [dev, s] of Object.entries(incoming.stats ?? {})) {
    if (!stats[dev] || (s.updated ?? 0) > (stats[dev].updated ?? 0)) stats[dev] = s;
  }
  const attemptIds = new Set(current.dictations.attempts.map((a) => a.id));
  const attempts = [
    ...current.dictations.attempts,
    ...(incoming.dictations?.attempts ?? []).filter((a) => !attemptIds.has(a.id)),
  ].sort((a, b) => a.date - b.date);
  const progress = { ...current.dictations.progress };
  for (const [id, p] of Object.entries(incoming.dictations?.progress ?? {})) {
    if (!progress[id] || p.updated > progress[id].updated) progress[id] = p;
  }
  // Do not restore started dictations that have been checked since
  for (const id of Object.keys(progress)) {
    const lastAttempt = attempts.filter((a) => a.dictationId === id).pop();
    if (lastAttempt && lastAttempt.date > progress[id].updated) delete progress[id];
  }
  const settings = { ...DEFAULT_SETTINGS, ...current.settings, ...(incoming.settings ?? {}) };
  // Do not overwrite a detected voice type with "not set"
  settings.voiceType ??= current.settings.voiceType ?? null;
  return {
    settings,
    stats,
    dictations: { attempts, progress },
    satz: mergeSatz(current.satz, incoming.satz ?? emptySatz()),
    tours: Array.from(new Set([...current.tours, ...(incoming.tours ?? [])])),
  };
}

function mergeSatz(cur: SatzData, inc: SatzData): SatzData {
  const ids = new Set(cur.attempts.map((a) => a.id));
  const attempts = [...cur.attempts, ...inc.attempts.filter((a) => !ids.has(a.id))].sort((a, b) => a.date - b.date);
  const progress = { ...cur.progress };
  for (const [id, p] of Object.entries(inc.progress)) {
    if (!progress[id] || p.updated > progress[id].updated) progress[id] = p;
  }
  const uploadIds = new Set(cur.uploads.map((u) => u.id));
  const direct = { ...cur.direct };
  for (const [dev, d] of Object.entries(inc.direct)) {
    if (!direct[dev] || d.updated > direct[dev].updated) direct[dev] = d;
  }
  return {
    attempts,
    progress,
    songs: { ...cur.songs, ...inc.songs },
    uploads: [...cur.uploads, ...inc.uploads.filter((u) => !uploadIds.has(u.id))],
    direct,
  };
}

/** Brings an export file (possibly from an older version) up to date. */
export function migrateExport(file: ExportFile): ExportFile {
  return {
    ...file,
    settings: migrateSettings(file.settings ?? {}),
    stats: migrateStats(file.stats ?? {}),
    dictations: migrateDictations(file.dictations ?? { attempts: [], progress: {} }),
    satz: migrateSatz(file.satz ?? {}),
    tours: migrateTours(file.tours ?? []),
  };
}

export function importData(incoming: ExportFile) {
  if (incoming?.app !== 'harmonio') throw new Error('Die Datei stammt nicht von Harmonio.');
  const merged = mergeData(state, migrateExport(incoming));
  setState({ ...state, ...merged });
}
