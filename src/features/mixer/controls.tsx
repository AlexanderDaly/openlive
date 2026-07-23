/**
 * controls.tsx — shared mixer controls (Meter, VerticalFader, PanKnob, MiniSlider).
 * Mixer feature folder only; no edits outside `src/features/mixer/`.
 */
import { useEffect, useRef, useState } from 'react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------------ */
/* Level meter (rAF-driven, segmented, gradient-free)                  */
/* ------------------------------------------------------------------ */

/** Minimal structural type for Tone.Meter (normalRange) — avoids importing Tone. */
export interface MeterLike {
  getValue(): number | number[];
}

/** Subscribe to an engine meter getter at ~30fps. Safe when undefined (pre-audio-start). */
export function useMeterLevel(read: () => MeterLike | undefined): number {
  const [level, setLevel] = useState(0);
  const readRef = useRef(read);

  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 33) return; // ~30 fps is plenty for a meter
      last = t;
      const meter = readRef.current();
      let v = 0;
      if (meter) {
        try {
          const raw = meter.getValue();
          const n = Array.isArray(raw) ? Math.max(0, ...raw) : raw;
          if (Number.isFinite(n)) v = clamp(n, 0, 1);
        } catch {
          v = 0; // engine not ready yet — stay dark
        }
      }
      setLevel((prev) => (Math.abs(prev - v) > 0.004 ? v : Math.max(v, prev * 0.92)));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return level;
}

const SEGMENTS = 14;

/** Segment color by index from the TOP: top 2 red, next 3 amber, rest green. */
function segmentColor(fromTop: number): string {
  if (fromTop < 2) return '#e0483c';
  if (fromTop < 5) return '#e0a43c';
  return '#5cb56a';
}

export function Meter({ level }: { level: number }) {
  return (
    <div className="flex h-full w-2.5 flex-col-reverse gap-[2px]" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        // i = 0 is the BOTTOM segment
        const lit = level >= (i + 0.5) / SEGMENTS;
        const color = segmentColor(SEGMENTS - 1 - i);
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{ backgroundColor: lit ? color : '#262626' }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vertical fader (custom pointer-drag control)                        */
/* ------------------------------------------------------------------ */

interface VerticalFaderProps {
  value: number; // 0..1
  onChange: (v: number) => void;
  defaultValue?: number; // double-click reset target
  accent?: string;
  height?: number;
  title?: string;
}

export function VerticalFader({
  value,
  onChange,
  defaultValue,
  accent = '#ff8c2e',
  height = 96,
  title,
}: VerticalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onChange(clamp(1 - (clientY - rect.top) / rect.height, 0, 1));
  };

  return (
    <div
      ref={trackRef}
      title={title}
      className="relative w-4 cursor-ns-resize touch-none select-none"
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromClientY(e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) setFromClientY(e.clientY);
      }}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
    >
      {/* rail */}
      <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-[#0d0d0d]" />
      {/* fill (solid, no gradient) */}
      <div
        className="absolute bottom-0 left-1/2 w-[3px] -translate-x-1/2"
        style={{ height: `${value * 100}%`, backgroundColor: accent }}
      />
      {/* handle */}
      <div
        className="absolute left-1/2 h-[9px] w-4 -translate-x-1/2 translate-y-1/2 rounded-[2px] border border-black bg-[#3a3a3a]"
        style={{ bottom: `${value * 100}%` }}
      >
        <div className="absolute left-[2px] right-[2px] top-1/2 h-px -translate-y-1/2 bg-[#d8d8d8]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pan knob (rotary, vertical drag; double-click resets to center)     */
/* ------------------------------------------------------------------ */

interface PanKnobProps {
  value: number; // -1..1
  onChange: (v: number) => void;
}

export function PanKnob({ value, onChange }: PanKnobProps) {
  const drag = useRef<{ startY: number; startValue: number } | null>(null);
  // -135deg (hard left) .. +135deg (hard right)
  const angle = value * 135;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative h-7 w-7 cursor-ns-resize touch-none select-none rounded-full border border-[#3a3a3a] bg-[#222]"
        title={`Pan ${value === 0 ? 'C' : value < 0 ? `${Math.round(-value * 100)}L` : `${Math.round(value * 100)}R`} — drag, double-click to center`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startY: e.clientY, startValue: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current || !(e.buttons & 1)) return;
          const dv = (drag.current.startY - e.clientY) / 60;
          onChange(clamp(drag.current.startValue + dv, -1, 1));
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange(0)}
      >
        {/* indicator line */}
        <div
          className="absolute left-1/2 top-1/2 h-[11px] w-[2px] origin-bottom -translate-x-1/2"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, backgroundColor: '#ff8c2e' }}
        />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#444]" />
      </div>
      <span className="text-[8px] font-medium uppercase tracking-wider text-neutral-500">
        {value === 0 ? 'C' : value < 0 ? `${Math.round(-value * 100)}L` : `${Math.round(value * 100)}R`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mini horizontal slider for FX params (supports log scale)           */
/* ------------------------------------------------------------------ */

interface MiniSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  log?: boolean;
}

export function MiniSlider({ label, value, min, max, onChange, format, log }: MiniSliderProps) {
  const toT = (v: number) =>
    log ? Math.log(clamp(v, min, max) / min) / Math.log(max / min) : (v - min) / (max - min);
  const fromT = (t: number) => (log ? min * Math.pow(max / min, t) : min + t * (max - min));

  return (
    <div className="flex items-center gap-1" title={format ? format(value) : undefined}>
      <span className="w-6 shrink-0 text-[8px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={clamp(toT(value), 0, 1)}
        onChange={(e) => onChange(fromT(Number(e.target.value)))}
        className="h-3 min-w-0 flex-1 cursor-pointer accent-[#ff8c2e]"
      />
      <span className="w-7 shrink-0 text-right text-[8px] tabular-nums text-neutral-400">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}
