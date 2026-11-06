import { useSyncExternalStore } from 'react';
import type { DNote } from '../dictation/model';
import type { IntervalPlayMode } from '../music/tasks';
import type { VoiceType } from '../audio/pitchDetect';
import { migrateDictations, migrateSettings, migrateStats, migrateTours } from './migrate';

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
}

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
};

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
}

function emptyDeviceStats(): DeviceStats {
  return {
    updated: 0,
    intervals: {},
    chords: {},
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

/* ---------- Overall state ---------- */

export interface AppData {
  settings: Settings;
  deviceId: string;
  stats: Record<string, DeviceStats>;
  dictations: DictationData;
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
    tours: migrateTours(readRaw<string[]>('tours', [])),
  };
}

let state: AppData = load();
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
  write('settings', state.settings);
  write('stats', state.stats);
  write('dictations', state.dictations);
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
    add(out.naming as unknown as Record<string, Counts>, s.naming as unknown as Record<string, Counts>);
  }
  return out;
}

export function resetStats(kind: 'exercises' | 'dictations' | 'all') {
  if (kind === 'exercises' || kind === 'all') {
    state = { ...state, stats: {} };
  }
  if (kind === 'dictations' || kind === 'all') {
    state = { ...state, dictations: { attempts: [], progress: {} } };
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
    tours: Array.from(new Set([...current.tours, ...(incoming.tours ?? [])])),
  };
}

/** Brings an export file (possibly from an older version) up to date. */
export function migrateExport(file: ExportFile): ExportFile {
  return {
    ...file,
    settings: migrateSettings(file.settings ?? {}),
    stats: migrateStats(file.stats ?? {}),
    dictations: migrateDictations(file.dictations ?? { attempts: [], progress: {} }),
    tours: migrateTours(file.tours ?? []),
  };
}

export function importData(incoming: ExportFile) {
  if (incoming?.app !== 'harmonio') throw new Error('Die Datei stammt nicht von Harmonio.');
  const merged = mergeData(state, migrateExport(incoming));
  setState({ ...state, ...merged });
}
