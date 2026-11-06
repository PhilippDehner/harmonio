import { useState } from 'react';
import { playKey } from '../audio/engine';
import Piano from './Piano';

/** Collapsible keyboard available on every page to play single notes. */
export default function PianoDock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <div className="piano-dock-spacer" aria-hidden="true" />}
      {open && (
        <div className="piano-dock" role="region" aria-label="Klavier">
          <Piano low={36} high={96} keyFifths={0} onKey={(m) => void playKey(m)} pressOnDown />
        </div>
      )}
      <button
        className={`piano-dock-toggle${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Klavier einklappen' : 'Klavier ausklappen'}
        title={open ? 'Klavier einklappen' : 'Klavier ausklappen'}
      >
        {open ? '✕' : '🎹'}
      </button>
    </>
  );
}
