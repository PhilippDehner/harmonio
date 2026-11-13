# Harmonio

Webseite für Gehörbildungstraining mit Intervall-, Akkord- und Diktatübungen. Oberfläche und Notennamen auf Deutsch (H und B). Zielgruppe sind Teilnehmende der kirchenmusikalischen C-Ausbildung.

## Funktionen

- **Intervalle**: zufällige Intervalle (kleine Sekunde bis Oktave, optional bis zur Doppeloktave), gleichzeitig, aufwärts oder abwärts; optional Tonbenennung mit enharmonisch korrekter Schreibweise
- **Akkorde**: vierstimmig im Chorsatz-Umfang, Dur/Moll/vermindert/übermäßig, optional mit Umkehrung und Tonbenennung
- **Tonangabe** (Beta): vierstimmiger Dur-/Moll-Akkord (mit Umkehrungen) im Notenbild, dazu nur das A (440 Hz); die vier Töne werden von unten nach oben nachgesungen und per Mikrofon ausgewertet (richtig/falsch, bei richtigen Tönen die Abweichung in Cent; Toleranz ±50 Cent, Oktave egal). Die Stimmlage (Männer-/Frauenstimme) wird beim ersten Mal über das nachgesungene A erkannt, bestätigt und in den Einstellungen gespeichert
- **Diktate**: einstimmig, zweistimmig und vierstimmiger Satz aus einer MusicXML-Sammlung; Eingabe auf Papier, per Bildschirm-Klaviatur oder im Notenblatt; Auswertung mit Fehlern, Folgefehlern und Rhythmusfehlern
- **Tonsatz** (Alpha, frühe Testversion): zu einer vorgegebenen Dur-Melodie Alt, Tenor und Bass als Chor- oder Orgelsatz schreiben (Notenblatt oder Bildschirm-Klaviatur, Haltebögen, Pausen, Rückgängig/Wiederholen). Automatische Regelprüfung mit Markierung im Notenbild, wahlweise am Ende oder direkt während der Eingabe; Regelseite mit falschen und richtigen Hörbeispielen; optionale Harmonieanalyse (Funktionen oder Stufen), die mitgeprüft wird; Beispiellösungen mit automatischer Analyse; Transposition, Wiedergabe mit stummschaltbaren Stimmen und einstellbarem Tempo; eigene Melodien hochladen; Export als MusicXML und PDF (über den Druckdialog)
- Statistik (pro Intervall/Akkord, Verwechslungen, Diktatversuche), Export/Import, adaptive Aufgabenauswahl
- Light/Dark Mode, responsiv, als PWA installierbar und offline nutzbar
- Guided Tour pro Übung

## Entwicklung

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Technik: React, Vite, TypeScript, Tone.js (Klang), VexFlow (Notensatz), vite-plugin-pwa, Vitest.

## Diktate hinzufügen

MusicXML-Dateien (`.musicxml` oder `.xml`) in den passenden Ordner legen:

- `dictations/monophonic/`
- `dictations/two-part/`
- `dictations/four-part/` (Typ A und Typ B gemeinsam)

Die Liste wird beim Build automatisch erzeugt. Die Nummer des Diktats ergibt sich aus der ersten Zahl im Dateinamen (z. B. `07.musicxml` → Diktat 7).

Unterstützter Umfang: ganze, halbe, Viertel- und Achtelnoten, jeweils punktiert und als Triolen; keine Pausen und Haltebögen. Ein Auftakt wird erkannt, wenn der erste Takt kürzer ist. Mehrstimmiges darf als mehrere Stimmen (`<voice>`), mehrere Systeme (`<staff>`) oder mehrere Parts vorliegen; Akkorde werden nach Tonhöhe auf Stimmen verteilt. Beim vierstimmigen Satz sind die Oberstimmen im oberen System als Akkord (ganze Noten) und der Bass im unteren System notiert. Das Tempo wird aus `<sound tempo>` bzw. `<metronome>` gelesen, sonst gilt 80 Viertel pro Minute.

Die mitgelieferten Diktate sind einfache Beispiele zum Testen.

## Tonsatz-Melodien hinzufügen

MusicXML-Dateien (`.musicxml` oder `.xml`) in den Ordner `tonsatz/` legen; Unterordner sind möglich, haben aber keine Bedeutung. Titel (`work-title` bzw. `movement-title`), Tonart, Taktart, Tempo und Liedtext (erste Strophe) werden aus der Datei gelesen.

- Nur Dur (`<mode>minor</mode>` wird abgelehnt).
- Die Datei enthält entweder nur die Melodie oder einen vollständigen vierstimmigen Satz. Ein vollständiger Satz wird nach dem Prüfen als Beispiellösung angezeigt und ebenfalls nach den Regeln geprüft.
- Unterstützt: ganze bis Achtelnoten, punktiert, Triolen, Pausen, Haltebögen, Fermaten.
- Nur gemeinfreie Melodien verwenden und jede einzeln prüfen.

Die mitgelieferten Übungsmelodien und ihre Sätze sind selbst geschrieben (keine überlieferten Choräle) und dienen zum Testen. Ein Test stellt sicher, dass alle mitgelieferten Beispiellösungen regelkonform sind.

Regeln und Regelbeispiele: `src/satz/rules.ts` (Prüfung) und `src/satz/ruleInfo.ts` (Erklärungen und Beispiele, ebenfalls durch Tests abgesichert).

## Neue Version

Version in `package.json` erhöhen. Bringt das Release neue Features, oben in `src/changelog.ts` einen Eintrag ergänzen – nur neue Features (auf Deutsch), keine Korrekturen oder kleinen Anpassungen. Nutzer sehen die Neuigkeiten beim nächsten Öffnen; beim Öffnen werden höchstens die letzten 3 Releases angezeigt. Über „Neuigkeiten“ im Fußbereich ist der ganze Verlauf abrufbar.

## Deployment

GitHub Actions führt bei jedem Push Typprüfung, Tests und Build aus. Bei Pushes auf `main` wird nach bestandenen Tests auf GitHub Pages veröffentlicht. Dazu einmalig in den Repository-Einstellungen unter *Pages* als Quelle „GitHub Actions“ wählen.

## Credits und Lizenz

- Klavier-Samples: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) von Alexander Holm, Lizenz [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Die MP3-Fassung stammt aus [Tone.js audio](https://github.com/Tonejs/audio/tree/master/salamander) (ins MP3-Format umgewandelt). Lizenztext und Angaben: `public/samples/salamander/LICENSE.txt` und `README.txt`
- Code und Diktate: MIT-Lizenz (gilt nicht für die Klavier-Samples), siehe [LICENSE](LICENSE)
