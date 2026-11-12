import {
  Accidental,
  Articulation,
  Barline,
  Beam,
  Dot,
  Modifier,
  ModifierContext,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  TickContext,
  Tuplet,
} from 'vexflow/bravura';
import { Measure, durationTicks } from '../dictation/model';
import { Pitch, diatonicIndex, fromDiatonicIndex, toMidi, vexKey } from '../music/pitch';
import { keySignatureName } from '../score/render';
import { SNote, noteEndS, sortByStart } from './model';

type Clef = 'treble' | 'bass';

export interface NoteStyle {
  head?: string;
}

export interface MarkLine {
  from: string;
  to: string;
  color: string;
}

export interface TextRow {
  tick: number;
  text: string;
  color?: string;
}

export interface SatzRenderInput {
  keyFifths: number;
  beats: number;
  beatType: number;
  measures: Measure[];
  /** S, A, T, B */
  voices: SNote[][];
  width: number;
  scale: number;
  /** All measures in one line (horizontal scrolling) */
  singleLine?: boolean;
  pxPerQuarter?: number;
  noteStyles?: Record<string, NoteStyle>;
  selectedId?: string | null;
  cursor?: { voice: number; tick: number } | null;
  /** Playback position */
  playTick?: number | null;
  lines?: MarkLine[];
  /** Rows of text above the soprano (analysis); several rows for both theories */
  textRows?: TextRow[][];
  showLyrics?: boolean;
  /** Voices drawn grey (e.g. given melody) */
  givenColor?: boolean;
}

export interface StaffLayout {
  topLine: number;
  lineSpacing: number;
  clef: Clef;
  top: number;
  bottom: number;
}

export interface MeasureLayout {
  index: number;
  x0: number;
  x1: number;
  left: number;
  right: number;
  top: number;
  staves: StaffLayout[];
}

export interface SatzLayout {
  measures: MeasureLayout[];
  width: number;
  height: number;
  notes: { id: string; voice: number; x: number; y: number }[];
}

const STAFF_OF = [0, 0, 1, 1];
const STEM = [1, -1, 1, -1];
const CLEFS: Clef[] = ['treble', 'bass'];
/** Rest positions per voice (upper voice higher) */
const REST_KEY: Record<number, { w: string; other: string }> = {
  0: { w: 'f/5', other: 'd/5' },
  1: { w: 'd/4', other: 'f/4' },
  2: { w: 'a/3', other: 'f/3' },
  3: { w: 'f/2', other: 'a/2' },
};

