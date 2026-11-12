import { useRef, useState } from 'react';
import BetaBadge from '../components/BetaBadge';
import { DEFAULT_A4, MAX_A4, MIN_A4 } from '../audio/tuning';
import { SING_ORDERS, VOICE_LABEL } from '../music/pitchGiving';
import { PIANO_KEY_SIZES, RANGES, RangeLevel, ThemeSetting, exportData, importData, updateSettings, useSettings } from '../storage/store';

async function shareOrDownload(): Promise<string> {
  const json = JSON.stringify(exportData(), null, 2);
  const name = `harmonio-daten-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  if (mobile && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Harmonio-Daten' });
      return 'Datei geteilt.';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return '';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'Datei heruntergeladen.';
}

export default function SettingsPage() {
  const settings = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Draft value of the input field, so it may be empty while typing
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const [a4Draft, setA4Draft] = useState<string | null>(null);

  return (
    <div className="stack">
      <h1>Einstellungen</h1>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Tonumfang (Schwierigkeit)</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Gilt für die Intervalle. Akkorde nutzen immer den Tonumfang des Chorsatzes.
        </p>
        <div className="segmented" role="group" aria-label="Tonumfang">
          {(Object.keys(RANGES) as RangeLevel[]).map((r) => (
            <button key={r} aria-pressed={settings.range === r} onClick={() => updateSettings({ range: r })}>
              {RANGES[r].label} ({RANGES[r].text})
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Stimmton</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Frequenz des Kammertons a′ ({MIN_A4}–{MAX_A4} Hz). Gilt für alle Klänge und für die Auswertung beim Singen.
        </p>
        <label className="row" style={{ gap: 6 }}>
          a′ =
          <input
            type="number"
            min={MIN_A4}
            max={MAX_A4}
            step={1}
            value={a4Draft ?? settings.tuningA4}
            onChange={(e) => {
              setA4Draft(e.target.value);
              const v = Math.round(Number(e.target.value));
              if (e.target.value !== '' && v >= MIN_A4 && v <= MAX_A4) updateSettings({ tuningA4: v });
            }}
            onBlur={() => setA4Draft(null)}
            style={{ width: '5em' }}
          />
          Hz
          <button onClick={() => updateSettings({ tuningA4: DEFAULT_A4 })} disabled={settings.tuningA4 === DEFAULT_A4}>
            Standard ({DEFAULT_A4} Hz)
          </button>
        </label>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Darstellung</h2>
        <div className="segmented" role="group" aria-label="Farbschema">
          {(
            [
              ['system', 'System'],
              ['light', 'hell'],
              ['dark', 'dunkel'],
            ] as [ThemeSetting, string][]
          ).map(([t, label]) => (
            <button key={t} aria-pressed={settings.theme === t} onClick={() => updateSettings({ theme: t })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Klavier (🎹 unten rechts)</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Breite der Tasten: Stufe 1 ist am schmalsten (mehr Tasten sichtbar), Stufe 5 am breitesten (leichter zu treffen).
        </p>
        <div className="segmented" role="group" aria-label="Tastenbreite">
          {PIANO_KEY_SIZES.map((n) => (
            <button key={n} aria-pressed={settings.pianoKeySize === n} onClick={() => updateSettings({ pianoKeySize: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Übungen</h2>
        <label className="toggle" style={{ display: 'flex' }}>
          <input type="checkbox" checked={settings.adaptive} onChange={(e) => updateSettings({ adaptive: e.target.checked })} />
          Adaptive Aufgabenauswahl (häufig falsch Beantwortetes kommt öfter dran)
        </label>
        <label className="toggle" style={{ display: 'flex' }}>
          <input type="checkbox" checked={settings.showStats} onChange={(e) => updateSettings({ showStats: e.target.checked })} />
          Statistik während der Übung anzeigen
        </label>
        <label className="toggle" style={{ display: 'flex' }}>
          <input
            type="checkbox"
            checked={settings.autoNextCorrect}
            onChange={(e) => updateSettings({ autoNextCorrect: e.target.checked })}
          />
          Nach richtiger Antwort automatisch weiter
        </label>
        <label className="toggle" style={{ display: 'flex' }}>
          <input
            type="checkbox"
            checked={settings.autoNextWrong}
            onChange={(e) => updateSettings({ autoNextWrong: e.target.checked })}
          />
          Nach falscher Antwort automatisch weiter
        </label>
        <label className="row" style={{ gap: 6 }}>
          Wartezeit:
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            value={secondsDraft ?? settings.autoNextSeconds}
            disabled={!settings.autoNextCorrect && !settings.autoNextWrong}
            onChange={(e) => {
              setSecondsDraft(e.target.value);
              const v = Math.round(Number(e.target.value));
              if (e.target.value !== '' && v >= 1 && v <= 30) updateSettings({ autoNextSeconds: v });
            }}
            onBlur={() => setSecondsDraft(null)}
            style={{ width: '4em' }}
          />
          Sekunden
        </label>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Stimmlage (Tonangabe) <BetaBadge /></h2>
        <p className="muted small" style={{ margin: 0 }}>
          Bestimmt, in welcher Oktave du die Töne singst: Männer singen Sopran und Alt eine Oktave tiefer, Frauen Tenor
          und Bass eine Oktave höher. „Neu erkennen“ startet beim nächsten Öffnen der Tonangabe die Erkennung per Mikrofon.
        </p>
        <div className="row">
          <div className="segmented" role="group" aria-label="Stimmlage">
            {(['male', 'female'] as const).map((v) => (
              <button key={v} aria-pressed={settings.voiceType === v} onClick={() => updateSettings({ voiceType: v })}>
                {VOICE_LABEL[v]}
              </button>
            ))}
          </div>
          <button onClick={() => updateSettings({ voiceType: null })} disabled={settings.voiceType === null}>
            Neu erkennen
          </button>
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Reihenfolge der Töne (Tonangabe) <BetaBadge /></h2>
        <p className="muted small" style={{ margin: 0 }}>
          In welcher Reihenfolge du die vier Töne singst. Nach Funktion kommen zuerst beide Grundtöne (der tiefere
          zuerst), dann Quinte und Terz.
        </p>
        <div className="segmented" role="group" aria-label="Reihenfolge der Töne">
          {SING_ORDERS.map((o) => (
            <button
              key={o.id}
              aria-pressed={settings.singOrder === o.id}
              title={`Singen ${o.text}`}
              onClick={() => updateSettings({ singOrder: o.id })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2 style={{ marginTop: 0 }}>Daten exportieren und importieren</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Alle Daten (Einstellungen, Statistik, Diktate) werden nur in diesem Browser gespeichert. Mit einer Datei kannst
          du sie sichern oder auf ein anderes Gerät übertragen. Beim Import werden die Daten zusammengeführt.
        </p>
        <div className="row">
          <button onClick={() => shareOrDownload().then((m) => m && setMsg(m))}>Exportieren</button>
          <button onClick={() => fileRef.current?.click()}>Importieren</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                importData(JSON.parse(await f.text()));
                setMsg('Daten importiert.');
              } catch (err) {
                setMsg(`Import fehlgeschlagen: ${(err as Error).message}`);
              }
            }}
          />
        </div>
        {msg && (
          <div className="feedback info" role="status">
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
