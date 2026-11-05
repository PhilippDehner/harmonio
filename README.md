# Harmonio

Webseite für Gehörbildungstraining mit Intervall-, Akkord- und Diktatübungen. Oberfläche und Notennamen auf Deutsch (H und B). Zielgruppe sind Teilnehmende der kirchenmusikalischen C-Ausbildung.

## Funktionen

- **Intervalle**: zufällige Intervalle (kleine Sekunde bis Oktave, optional bis zur Doppeloktave), gleichzeitig, aufwärts oder abwärts; optional Tonbenennung mit enharmonisch korrekter Schreibweise
- **Akkorde**: vierstimmig im Chorsatz-Umfang, Dur/Moll/vermindert/übermäßig, optional mit Umkehrung und Tonbenennung
- **Diktate**: einstimmig, zweistimmig und vierstimmiger Satz aus einer MusicXML-Sammlung; Eingabe auf Papier, per Bildschirm-Klaviatur oder im Notenblatt; Auswertung mit Fehlern, Folgefehlern und Rhythmusfehlern
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

- `diktate/einstimmig/`
- `diktate/zweistimmig/`
- `diktate/vierstimmig/` (Typ A und Typ B gemeinsam)

Die Liste wird beim Build automatisch erzeugt. Die Nummer des Diktats ergibt sich aus der ersten Zahl im Dateinamen (z. B. `07.musicxml` → Diktat 7).

Unterstützter Umfang: ganze, halbe, Viertel- und Achtelnoten, jeweils punktiert und als Triolen; keine Pausen und Haltebögen. Ein Auftakt wird erkannt, wenn der erste Takt kürzer ist. Mehrstimmiges darf als mehrere Stimmen (`<voice>`), mehrere Systeme (`<staff>`) oder mehrere Parts vorliegen; Akkorde werden nach Tonhöhe auf Stimmen verteilt. Beim vierstimmigen Satz sind die Oberstimmen im oberen System als Akkord (ganze Noten) und der Bass im unteren System notiert. Das Tempo wird aus `<sound tempo>` bzw. `<metronome>` gelesen, sonst gilt 80 Viertel pro Minute.

Die mitgelieferten Diktate sind einfache Beispiele zum Testen.

## Deployment

GitHub Actions führt bei jedem Push Typprüfung, Tests und Build aus. Bei Pushes auf `main` wird nach bestandenen Tests auf GitHub Pages veröffentlicht. Dazu einmalig in den Repository-Einstellungen unter *Pages* als Quelle „GitHub Actions“ wählen.

## Credits und Lizenz

- Klavier-Samples: Salamander Grand Piano von Alexander Holm, Lizenz CC BY 3.0 (bezogen über [Tone.js audio](https://github.com/Tonejs/audio))
- Code und Diktate: MIT-Lizenz, siehe [LICENSE](LICENSE)
