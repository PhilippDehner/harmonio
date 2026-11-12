import { getState } from '../storage/store';
import { Song } from './model';
import { parseSongXml } from './musicxml';

/**
 * All MusicXML files in the /tonsatz folder (subfolders allowed, without
 * meaning) are collected at build time. Title, key and time signature are read
 * from the file.
 */
const files = import.meta.glob('/tonsatz/**/*.{musicxml,xml}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface SongEntry {
  id: string;
  title: string;
  uploaded: boolean;
  hasSolution: boolean;
}

function idFromPath(path: string): string {
  return (
    'b-' +
    path
      .replace(/^\/tonsatz\//, '')
      .replace(/\.(musicxml|xml)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

const builtin: Song[] = (() => {
  const out: Song[] = [];
  for (const path of Object.keys(files).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))) {
    const name = path.split('/').pop()!.replace(/\.(musicxml|xml)$/i, '');
    try {
      out.push(parseSongXml(files[path], idFromPath(path), name));
    } catch (e) {
      console.warn(`Tonsatz-Datei ${path} übersprungen:`, e);
    }
  }
  return out;
})();

function uploadedSongs(): Song[] {
  const out: Song[] = [];
  for (const u of getState().satz.uploads) {
    try {
      out.push({ ...parseSongXml(u.xml, u.id, u.name), uploaded: true });
    } catch {
      /* invalid upload: ignore */
    }
  }
  return out;
}

export function allSongs(): Song[] {
  return [...builtin, ...uploadedSongs()];
}

export function songEntries(): SongEntry[] {
  return allSongs().map((s) => ({ id: s.id, title: s.title, uploaded: !!s.uploaded, hasSolution: !!s.solution }));
}

export function findSong(id: string): Song | null {
  return allSongs().find((s) => s.id === id) ?? null;
}

/** Random pick: prefers songs not done yet; if all are done, picks from all. */
export function pickRandomSong(done: Set<string>, rng: () => number = Math.random): SongEntry | null {
  const all = songEntries();
  if (all.length === 0) return null;
  const open = all.filter((e) => !done.has(e.id));
  const pool = open.length > 0 ? open : all;
  return pool[Math.floor(rng() * pool.length)];
}
