/**
 * User-facing changelog (German, shown in the app). Newest version first.
 * Add an entry here whenever the version in package.json is raised.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.0',
    date: '2026-11-06',
    changes: [
      'Neu: Stimmton in den Einstellungen wählbar (a′ = 410–450 Hz, Standard 440 Hz). Gilt für alle Klänge und für die Auswertung in der Tonangabe.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-06',
    changes: [
      'Neu: Tonangabe für den vierstimmigen gemischten Chor. Akkord lesen, vom A (440 Hz) aus die vier Töne finden und nachsingen; Auswertung per Mikrofon mit Abweichung in Cent.',
      'Tonangabe: Falsch gesungene Töne lassen sich einzeln oder als Akkord am Klavier anhören und werden als Notenbild angezeigt.',
      'Die Stimmlage (Männer- oder Frauenstimme) wird beim ersten Mal über das nachgesungene A erkannt und in den Einstellungen gespeichert.',
      'Startseite: Auswahl zwischen Gehörbildung und Tonangabe.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-06',
    changes: [
      'Neuigkeiten: Nach einem Update zeigt Harmonio beim Öffnen, was sich geändert hat.',
      'Versionsnummer im Fußbereich der Seite.',
      'Die Adressen der Seiten haben sich geändert. Alte Lesezeichen auf einzelne Übungen bitte neu setzen.',
      'Diktat-Editor: Rückgängig (Strg+Z) mit mehrstufigem Verlauf.',
      'Diktat-Editor: Tastenkürzel für Tonhöhe, Vorzeichen, Notenwert und Bearbeiten.',
      'Diktat-Editor: Pausen füllen Lücken, Notendauer nachträglich änderbar.',
      'Intervalle und Akkorde: Lösung wird als Notenbild angezeigt, falsche Antwort lässt sich anhören.',
      'Automatisch weiter nach richtiger oder falscher Antwort (in den Einstellungen).',
      'Akkorde: Typ und Umkehrung als Standard-Stufe.',
      'Kadenz vor dem Diktat schneller und mit festen Lagen.',
      'Zweistimmiges Diktat: Oberstimme tiefer.',
      'Startseite: Notenbeispiele auf den Übungskacheln.',
      'Kleinere Korrekturen, u. a. Ziffernblock unabhängig von NumLock und keine Schnellsuche mehr in Firefox.',
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

/** Entries newer than `lastSeen` (all entries if `lastSeen` is null). */
export function changesSince(lastSeen: string | null): ChangelogEntry[] {
  return CHANGELOG.filter((e) => lastSeen === null || compareVersions(e.version, lastSeen) > 0);
}
