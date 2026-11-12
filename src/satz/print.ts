import { Measure } from '../dictation/model';
import { SNote } from './model';
import { MarkLine, NoteStyle, TextRow, renderSatz } from './render';

export interface PrintOptions {
  title: string;
  subtitle: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  measures: Measure[];
  voices: SNote[][];
  noteStyles?: Record<string, NoteStyle>;
  lines?: MarkLine[];
  textRows?: TextRow[][];
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Opens a print view of the setting (black on white). In the print dialog the
 * user chooses "Save as PDF".
 */
export function printSatz(o: PrintOptions) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px;--fg:#000;--muted:#555;--accent:#000;--accent-soft:#fff;color:#000;';
  document.body.appendChild(host);
  try {
    renderSatz(host, {
      keyFifths: o.keyFifths,
      beats: o.beats,
      beatType: o.beatType,
      measures: o.measures,
      voices: o.voices,
      width: 1000,
      scale: 1,
      pxPerQuarter: 40,
      noteStyles: o.noteStyles,
      lines: o.lines,
      textRows: o.textRows?.map((r) => r.map((t) => ({ ...t, color: t.color?.startsWith('var(') ? undefined : t.color }))),
      showLyrics: true,
    });
    const svg = host.innerHTML;
    const w = window.open('', '_blank');
    if (!w) {
      alert('Das Druckfenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.');
      return;
    }
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(o.title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#000;background:#fff}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#444;font-size:13px}svg{max-width:100%;height:auto}@page{margin:15mm}</style>
</head><body><h1>${esc(o.title)}</h1><p>${esc(o.subtitle)}</p>${svg}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  } finally {
    host.remove();
  }
}
