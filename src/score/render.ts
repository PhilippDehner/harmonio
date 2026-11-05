import {
  Accidental,
  Barline,
  Beam,
  Dot,
  ModifierContext,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  TickContext,
  Tuplet,
} from 'vexflow/bravura';
import { Pitch, toMidi, vexKey, diatonicIndex, fromDiatonicIndex } from '../music/pitch';
import { DNote, Duration, Measure, durationTicks } from '../dictation/model';
import { accidentalsInMeasure } from './accidentals';

export type Clef = 'treble' | 'bass';

export interface StaffDef {
  clef: Clef;
  /** Indizes der Stimmen auf diesem System (mehrere = Akkord) */
  voices: number[];
}

export interface NoteStyle {
  head?: string;
  stem?: string;
}

export interface RenderInput {
  keyFifths: number;
  beats: number;
  beatType: number;
  showTime: boolean;
  barlines: boolean;
  measures: Measure[];
  staves: StaffDef[];
  voices: DNote[][];
  fromMeasure: number;
  toMeasure: number;
  /** Breite in Bildschirmpixeln */
  width: number;
  scale: number;
  noteStyles?: Record<string, NoteStyle>;
  selectedId?: string | null;
  activeStaff?: number;
  cursor?: { staff: number; tick: number } | null;
  highlightMeasure?: number | null;
  /** Auch die letzte Zeile auf volle Breite strecken */
  fill?: boolean;
  /** Feste Breite pro Takt-Einheit (proportional zur Dauer) */
  pxPerQuarter?: number;
}

export interface StaffLayout {
  /** y der obersten Notenlinie (Bildschirmpixel) */
  topLine: number;
  lineSpacing: number;
  clef: Clef;
  top: number;
  bottom: number;
}

export interface MeasureLayout {
  index: number;
  /** Notenbereich (Bildschirmpixel) */
  x0: number;
  x1: number;
  left: number;
  right: number;
  staves: StaffLayout[];
}

export interface ScoreLayout {
  measures: MeasureLayout[];
  height: number;
  notes: { id: string; staff: number; x: number; y: number }[];
}

const STAFF_GAP = 95;
const SYSTEM_GAP = 30;
const TOP_PAD = 10;

function vexDuration(d: Duration): string {
  return d.base;
}

/** Diatonischer Index der obersten Linie */
function topLineIndex(clef: Clef): number {
  return clef === 'treble' ? diatonicIndex({ step: 3, octave: 5 }) : diatonicIndex({ step: 5, octave: 3 });
}

/** Tonhöhe (ohne Vorzeichen) aus y-Koordinate. */
export function pitchFromY(staff: StaffLayout, y: number): Pitch {
  const halfSteps = Math.round((y - staff.topLine) / (staff.lineSpacing / 2));
  return fromDiatonicIndex(topLineIndex(staff.clef) - halfSteps, 0);
}

function headerWidth(keyFifths: number, withTime: boolean) {
  return 40 + Math.abs(keyFifths) * 10 + (withTime ? 30 : 0);
}

