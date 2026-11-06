import { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../config';
import { ChangelogEntry, changesSince, CHANGELOG } from '../changelog';

const KEY = 'harmonio:lastSeenVersion';
/** Version assumed for users who used the app before the changelog existed. */
const VERSION_BEFORE_CHANGELOG = '1.0.0';

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeLastSeen() {
  try {
    localStorage.setItem(KEY, APP_VERSION);
  } catch {
    // Storage full or blocked: ignore
  }
}

/** Whether the app has been used before in this browser. */
function hasStoredData(): boolean {
  try {
    return ['settings', 'stats', 'dictations', 'tours'].some((k) => localStorage.getItem(`harmonio:${k}`) !== null);
  } catch {
    return false;
  }
}

/** Entries to show on startup: changes since the last visit; nothing for new users. */
function initialEntries(): ChangelogEntry[] {
  const lastSeen = readLastSeen();
  if (lastSeen === APP_VERSION) return [];
  if (lastSeen === null && !hasStoredData()) {
    writeLastSeen();
    return [];
  }
  const entries = changesSince(lastSeen ?? VERSION_BEFORE_CHANGELOG);
  if (entries.length === 0) writeLastSeen();
  return entries;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE');
}

function ChangelogDialog({ entries, title, onClose }: { entries: ChangelogEntry[]; title: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Focus the button without scrolling, so the dialog starts at the top
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      // Close on a click outside the dialog box
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog stack changelog">
        <h2 id="whats-new-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        {entries.map((e) => (
          <section key={e.version}>
            <h3>
              Version {e.version} <span className="muted small">· {formatDate(e.date)}</span>
            </h3>
            <ul>
              {e.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        ))}
        <div className="row">
          <button ref={closeRef} className="primary" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shows the changes since the last visit after an update. */
export default function WhatsNew() {
  const [entries, setEntries] = useState(initialEntries);
  if (entries.length === 0) return null;
  return (
    <ChangelogDialog
      entries={entries}
      title="Neu in Harmonio"
      onClose={() => {
        writeLastSeen();
        setEntries([]);
      }}
    />
  );
}

/** Footer button that opens the full changelog. */
export function ChangelogButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="link-button" onClick={() => setOpen(true)}>
        Neuigkeiten
      </button>
      {open && <ChangelogDialog entries={CHANGELOG} title="Neuigkeiten" onClose={() => setOpen(false)} />}
    </>
  );
}
