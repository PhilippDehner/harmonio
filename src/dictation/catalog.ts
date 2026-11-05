import { Dictation, DictationKind } from './model';
import { parseMusicXml } from './musicxml';

/**
 * Alle MusicXML-Dateien im Ordner /diktate werden beim Build automatisch
 * erfasst. Neue Diktate einfach in den passenden Unterordner legen
 * (einstimmig, zweistimmig, vierstimmig); die Nummer ergibt sich aus der
 * ersten Zahl im Dateinamen, sonst aus der Reihenfolge.
 */
const files = import.meta.glob('/diktate/**/*.{musicxml,xml}', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

export const KINDS: DictationKind[] = ['einstimmig', 'zweistimmig', 'vierstimmig'];

export interface CatalogEntry {
  id: string;
  kind: DictationKind;
  number: number;
  path: string;
}

function buildCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const kind of KINDS) {
    const paths = Object.keys(files)
      .filter((p) => p.startsWith(`/diktate/${kind}/`))
      .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    paths.forEach((path, i) => {
      const name = path.split('/').pop()!;
      const match = name.match(/\d+/);
      const number = match ? Number(match[0]) : i + 1;
      entries.push({ id: `${kind}-${number}`, kind, number, path });
    });
  }
  return entries;
}

export const CATALOG: CatalogEntry[] = buildCatalog();

export function entriesOf(kind: DictationKind): CatalogEntry[] {
  return CATALOG.filter((e) => e.kind === kind).sort((a, b) => a.number - b.number);
}

const cache = new Map<string, Dictation>();

export async function loadDictation(id: string): Promise<Dictation> {
  const cached = cache.get(id);
  if (cached) return cached;
  const entry = CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error('Diktat nicht gefunden');
  const xml = await files[entry.path]();
  const d = parseMusicXml(xml, { id: entry.id, kind: entry.kind, number: entry.number });
  cache.set(id, d);
  return d;
}

/** Zufallsauswahl: bevorzugt noch nicht gemachte Diktate; sind alle erledigt, aus allen. */
export function pickRandom(kind: DictationKind, done: Set<string>, rng: () => number = Math.random): CatalogEntry | null {
  const all = entriesOf(kind);
  if (all.length === 0) return null;
  const open = all.filter((e) => !done.has(e.id));
  const pool = open.length > 0 ? open : all;
  return pool[Math.floor(rng() * pool.length)];
}