function getCssColor(el: HTMLElement, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Zeichnet Takte proportional zur Dauer: Die x-Position einer Note entspricht
 * ihrem Einsatz im Takt. So lassen sich Klicks direkt Zeitpunkten zuordnen.
 */
export function renderScore(el: HTMLElement, input: RenderInput): ScoreLayout {
  el.innerHTML = '';
  const { scale } = input;
  const fg = getCssColor(el, '--fg', '#000');
  const accent = getCssColor(el, '--accent', '#2563eb');
  const muted = getCssColor(el, '--muted', '#888');
  const accentSoft = getCssColor(el, '--accent-soft', '#e8efff');
  const logicalWidth = input.width / scale;
  const pxq = input.pxPerQuarter ?? 42;
  const indices: number[] = [];
  for (let i = input.fromMeasure; i < input.toMeasure; i++) indices.push(i);
  const keySpec = keySignatureName(input.keyFifths);
  const timeSpec = `${input.beats}/${input.beatType}`;

  // Systeme (Zeilen) bilden
  type Sys = { measures: { index: number; width: number }[] };
  const systems: Sys[] = [];
  let cur: Sys = { measures: [] };
  let used = 0;
  indices.forEach((idx) => {
    const m = input.measures[idx];
    const first = cur.measures.length === 0;
    const header = first ? headerWidth(input.keyFifths, input.showTime && systems.length === 0) : 0;
    const w = Math.max(70, (m.ticks / 24) * pxq) + 30 + header;
    if (!first && used + w > logicalWidth - 4) {
      systems.push(cur);
      cur = { measures: [] };
      used = 0;
      const h = headerWidth(input.keyFifths, false);
      cur.measures.push({ index: idx, width: w + h });
      used = w + h;
      return;
    }
    cur.measures.push({ index: idx, width: w });
    used += w;
  });
  if (cur.measures.length) systems.push(cur);

  const systemHeight = input.staves.length * STAFF_GAP + SYSTEM_GAP;
  const height = TOP_PAD + systems.length * systemHeight;
  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(input.width, height * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  ctx.setFillStyle(fg);
  ctx.setStrokeStyle(fg);

  const layout: ScoreLayout = { measures: [], height: height * scale, notes: [] };

  systems.forEach((sys, sIndex) => {
    // Takte auf volle Breite strecken (außer bei sehr kurzer letzter Zeile)
    const total = sys.measures.reduce((a, b) => a + b.width, 0);
    const isLast = sIndex === systems.length - 1;
    const stretch = input.fill || !isLast || total > logicalWidth * 0.6 ? (logicalWidth - 2) / total : 1;
    let x = 1;
    const yBase = TOP_PAD + sIndex * systemHeight;
    const firstStaves: Stave[] = [];
    sys.measures.forEach((mInfo, mPos) => {
      const w = mInfo.width * stretch;
      const m = input.measures[mInfo.index];
      const ml: MeasureLayout = { index: mInfo.index, x0: 0, x1: 0, left: x * scale, right: (x + w) * scale, staves: [] };
      input.staves.forEach((staffDef, sIdx) => {
        const y = yBase + sIdx * STAFF_GAP;
        const stave = new Stave(x, y, w);
        if (mPos === 0) {
          stave.addClef(staffDef.clef);
          if (keySpec) stave.addKeySignature(keySpec);
          if (input.showTime && sIndex === 0 && mInfo.index === input.fromMeasure) stave.addTimeSignature(timeSpec);
          firstStaves[sIdx] = stave;
        }
        const lastMeasure = mInfo.index === input.measures.length - 1;
        if (!input.barlines) {
          stave.setBegBarType(Barline.type.NONE);
          stave.setEndBarType(lastMeasure ? Barline.type.END : Barline.type.NONE);
        } else {
          if (mPos !== 0) stave.setBegBarType(Barline.type.NONE);
          if (lastMeasure) stave.setEndBarType(Barline.type.END);
        }
        stave.setContext(ctx);
        if (input.highlightMeasure === mInfo.index) {
          ctx.save();
          ctx.setFillStyle(accentSoft);
          ctx.fillRect(x, stave.getYForLine(0) - 18, w, 40 + 36);
          ctx.restore();
        }
        stave.draw();
        if (input.activeStaff === sIdx && input.staves.length > 1) {
          ctx.save();
          ctx.setFillStyle(accent);
          ctx.fillRect(x, stave.getYForLine(0), 2.5, 40);
          ctx.restore();
        }

        const noteStart = stave.getNoteStartX() + 12;
        const noteEnd = x + w - 14;
        ml.x0 = noteStart * scale;
        ml.x1 = noteEnd * scale;
        const topLine = stave.getYForLine(0);
        ml.staves.push({
          topLine: topLine * scale,
          lineSpacing: stave.getSpacingBetweenLines() * scale,
          clef: staffDef.clef,
          top: (y) * scale,
          bottom: (y + STAFF_GAP) * scale,
        });

        const xForTick = (tick: number) => noteStart + ((tick - m.start) / m.ticks) * (noteEnd - noteStart);

        // Noten dieses Systems im Takt, nach Einsatz gruppiert (Akkorde)
        const notes = staffDef.voices
          .flatMap((v) => input.voices[v] ?? [])
          .filter((n) => n.start >= m.start && n.start < m.start + m.ticks);
        const groups = new Map<number, DNote[]>();
        for (const n of notes) {
          const g = groups.get(n.start) ?? [];
          g.push(n);
          groups.set(n.start, g);
        }
        const starts = Array.from(groups.keys()).sort((a, b) => a - b);
        // Versetzungszeichen
        const seq: { note: DNote }[] = [];
        starts.forEach((s) => {
          const g = groups.get(s)!.sort((a, b) => toMidi(a.pitch) - toMidi(b.pitch));
          g.forEach((n) => seq.push({ note: n }));
        });
        const accs = accidentalsInMeasure(seq.map((q) => q.note.pitch), input.keyFifths);
        const accMap = new Map<string, string | null>();
        seq.forEach((q, i) => accMap.set(q.note.id, accs[i]));

        const vfNotes: StaveNote[] = [];
        const tripletRuns: StaveNote[][] = [];
        let run: StaveNote[] = [];
        let runTicks = 0;
        starts.forEach((s) => {
          const g = groups.get(s)!;
          const dur = g[0].dur;
          try {
            const sn = new StaveNote({
              keys: g.map((n) => vexKey(n.pitch)),
              duration: vexDuration(dur),
              clef: staffDef.clef,
              auto_stem: true,
            });
            sn.setStave(stave);
            g.forEach((n, i) => {
              const a = accMap.get(n.id);
              if (a) sn.addModifier(new Accidental(a), i);
              const style = input.noteStyles?.[n.id];
              const selected = input.selectedId === n.id;
              const color = selected ? accent : style?.head ?? (n.given ? muted : undefined);
              if (color) sn.setKeyStyle(i, { fillStyle: color, strokeStyle: color });
            });
            if (dur.dotted) Dot.buildAndAttach([sn], { all: true });
            const stemColor = input.noteStyles?.[g[0].id]?.stem;
            if (stemColor) sn.setStemStyle({ fillStyle: stemColor, strokeStyle: stemColor });
            if (stemColor) sn.setFlagStyle({ fillStyle: stemColor, strokeStyle: stemColor });
            const mc = new ModifierContext();
            sn.addToModifierContext(mc);
            const tc = new TickContext();
            tc.addTickable(sn);
            tc.preFormat();
            const pad = stave.getNoteStartX() + 12;
            tc.setX(xForTick(s) - pad);
            sn.setContext(ctx);
            vfNotes.push(sn);
            if (dur.triplet) {
              run.push(sn);
              runTicks += durationTicks(dur);
              if (runTicks % 24 === 0) {
                tripletRuns.push(run);
                run = [];
                runTicks = 0;
              }
            } else if (run.length) {
              tripletRuns.push(run);
              run = [];
              runTicks = 0;
            }
            g.forEach((n) => {
              const idx = g.indexOf(n);
              const ys = sn.getYs();
              layout.notes.push({ id: n.id, staff: sIdx, x: xForTick(s) * scale, y: (ys[idx] ?? 0) * scale });
            });
          } catch (e) {
            console.warn('Note konnte nicht gezeichnet werden', e);
          }
        });
        if (run.length) tripletRuns.push(run);

        const tuplets: Tuplet[] = [];
        for (const r of tripletRuns) {
          try {
            tuplets.push(new Tuplet(r, { num_notes: 3, notes_occupied: 2, bracketed: true }));
          } catch {
            /* ignorieren */
          }
        }
        let beams: Beam[] = [];
        if (input.barlines) {
          try {
            beams = Beam.generateBeams(vfNotes, { groups: Beam.getDefaultBeamGroups(timeSpec) });
          } catch {
            beams = [];
          }
        }
        for (const n of vfNotes) {
          try {
            n.draw();
          } catch (e) {
            console.warn(e);
          }
        }
        for (const b of beams) {
          try {
            b.setContext(ctx).draw();
          } catch {
            /* ignorieren */
          }
        }
        for (const t of tuplets) {
          try {
            t.setContext(ctx).draw();
          } catch {
            /* ignorieren */
          }
        }

        // Eingabeposition
        if (input.cursor && input.cursor.staff === sIdx && input.cursor.tick >= m.start && input.cursor.tick < m.start + m.ticks) {
          const cx = xForTick(input.cursor.tick);
          ctx.save();
          ctx.setFillStyle(accent);
          ctx.fillRect(cx - 1, topLine - 15, 2, 70);
          ctx.restore();
        }
      });
      if (input.staves.length > 1 && mPos === 0) {
        try {
          const top = firstStaves[0];
          const bottom = firstStaves[input.staves.length - 1];
          new StaveConnector(top, bottom).setType('brace').setContext(ctx).draw();
          new StaveConnector(top, bottom).setType('singleLeft').setContext(ctx).draw();
        } catch {
          /* ignorieren */
        }
      }
      x += w;
      layout.measures.push(ml);
    });
  });

  return layout;
}

/** VexFlow-Tonartbezeichnung aus Quintenzirkel-Position. */
export function keySignatureName(fifths: number): string | null {
  const sharps = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const flats = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  if (fifths === 0) return null;
  return fifths > 0 ? sharps[fifths] : flats[-fifths];
}

/** Ordnet einen Klick einem Takt, System, Zeitpunkt und einer Tonhöhe zu. */
export function hitTest(
  layout: ScoreLayout,
  measures: Measure[],
  x: number,
  y: number,
): { measure: number; staff: number; tick: number; pitch: Pitch; fraction: number } | null {
  const ml = layout.measures.find((m) => x >= m.left && x <= m.right && m.staves.some((s) => y >= s.top && y <= s.bottom));
  if (!ml) return null;
  const staff = ml.staves.findIndex((s) => y >= s.top && y <= s.bottom);
  if (staff < 0) return null;
  const m = measures[ml.index];
  const fraction = Math.max(0, Math.min(0.9999, (x - ml.x0) / (ml.x1 - ml.x0)));
  const tick = m.start + fraction * m.ticks;
  return { measure: ml.index, staff, tick, pitch: pitchFromY(ml.staves[staff], y), fraction };
}
