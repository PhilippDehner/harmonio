import { useMemo } from 'react';
import { DNote, Duration, Measure } from '../dictation/model';
import { Pitch, toMidi } from '../music/pitch';
import { NoteStyle, StaffDef } from '../score/render';
import { useSettings } from '../storage/store';
import ScoreView from './ScoreView';

const WHOLE: Duration = { base: 'w', dotted: false, triplet: false };
const TICKS = 96;

type Props = {
  /** Sounds in temporal order; each sound consists of one or more pitches. */
  sounds: Pitch[][];
  /** Fixed assignment: voices 0–1 in treble, 2–3 in bass clef (four-part chorale). */
  satb?: boolean;
  ariaLabel: string;
  /** Notes to highlight (true = red, 'warn' = orange), with the same shape as `sounds`. */
  marked?: (boolean | 'warn')[][];
  /** Heading displayed above the score. */
  title?: string;
};

/** Score of the solution (whole notes, without time and key signature). */
export default function SolutionScore({ sounds, satb, ariaLabel, marked, title }: Props) {
  const { theme } = useSettings();
  const input = useMemo(() => {
    const measures: Measure[] = [{ start: 0, ticks: TICKS * Math.max(1, sounds.length) }];
    const all = sounds.flat().map(toMidi);
    let staves: StaffDef[];
    let voices: DNote[][];
    if (satb) {
      staves = [
        { clef: 'treble', voices: [0, 1] },
        { clef: 'bass', voices: [2, 3] },
      ];
      voices = [0, 1, 2, 3].map((v) =>
        sounds.flatMap((s, i) => (s[v] ? [{ id: `${i}-${v}`, start: i * TICKS, dur: WHOLE, pitch: s[v] }] : [])),
      );
    } else {
      // Choose clef by range; for a wide range use a grand staff (split at c')
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      const split = lo < 57 && hi > 64;
      staves = split
        ? [
            { clef: 'treble', voices: [0] },
            { clef: 'bass', voices: [1] },
          ]
        : [{ clef: lo < 57 ? 'bass' : 'treble', voices: [0, 1] }];
      const upper: DNote[] = [];
      const lower: DNote[] = [];
      sounds.forEach((s, i) =>
        s.forEach((p, j) => {
          const n: DNote = { id: `${i}-${j}`, start: i * TICKS, dur: WHOLE, pitch: p };
          (split && toMidi(p) < 60 ? lower : upper).push(n);
        }),
      );
      voices = [upper, lower];
    }
    return { measures, staves, voices };
  }, [sounds, satb]);

  const noteStyles = useMemo(() => {
    if (!marked) return undefined;
    const css = getComputedStyle(document.documentElement);
    const err = css.getPropertyValue('--err').trim();
    const warn = css.getPropertyValue('--warn').trim();
    const styles: Record<string, NoteStyle> = {};
    for (const v of input.voices)
      for (const n of v) {
        const [i, j] = n.id.split('-').map(Number);
        const m = marked[i]?.[j];
        if (m) styles[n.id] = m === 'warn' ? { head: warn, stem: warn } : { head: err, stem: err };
      }
    return styles;
    // `theme`: Farbe nach Umschalten des Farbschemas neu bestimmen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, marked, theme]);

  return (
    <div className="solution-score">
      {title && <div className="solution-score-title muted small">{title}</div>}
      <ScoreView
        ariaLabel={ariaLabel}
        keyFifths={0}
        beats={4}
        beatType={4}
        showTime={false}
        barlines={false}
        measures={input.measures}
        staves={input.staves}
        voices={input.voices}
        fromMeasure={0}
        toMeasure={1}
        scale={1}
        noteStyles={noteStyles}
      />
    </div>
  );
}
