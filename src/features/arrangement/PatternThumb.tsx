/**
 * PatternThumb — tiny canvas rendering of a clip's step pattern,
 * used inside arrangement clip blocks. Owned by the Arrangement agent.
 */
import { useEffect, useRef } from 'react';
import type { Clip } from '@/types/daw';

const SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

/** 'F#3' -> midi number; falls back to 0 for unparseable names. */
function noteToMidi(note: string): number {
  const m = /^([A-G]#?)(-?\d+)$/.exec(note);
  if (!m) return 0;
  const semi = SEMITONES[m[1] as string];
  if (semi === undefined) return 0;
  return semi + (parseInt(m[2] as string, 10) + 1) * 12;
}

export function PatternThumb({ clip }: { clip: Clip }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 2 || h < 2) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const notes = clip.notes;
      if (!notes.length || clip.lengthSteps <= 0) return;

      const midis = notes.map((n) => noteToMidi(n.note));
      const lo = Math.min(...midis);
      const hi = Math.max(...midis);
      const span = Math.max(1, hi - lo);

      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!n) continue;
        const x = (n.step / clip.lengthSteps) * w;
        const nw = Math.max(1.5, (((n.duration ?? 1) / clip.lengthSteps) * w) - 0.5);
        const y = h - 2 - (((midis[i] ?? 0) - lo) / span) * (h - 4);
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, Math.max(0, n.velocity));
        ctx.fillRect(x, y - 1, nw, 2);
      }
      ctx.globalAlpha = 1;
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [clip]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
