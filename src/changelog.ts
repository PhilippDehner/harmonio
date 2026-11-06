/**
 * User-facing changelog (German, shown in the app). Newest version first.
 * Lists new features only (no fixes or small adjustments). Add an entry when a
 * release brings new features; releases without new features get no entry.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.0',
    date: '2026-11-06',
    changes: [
      'Tonangabe: Neue Einstellung „Bass“ – ohne Haken singt der Bass immer den Grundton (Standard), mit „auch Umkehrungen“ auch Terz oder Quinte.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-06',
    changes: [
      'Tonangabe: Schwierigkeit wählbar – Tonarten mit wenigen (bis 3) oder vielen Vorzeichen, Dur und/oder Moll, nur enge Lagen in mittlerer Höhe oder auch weite Lagen mit Tönen weit weg vom A. Standard: Dur, wenige Vorzeichen, enge Lagen.',
      'Tonangabe: „Neue Übung“ (Taste N) gibt nach einer Rückfrage jederzeit einen anderen Akkord, ohne dass er in der Statistik zählt.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-06',
    changes: [
      'Neu: Stimmton in den Einstellungen wählbar (a′ = 410–450 Hz, Standard 440 Hz). Gilt für alle Klänge und für die Auswertung in der Tonangabe.',
      'Tonangabe: Reihenfolge der Töne wählbar – von unten nach oben, von oben nach unten oder nach Funktion (Grundton, Quinte, Terz), auch in den Einstellungen.',
      'Tonangabe: Mikrofon lässt sich wieder ausschalten, z. B. um dir selbst Töne vorzusingen.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-06',
    changes: [
      'Neu: Tonangabe für den vierstimmigen gemischten Chor. Akkord lesen, vom A (440 Hz) aus die vier Töne finden und nachsingen; Auswertung per Mikrofon mit Abweichung in Cent.',
      'Tonangabe: Falsch gesungene Töne lassen sich einzeln oder als Akkord am Klavier anhören und werden als Notenbild angezeigt.',
      'Die Stimmlage (Männer- oder Frauenstimme) wird beim ersten Mal über das nachgesungene A erkannt und in den Einstellungen gespeichert.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-06',
    changes: [
      'Neuigkeiten: Nach einem Update zeigt Harmonio beim Öffnen, was sich geändert hat.',
      'Diktat-Editor: Rückgängig (Strg+Z) mit mehrstufigem Verlauf.',
      'Diktat-Editor: Tastenkürzel für Tonhöhe, Vorzeichen, Notenwert und Bearbeiten.',
      'Diktat-Editor: Pausen füllen Lücken, Notendauer nachträglich änderbar.',
      'Intervalle und Akkorde: Lösung wird als Notenbild angezeigt, falsche Antwort lässt sich anhören.',
      'Automatisch weiter nach richtiger oder falscher Antwort (in den Einstellungen).',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-05',
    changes: ['Erste Version: Intervalle, Akkorde und Diktate.'],
  },
];

/** Compares two "x.y.z" versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Maximum number of releases shown on startup after an update. */
export const MAX_SHOWN_RELEASES = 3;

/** Newest entries newer than `lastSeen` (all if `lastSeen` is null), at most MAX_SHOWN_RELEASES. */
export function changesSince(lastSeen: string | null): ChangelogEntry[] {
  return CHANGELOG.filter((e) => lastSeen === null || compareVersions(e.version, lastSeen) > 0).slice(
    0,
    MAX_SHOWN_RELEASES,
  );
}