function cssColor(el: HTMLElement, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function headerWidth(keyFifths: number, withTime: boolean) {
  return 40 + Math.abs(keyFifths) * 10 + (withTime ? 30 : 0);
}

function topLineIndex(clef: Clef): number {
  return clef === 'treble' ? diatonicIndex({ step: 3, octave: 5 }) : diatonicIndex({ step: 5, octave: 3 });
}

export function pitchFromY(staff: StaffLayout, y: number): Pitch {
  const halfSteps = Math.round((y - staff.topLine) / (staff.lineSpacing / 2));
  return fromDiatonicIndex(topLineIndex(staff.clef) - halfSteps, 0);
}

/** Accidentals per staff and measure (both voices together, in temporal order). */
function accidentalMap(notes: SNote[], keyFifths: number): Map<string, string | null> {
  const state = new Map<string, number>();
  const out = new Map<string, string | null>();
  const sorted = [...notes].filter((n) => !n.rest).sort((a, b) => a.start - b.start || toMidi(a.pitch) - toMidi(b.pitch));
  for (const n of sorted) {
    const p = n.pitch;
    const k = `${p.step}:${p.octave}`;
    const keyAlt = keyAlterFor(p.step, keyFifths);
    const current = state.has(k) ? state.get(k)! : keyAlt;
    if (current === p.alter) {
      out.set(n.id, null);
      continue;
    }
    state.set(k, p.alter);
    out.set(n.id, p.alter === 0 ? 'n' : p.alter > 0 ? '#'.repeat(p.alter) : 'b'.repeat(-p.alter));
  }
  return out;
}

function keyAlterFor(step: number, keyFifths: number): number {
  const sharpOrder = [3, 0, 4, 1, 5, 2, 6];
  const flatOrder = [6, 2, 5, 1, 4, 0, 3];
  if (keyFifths > 0) return sharpOrder.slice(0, keyFifths).includes(step) ? 1 : 0;
  if (keyFifths < 0) return flatOrder.slice(0, -keyFifths).includes(step) ? -1 : 0;
  return 0;
}

/**
 * Draws a four-part setting on two staves (soprano/alto above, tenor/bass
 * below, classic stem directions). Notes are placed proportionally to their
 * onset, so a click maps directly to a time.
 */
export function renderSatz(el: HTMLElement, input: SatzRenderInput): SatzLayout {
  el.innerHTML = '';
  const { scale } = input;
  const fg = cssColor(el, '--fg', '#000');
  const accent = cssColor(el, '--accent', '#2563eb');
  const muted = cssColor(el, '--muted', '#888');
  const accentSoft = cssColor(el, '--accent-soft', '#e8efff');
  const pxq = input.pxPerQuarter ?? 46;
  const keySpec = keySignatureName(input.keyFifths);
  const timeSpec = `${input.beats}/${input.beatType}`;
  const rows = input.textRows?.filter((r) => r.length) ?? [];
  const textTop = rows.length * 16;
  const lyricSpace = input.showLyrics && input.voices[0].some((n) => n.lyric) ? 52 : 0;
  const STAFF_GAP = 100 + lyricSpace;
  const SYSTEM_GAP = 40;
  const TOP_PAD = (textTop ? 48 : 18) + textTop;

  const measureWidth = (m: Measure, first: boolean, systemIdx: number) =>
    Math.max(80, (m.ticks / 24) * pxq) + 34 + (first ? headerWidth(input.keyFifths, systemIdx === 0) : 0);

  const logicalAvail = input.width / scale;
  type Sys = { measures: { index: number; width: number }[] };
  const systems: Sys[] = [];
  let cur: Sys = { measures: [] };
  let used = 0;
  input.measures.forEach((m, idx) => {
    const first = cur.measures.length === 0;
    const w = measureWidth(m, first, systems.length);
    if (!input.singleLine && !first && used + w > logicalAvail - 4) {
      systems.push(cur);
      cur = { measures: [] };
      const w2 = measureWidth(m, true, systems.length);
      cur.measures.push({ index: idx, width: w2 });
      used = w2;
      return;
    }
    cur.measures.push({ index: idx, width: w });
    used += w;
  });
  if (cur.measures.length) systems.push(cur);

  const lineWidth = input.singleLine
    ? Math.max(logicalAvail, systems[0]?.measures.reduce((a, b) => a + b.width, 0) + 4 || 0)
    : logicalAvail;
  const systemHeight = TOP_PAD + 2 * STAFF_GAP + SYSTEM_GAP - 30;
  const height = systems.length * systemHeight + 10;
  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(lineWidth * scale, height * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  ctx.setFillStyle(fg);
  ctx.setStrokeStyle(fg);

  const layout: SatzLayout = { measures: [], width: lineWidth * scale, height: height * scale, notes: [] };
  const vfById = new Map<string, StaveNote>();
  const xById = new Map<string, number>();
  const voiceSorted = input.voices.map((v) => sortByStart(v));

  systems.forEach((sys, sIndex) => {
    const total = sys.measures.reduce((a, b) => a + b.width, 0);
    const isLast = sIndex === systems.length - 1;
    const stretch = input.singleLine ? 1 : !isLast || total > lineWidth * 0.6 ? (lineWidth - 2) / total : 1;
    let x = 1;
    const yBase = sIndex * systemHeight + TOP_PAD;
    const firstStaves: Stave[] = [];
    sys.measures.forEach((mInfo, mPos) => {
      const w = mInfo.width * stretch;
      const m = input.measures[mInfo.index];
      const ml: MeasureLayout = {
        index: mInfo.index,
        x0: 0,
        x1: 0,
        left: x * scale,
        right: (x + w) * scale,
        top: (yBase - textTop) * scale,
        staves: [],
      };
      const staves: Stave[] = [];
      let noteStart = 0;
      let noteEnd = 0;
      CLEFS.forEach((clef, sIdx) => {
        const y = yBase + sIdx * STAFF_GAP;
        const stave = new Stave(x, y, w);
        if (mPos === 0) {
          stave.addClef(clef);
          if (keySpec) stave.addKeySignature(keySpec);
          if (sIndex === 0) stave.addTimeSignature(timeSpec);
          firstStaves[sIdx] = stave;
        } else stave.setBegBarType(Barline.type.NONE);
        if (mInfo.index === input.measures.length - 1) stave.setEndBarType(Barline.type.END);
        stave.setContext(ctx);
        if (input.playTick != null && input.playTick >= m.start && input.playTick < m.start + m.ticks) {
          ctx.save();
          ctx.setFillStyle(accentSoft);
          ctx.fillRect(x, stave.getYForLine(0) - 14, w, 68);
          ctx.restore();
        }
        stave.draw();
        staves.push(stave);
        noteStart = stave.getNoteStartX() + 14;
        noteEnd = x + w - 16;
        ml.staves.push({
          topLine: stave.getYForLine(0) * scale,
          lineSpacing: stave.getSpacingBetweenLines() * scale,
          clef,
          top: (y - (sIdx === 0 ? 10 + textTop : 0)) * scale,
          bottom: (y + STAFF_GAP - (sIdx === 0 ? 0 : 10)) * scale,
        });
      });
      // Measure number at the start of a line
      if (mPos === 0) {
        ctx.save();
        ctx.setFont('Arial', 9, 'normal');
        ctx.setFillStyle(muted);
        const num = mInfo.index + (input.measures[0].ticks < (input.measures[1]?.ticks ?? 0) ? 0 : 1);
        if (num > 0) ctx.fillText(String(num), x + 2, staves[0].getYForLine(0) - 14);
        ctx.restore();
      }
      ml.x0 = noteStart * scale;
      ml.x1 = noteEnd * scale;
      const xForTick = (tick: number) => noteStart + ((tick - m.start) / m.ticks) * (noteEnd - noteStart);

      // Notes per staff
      [0, 1].forEach((sIdx) => {
        const stave = staves[sIdx];
        const clef = CLEFS[sIdx];
        const vIdx = [0, 1, 2, 3].filter((v) => STAFF_OF[v] === sIdx);
        const inMeasure = vIdx.map((v) => voiceSorted[v].filter((n) => n.start >= m.start && n.start < m.start + m.ticks));
        const acc = accidentalMap(inMeasure.flat(), input.keyFifths);
        const pad = stave.getNoteStartX() + 14;
        vIdx.forEach((v, k) => {
          const notes = inMeasure[k];
          const other = inMeasure[1 - k];
          const vf: StaveNote[] = [];
          const triplets: StaveNote[][] = [];
          let run: StaveNote[] = [];
          let runTicks = 0;
          for (const n of notes) {
            try {
              const sn = n.rest
                ? new StaveNote({
                    keys: [n.dur.base === 'w' ? REST_KEY[v].w : REST_KEY[v].other],
                    duration: n.dur.base + 'r',
                    clef,
                  })
                : new StaveNote({ keys: [vexKey(n.pitch)], duration: n.dur.base, clef, stem_direction: STEM[v] });
              sn.setStave(stave);
              if (!n.rest) {
                const a = acc.get(n.id);
                if (a) sn.addModifier(new Accidental(a), 0);
              }
              if (n.dur.dotted) Dot.buildAndAttach([sn], { all: true });
              if (n.fermata && (v === 0 || v === 3)) {
                sn.addModifier(new Articulation(v === 0 ? 'a@a' : 'a@u').setPosition(v === 0 ? Modifier.Position.ABOVE : Modifier.Position.BELOW), 0);
              }
              const style = input.noteStyles?.[n.id];
              const selected = input.selectedId === n.id;
              const color = selected ? accent : style?.head ?? (input.givenColor && n.given ? muted : undefined);
              if (color) {
                sn.setStyle({ fillStyle: color, strokeStyle: color });
              }
              const mc = new ModifierContext();
              sn.addToModifierContext(mc);
              const tc = new TickContext();
              tc.addTickable(sn);
              tc.preFormat();
              // Shift the lower voice to the right for unisons and seconds with the upper voice
              let shift = 0;
              if (!n.rest && k === 1) {
                const up = other.find((o) => o.start === n.start && !o.rest);
                if (up && Math.abs(diatonicIndex(up.pitch) - diatonicIndex(n.pitch)) <= 1) shift = 11;
              }
              const nx = xForTick(n.start) + shift;
              tc.setX(nx - pad);
              xById.set(n.id, nx);
              sn.setContext(ctx);
              vf.push(sn);
              vfById.set(n.id, sn);
              if (n.dur.triplet) {
                run.push(sn);
                runTicks += durationTicks(n.dur);
                if (runTicks % 24 === 0) {
                  triplets.push(run);
                  run = [];
                  runTicks = 0;
                }
              } else if (run.length) {
                triplets.push(run);
                run = [];
                runTicks = 0;
              }
            } catch (e) {
              console.warn('Note konnte nicht gezeichnet werden', e);
            }
          }
          if (run.length) triplets.push(run);
          let beams: Beam[] = [];
          try {
            beams = Beam.generateBeams(vf.filter((s) => !s.isRest()), {
              groups: Beam.getDefaultBeamGroups(timeSpec),
              maintain_stem_directions: true,
            });
          } catch {
            beams = [];
          }
          for (const sn of vf) {
            try {
              sn.draw();
            } catch (e) {
              console.warn(e);
            }
          }
          for (const b of beams) {
            try {
              b.setContext(ctx).draw();
            } catch {
              /* ignore */
            }
          }
          for (const t of triplets) {
            try {
              new Tuplet(t, { num_notes: 3, notes_occupied: 2, bracketed: true, location: STEM[v] === 1 ? 1 : -1 })
                .setContext(ctx)
                .draw();
            } catch {
              /* ignore */
            }
          }
          notes.forEach((n) => {
            const sn = vfById.get(n.id);
            if (!sn || n.rest) return;
            const nx = (xById.get(n.id) ?? 0) + 6;
            layout.notes.push({ id: n.id, voice: v, x: nx * scale, y: (sn.getYs()[0] ?? 0) * scale });
          });
        });

        // Cursor (insert position)
        if (input.cursor && STAFF_OF[input.cursor.voice] === sIdx && input.cursor.tick >= m.start && input.cursor.tick < m.start + m.ticks) {
          const cx = xForTick(input.cursor.tick);
          ctx.save();
          ctx.setFillStyle(accent);
          ctx.fillRect(cx - 1, stave.getYForLine(0) - 12, 2, 64);
          ctx.restore();
        }
      });

      // Lyrics between the staves
      if (lyricSpace) {
        ctx.save();
        ctx.setFont('Arial', 12, 'normal');
        ctx.setFillStyle(fg);
        for (const n of voiceSorted[0]) {
          if (!n.lyric || n.start < m.start || n.start >= m.start + m.ticks) continue;
          ctx.fillText(n.lyric, xForTick(n.start) - 4, staves[0].getYForLine(4) + 42);
        }
        ctx.restore();
      }

      // Analysis rows above the soprano
      rows.forEach((row, ri) => {
        ctx.save();
        ctx.setFont('Arial', 13, 'normal');
        for (const t of row) {
          if (t.tick < m.start || t.tick >= m.start + m.ticks) continue;
          ctx.setFillStyle(t.color ?? fg);
          ctx.fillText(t.text, xForTick(t.tick) - 3, yBase - textTop - 30 + ri * 16);
        }
        ctx.restore();
      });

      if (mPos === 0) {
        try {
          new StaveConnector(firstStaves[0], firstStaves[1]).setType('brace').setContext(ctx).draw();
          new StaveConnector(firstStaves[0], firstStaves[1]).setType('singleLeft').setContext(ctx).draw();
        } catch {
          /* ignore */
        }
      }
      try {
        new StaveConnector(staves[0], staves[1])
          .setType(mInfo.index === input.measures.length - 1 ? 'boldDoubleRight' : 'singleRight')
          .setContext(ctx)
          .draw();
      } catch {
        /* ignore */
      }
      x += w;
      layout.measures.push(ml);
    });
  });

  // Ties
  input.voices.forEach((voice) => {
    const s = sortByStart(voice);
    s.forEach((n, i) => {
      const next = s[i + 1];
      if (!n.tie || n.rest || !next || next.rest || toMidi(next.pitch) !== toMidi(n.pitch) || noteEndS(n) !== next.start) return;
      const a = vfById.get(n.id);
      const b = vfById.get(next.id);
      if (!a || !b) return;
      try {
        const sameLine = Math.abs(a.getStave()!.getY() - b.getStave()!.getY()) < 1;
        if (sameLine) new StaveTie({ first_note: a, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
        else {
          new StaveTie({ first_note: a, last_note: null as unknown as StaveNote, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
          new StaveTie({ first_note: null as unknown as StaveNote, last_note: b, first_indices: [0], last_indices: [0] }).setContext(ctx).draw();
        }
      } catch {
        /* ignore */
      }
    });
  });

  // Marking lines (e.g. parallels)
  for (const line of input.lines ?? []) {
    const a = layout.notes.find((n) => n.id === line.from);
    const b = layout.notes.find((n) => n.id === line.to);
    if (!a || !b) continue;
    ctx.save();
    ctx.setStrokeStyle(line.color);
    ctx.setLineWidth(2.2);
    ctx.beginPath();
    ctx.moveTo(a.x / scale + 4, a.y / scale);
    ctx.lineTo(b.x / scale - 6, b.y / scale);
    ctx.stroke();
    ctx.restore();
  }

  return layout;
}

/** Maps a click to measure, staff, tick and pitch. */
export function hitTestSatz(
  layout: SatzLayout,
  measures: Measure[],
  x: number,
  y: number,
): { measure: number; staff: number; tick: number; pitch: Pitch } | null {
  const ml = layout.measures.find((m) => x >= m.left && x <= m.right && m.staves.some((s) => y >= s.top && y <= s.bottom));
  if (!ml) return null;
  const staff = ml.staves.findIndex((s) => y >= s.top && y <= s.bottom);
  if (staff < 0) return null;
  const m = measures[ml.index];
  const fraction = Math.max(0, Math.min(0.9999, (x - ml.x0) / (ml.x1 - ml.x0)));
  return { measure: ml.index, staff, tick: m.start + fraction * m.ticks, pitch: pitchFromY(ml.staves[staff], y) };
}

/** Note head near a click (screen pixels). */
export function noteNear(layout: SatzLayout, x: number, y: number, radius = 9): { id: string; voice: number } | null {
  let best: { id: string; voice: number; d: number } | null = null;
  for (const n of layout.notes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= radius && (!best || d < best.d)) best = { id: n.id, voice: n.voice, d };
  }
  return best;
}
