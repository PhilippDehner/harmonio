import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BetaBadge from '../components/BetaBadge';
import { pickRandomSong, songEntries } from '../satz/catalog';
import { MODE_LABELS, SatzMode } from '../satz/model';
import { SongFormatError, parseSongXml } from '../satz/musicxml';
import { addSatzUpload, newSatzUploadId, removeSatzUpload, satzStatus, updateSettings, useAppData } from '../storage/store';

export default function SatzListPage() {
  const data = useAppData();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Re-read the list when uploads change
  void data.satz.uploads;
  const entries = songEntries();
  const done = new Set(data.satz.attempts.map((a) => a.songId));
  const mode = data.settings.satzMode;

  async function upload(file: File) {
    const xml = await file.text();
    const id = newSatzUploadId();
    try {
      const song = parseSongXml(xml, id, file.name.replace(/\.(musicxml|xml)$/i, ''));
      addSatzUpload({ id, name: song.title, xml, added: Date.now() });
      setMsg({ text: `„${song.title}“ wurde hinzugefügt${song.solution ? ' (mit Beispiellösung)' : ''}.`, ok: true });
    } catch (e) {
      const text = e instanceof SongFormatError ? e.message : 'Die Datei konnte nicht gelesen werden.';
      setMsg({ text: `Abgelehnt: ${text}`, ok: false });
    }
  }

  return (
    <div className="stack">
      <h1>
        Tonsatz
        <BetaBadge />
      </h1>
      <p>
        Zu einer vorgegebenen Melodie schreibst du Alt, Tenor und Bass – als Chor- oder Orgelsatz. Harmonio prüft den Satz
        nach den Regeln des Tonsatzes und zeigt Fehler im Notenbild.
      </p>
      <p className="muted small">
        Der Tonsatz ist noch in Erprobung. Die automatische Erkennung von Harmonien, akkordfremden Tönen und Modulationen
        kann in Einzelfällen anders deuten als eine Lehrkraft.
      </p>

      <div className="card stack">
        <div className="toolbar">
          <span>Satzart:</span>
          <div className="segmented" role="group" aria-label="Satzart">
            {(['choir', 'organ'] as SatzMode[]).map((m) => (
              <button key={m} aria-pressed={mode === m} onClick={() => updateSettings({ satzMode: m })}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <span>Fehler anzeigen:</span>
          <div className="segmented" role="group" aria-label="Prüfung">
            <button aria-pressed={data.settings.satzCheck === 'end'} onClick={() => updateSettings({ satzCheck: 'end' })}>
              beim Prüfen
            </button>
            <button aria-pressed={data.settings.satzCheck === 'direct'} onClick={() => updateSettings({ satzCheck: 'direct' })}>
              direkt
            </button>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Beides lässt sich auch während der Bearbeitung umschalten.
        </p>
      </div>

      <div className="row">
        <button
          className="primary"
          disabled={entries.length === 0}
          onClick={() => {
            const e = pickRandomSong(done);
            if (e) navigate(`/satz/lied/${encodeURIComponent(e.id)}`);
          }}
        >
          🎲 Zufälliges Lied
        </button>
        <Link className="btn" to="/satz/regeln">
          Regeln
        </Link>
        <button onClick={() => fileRef.current?.click()}>Eigene Melodie hochladen</button>
        <input
          ref={fileRef}
          type="file"
          accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      {msg && (
        <div className={`feedback ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </div>
      )}
      <span className="muted small">
        <span className="status-icon status-done">✓</span> geprüft · <span className="status-icon status-started">◐</span> angefangen ·
        Hochgeladene Melodien bleiben nur in diesem Browser (MusicXML, Dur).
      </span>

      {entries.length === 0 ? (
        <p>Es gibt noch keine Melodien.</p>
      ) : (
        <ul className="dict-list satz-list">
          {entries.map((e) => {
            const status = satzStatus(data.satz, e.id);
            return (
              <li key={e.id}>
                <Link to={`/satz/lied/${encodeURIComponent(e.id)}`}>
                  <span>
                    {e.title}
                    {e.uploaded && <span className="tag-own">eigene</span>}
                    {!e.hasSolution && <span className="muted small"> · ohne Beispiellösung</span>}
                  </span>
                  <span
                    className={`status-icon status-${status}`}
                    aria-label={status === 'done' ? 'geprüft' : status === 'started' ? 'angefangen' : 'offen'}
                  >
                    {status === 'done' ? '✓' : status === 'started' ? '◐' : ''}
                  </span>
                </Link>
                {e.uploaded && (
                  <button
                    className="ghost small"
                    aria-label={`${e.title} löschen`}
                    onClick={() => confirm(`„${e.title}“ und den Bearbeitungsstand löschen?`) && removeSatzUpload(e.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
