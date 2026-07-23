/**
 * Knob — small reusable rotary control (Ableton-style).
 * Drag vertically to change the value; double-click resets to default.
 * Supports linear or logarithmic (frequency) mapping.
 */
import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  defaultValue?: number;
  /** Logarithmic mapping (for filterFreq-style params). */
  log?: boolean;
  /** Diameter in px. */
  size?: number;
  formatValue?: (value: number) => string;
  disabled?: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export default function Knob({
  label,
  value,
  min,
  max,
  onChange,
  defaultValue,
  log = false,
  size = 40,
  formatValue,
  disabled = false,
}: KnobProps) {
  const drag = useRef<{ pointerId: number; startY: number; startNorm: number } | null>(null);

  const toNorm = (v: number): number =>
    log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  const fromNorm = (n: number): number =>
    log ? min * Math.pow(max / min, n) : min + n * (max - min);

  const norm = clamp01(toNorm(Math.min(max, Math.max(min, value))));

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startNorm: norm };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return;
    // 160 px of vertical travel = full range.
    const next = clamp01(drag.current.startNorm + (drag.current.startY - e.clientY) / 160);
    onChange(fromNorm(next));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  const onDoubleClick = () => {
    if (disabled || defaultValue === undefined) return;
    onChange(defaultValue);
  };

  // ---- arc geometry: 270° sweep from 135° to 405° (clockwise over the top) ----
  const stroke = 3;
  const r = size / 2 - stroke / 2 - 1;
  const c = size / 2;
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(c + r * Math.cos(rad)).toFixed(2)} ${(c + r * Math.sin(rad)).toFixed(2)}`;
  };
  const trackPath = `M ${pt(135)} A ${r} ${r} 0 1 1 ${pt(405)}`;
  const valueDeg = 135 + norm * 270;
  const valuePath =
    norm > 0.004
      ? `M ${pt(135)} A ${r} ${r} 0 ${valueDeg - 135 > 180 ? 1 : 0} 1 ${pt(valueDeg)}`
      : null;
  // pointer line inside the dial
  const innerR = r * 0.55;
  const lineEnd = (() => {
    const rad = (valueDeg * Math.PI) / 180;
    return {
      x: c + innerR * Math.cos(rad),
      y: c + innerR * Math.sin(rad),
    };
  })();

  const display = formatValue ? formatValue(value) : value.toFixed(2);

  return (
    <div
      className={`flex w-[52px] flex-col items-center gap-0.5 select-none ${
        disabled ? 'pointer-events-none opacity-35' : ''
      }`}
    >
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        className="cursor-ns-resize touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        title={`${label}: ${display} (drag up/down, double-click to reset)`}
      >
        <svg width={size} height={size} className="block">
          <circle cx={c} cy={c} r={r + 1.5} fill="#141414" stroke="#333" strokeWidth={1} />
          <path d={trackPath} fill="none" stroke="#3a3a3a" strokeWidth={stroke} strokeLinecap="round" />
          {valuePath && (
            <path
              d={valuePath}
              fill="none"
              stroke="#ff8c2e"
              strokeWidth={stroke}
              strokeLinecap="round"
            />
          )}
          <line
            x1={c}
            y1={c}
            x2={lineEnd.x.toFixed(2)}
            y2={lineEnd.y.toFixed(2)}
            stroke="#d4d4d4"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-[8px] font-semibold tracking-widest text-neutral-500 uppercase">
        {label}
      </span>
      <span className="text-[9px] leading-none text-neutral-300 tabular-nums">{display}</span>
    </div>
  );
}
