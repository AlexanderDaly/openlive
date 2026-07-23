/**
 * AsciiWave — Beatbox-style generative ASCII sound-field visualizer.
 * Driven by the master meter + transport; idle shimmer when stopped.
 * Renders via a single <pre> updated on rAF (no React re-render per frame).
 */
import { useEffect, useRef } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';

/** Density ladder — quiet → loud (Beatbox-ish glyph set). */
const GLYPHS = [' ', '.', '-', '+', '/', '(', ')', '*', 'K', '▲', '#'] as const;
const HOT = new Set(['*', 'K', '▲', '#', ')']);

function levelToGlyph(n: number, jitter: number): string {
  const t = Math.min(1, Math.max(0, n + jitter * 0.12));
  const idx = Math.min(GLYPHS.length - 1, Math.floor(t * GLYPHS.length));
  return GLYPHS[idx] ?? ' ';
}

/** Cheap deterministic noise from (x, y, frame). */
function hash(x: number, y: number, f: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + f * 0.017) * 43758.5453;
  return n - Math.floor(n);
}

interface AsciiWaveProps {
  /** Flat strip for the transport bar (no header chrome). */
  compact?: boolean;
  className?: string;
}

export default function AsciiWave({ compact = false, className = '' }: AsciiWaveProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const fieldRef = useRef<Float32Array>(new Float32Array(1));
  const frameRef = useRef(0);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const bpm = useProjectStore((s) => s.bpm);

  // Sidebar is ~200px → ~28 cols; transport strip can be wider.
  const cols = compact ? 42 : 28;
  const rows = compact ? 2 : 11;

  useEffect(() => {
    fieldRef.current = new Float32Array(cols * rows);
    let raf = 0;
    let last = 0;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      // ~24fps is enough for ASCII and keeps CPU light
      if (t - last < 40) return;
      last = t;
      frameRef.current += 1;
      const f = frameRef.current;

      let level = 0;
      try {
        const meter = engine.getMasterMeter();
        if (meter) {
          const raw = meter.getValue();
          const n = typeof raw === 'number' ? raw : Array.isArray(raw) ? Math.max(0, ...raw) : 0;
          if (Number.isFinite(n)) level = Math.min(1, Math.max(0, n));
        }
      } catch {
        level = 0;
      }

      const state = useProjectStore.getState();
      const playing = state.isPlaying;
      const tempo = state.bpm;
      // Soft idle shimmer when stopped; full reactive field when playing.
      const pulse = playing
        ? 0.35 + 0.65 * level + 0.08 * Math.sin((f * tempo) / 400)
        : 0.05 + 0.04 * Math.sin(f * 0.05);

      const field = fieldRef.current;
      const mid = (rows - 1) / 2;
      for (let y = 0; y < rows; y++) {
        const vFall = 1 - Math.min(1, Math.abs(y - mid) / (mid + 0.5));
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const wave =
            0.55 * Math.sin(x * 0.35 + f * 0.09) +
            0.25 * Math.sin(x * 0.11 - f * 0.05 + y * 0.4) +
            0.2 * hash(x, y, f);
          const target = pulse * vFall * (0.45 + 0.55 * (0.5 + 0.5 * wave));
          // Attack/release envelope so glyphs smear like a phosphor trail
          const cur = field[i] ?? 0;
          field[i] = cur + (target - cur) * (target > cur ? 0.55 : 0.18);
        }
      }

      const el = preRef.current;
      if (!el) return;

      let html = '';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = field[y * cols + x] ?? 0;
          const g = levelToGlyph(v, hash(x + 3, y + 7, f) - 0.5);
          if (g === ' ') {
            html += ' ';
          } else if (HOT.has(g) && v > 0.55) {
            html += `<span class="aw-hot">${g}</span>`;
          } else if (v > 0.28) {
            html += `<span class="aw-mid">${g}</span>`;
          } else {
            html += g;
          }
        }
        if (y < rows - 1) html += '\n';
      }
      el.innerHTML = html;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cols, rows]);

  if (compact) {
    return (
      <div
        className={`relative flex items-center gap-2 overflow-hidden ${className}`}
        title="ASCII master wave — reacts to level"
      >
        <span
          className={`shrink-0 text-[8px] font-bold tracking-[0.15em] uppercase ${
            isPlaying ? 'text-[#22d3ee]' : 'text-neutral-600'
          }`}
        >
          {isPlaying ? '● ON AIR' : '○ IDLE'}
        </span>
        <pre
          ref={preRef}
          aria-hidden
          className="m-0 min-w-0 flex-1 overflow-hidden font-mono text-[9px] leading-[1.05] text-[#3d6a7a] select-none"
          style={{ letterSpacing: '0.04em' }}
        />
        <style>{`
          .aw-mid { color: #5eb8d4; }
          .aw-hot { color: #22d3ee; text-shadow: 0 0 6px rgba(34, 211, 238, 0.45); }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-sm border border-[#1e3a4a] bg-[#0a0e12] ${className}`}
      title="ASCII sound field — reacts to master level"
    >
      <div className="flex items-center justify-between border-b border-[#152830] px-2 py-0.5">
        <span className="text-[8px] font-semibold tracking-[0.2em] text-[#3d7a94] uppercase">
          Wave
        </span>
        <span
          className={`flex items-center gap-1 text-[8px] font-bold tracking-[0.15em] uppercase ${
            isPlaying ? 'text-[#22d3ee]' : 'text-[#2a4a58]'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isPlaying ? 'animate-pulse bg-[#22d3ee]' : 'bg-[#1a3038]'
            }`}
          />
          {isPlaying ? 'ON AIR' : 'IDLE'}
          <span className="ml-1 tabular-nums text-[#2a4a58]">{bpm}</span>
        </span>
      </div>
      <pre
        ref={preRef}
        aria-hidden
        className="m-0 overflow-hidden px-1.5 py-1 font-mono text-[10px] leading-[1.15] text-[#3d6a7a] select-none"
        style={{ letterSpacing: '0.05em' }}
      />
      <style>{`
        .aw-mid { color: #5eb8d4; }
        .aw-hot { color: #22d3ee; text-shadow: 0 0 6px rgba(34, 211, 238, 0.45); }
      `}</style>
    </div>
  );
}
