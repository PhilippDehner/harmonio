import { useMemo } from 'react';
import { DNote, Duration, Measure } from '../dictation/model';
import { Pitch, toMidi } from '../music/pitch';
import { StaffDef } from '../score/render';
import ScoreView from './ScoreView';

const WHOLE: Duration = { base: 'w', dotted: false, triplet: false };
const TICKS = 96;

type Props = {
  /** Sounds in temporal order; each sound consists of one or more pitches. */
  sounds: Pitch[][];
  /** Fixed assignment: voices 0–1 in treble, 2–3 in bass clef (four-part chorale). */
  satb?: boolean;
  ariaLabel: string;
};

/** Score of the solution (whole notes, without time and key signature). */
export default function SolutionScore({ sounds, satb, ariaLabel }: Props) {
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

  return (
    <div className="solution-score">
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
      />
    </div>
  );
}
