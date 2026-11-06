import { useState } from 'react';
import { playKey } from '../audio/engine';
import { mod, simpleSpellings, type Pitch } from '../music/pitch';
import Piano from './Piano';

/** Chromatic spelling for the free keyboard: cis, es, fis, gis, b. */
function spellChromatic(midi: number): Pitch {
  const options = simpleSpellings(midi);
  const natural = options.find((p) => p.alter === 0);
  if (natural) return natural;
  const flat = [3, 10].includes(mod(midi, 12));
  return options.find((p) => (flat ? p.alter < 0 : p.alter > 0)) ?? options[0];
}

/** Collapsible keyboard available on every page to play single notes. */
export default function PianoDock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <div className="piano-dock-spacer" aria-hidden="true" />}
      {open && (
        <div className="piano-dock" role="region" aria-label="Klavier">
          <Piano low={36} high={96} keyFifths={0} onKey={(m) => void playKey(m)} pressOnDown spell={spellChromatic} />
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
