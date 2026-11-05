import { useEffect, useRef } from 'react';
import { Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow/bravura';

/** Kleine Notenbeispiele für die Kacheln der Startseite (VexFlow, folgt der Textfarbe). */

export type TileIconKind = 'interval' | 'chord' | 'mono' | 'two' | 'four';

/** Ein Notenwert: Tonhöhen (VexFlow-Schreibweise) und Dauer. */
type Ev = { keys: string[]; d: 'w' | 'q' };
type Icon = { treble: Ev[]; bass?: Ev[] };

const w = (...keys: string[]): Ev => ({ keys, d: 'w' });
const q = (key: string): Ev => ({ keys: [key], d: 'q' });

const ICONS: Record<TileIconKind, Icon> = {
  // Quinte, gleichzeitig
  interval: { treble: [w('g/4', 'd/5')] },
  // C-Dur-Akkord, Basston im Bassschlüssel
  chord: { treble: [w('e/4', 'g/4', 'c/5')], bass: [w('c/3')] },
  // kurze Melodie
  mono: { treble: ['g/4', 'b/4', 'a/4', 'e/5', 'd/5'].map(q) },
  // zwei Stimmen auf zwei Systemen
  two: { treble: ['e/4', 'f/4', 'g/4', 'e/4'].map(q), bass: ['c/3', 'd/3', 'b/2', 'c/3'].map(q) },
  // vierstimmiger Satz I–IV–I, nur der Bass im Bassschlüssel
  four: {
    treble: [w('g/4', 'c/5', 'e/5'), w('a/4', 'c/5', 'f/5'), w('g/4', 'c/5', 'e/5')],
    bass: [w('c/3'), w('f/2'), w('c/3')],
  },
};

const WIDTH = 220;
const HEIGHT = 170;
const SPACE = 10; // VexFlow-Linienabstand

function voiceOf(evs: Ev[], clef: 'treble' | 'bass') {
  const notes = evs.map((e) => new StaveNote({ keys: e.keys, duration: e.d, clef, auto_stem: true }));
  return new Voice().setMode(Voice.Mode.SOFT).addTickables(notes);
}

function draw(el: HTMLDivElement, icon: Icon) {
  el.innerHTML = '';
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(WIDTH, HEIGHT);
  const ctx = renderer.getContext();
  ctx.setFillStyle('currentColor');
  ctx.setStrokeStyle('currentColor');

  const x = icon.bass ? 14 : 4;
  const sw = WIDTH - x - 4;
  const opts = { space_above_staff_ln: 0 };
  // Systeme vertikal so platzieren, dass alle Symbole denselben Maßstab haben
  const trebleTop = icon.bass ? 30 : (HEIGHT - 4 * SPACE) / 2;
  const treble = new Stave(x, trebleTop, sw, opts).addClef('treble').setContext(ctx);
  const staves = [treble];
  const voices = [voiceOf(icon.treble, 'treble')];
  if (icon.bass) {
    const bass = new Stave(x, 100, sw, opts).addClef('bass').setContext(ctx);
    staves.push(bass);
    voices.push(voiceOf(icon.bass, 'bass'));
  }
  staves.forEach((s) => s.draw());
  if (staves.length === 2) {
    new StaveConnector(staves[0], staves[1]).setType('brace').setContext(ctx).draw();
    new StaveConnector(staves[0], staves[1]).setType('singleLeft').setContext(ctx).draw();
    new StaveConnector(staves[0], staves[1]).setType('singleRight').setContext(ctx).draw();
  }

  const start = Math.max(...staves.map((s) => s.getNoteStartX()));
  staves.forEach((s) => s.setNoteStartX(start));
  const formatter = new Formatter();
  voices.forEach((v) => formatter.joinVoices([v]));
  formatter.format(voices, treble.getNoteEndX() - start - 10);
  voices.forEach((v, i) => v.draw(ctx, staves[i]));

  const svg = el.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
  }
}

export default function TileIcon({ kind }: { kind: TileIconKind }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      draw(ref.current, ICONS[kind]);
    } catch (e) {
      console.error(e);
    }
  }, [kind]);
  return <div ref={ref} className="tile-icon" aria-hidden="true" />;
}
