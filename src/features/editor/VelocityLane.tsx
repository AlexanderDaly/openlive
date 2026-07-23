/**
 * Velocity lane below the step grid. One column per step, aligned with
 * the grid cells. Drag vertically inside a column to set velocity 0..1;
 * dragging to the very bottom removes the note(s) at that step.
 */
import type { PointerEvent } from 'react';

interface VelocityLaneProps {
  steps: number;
  color: string;
  /** Tailwind width class matching the grid's row-label column. */
  labelWidthClass: string;
  /** Playhead column (-1 when stopped). */
  highlightStep: number;
  /** Current velocity for a column, or null when no note exists there. */
  valueAt: (step: number) => number | null;
  /** Set velocity (0..1) or remove (null) at a step. */
  onSet: (step: number, value: number | null) => void;
}

export default function VelocityLane({
  steps,
  color,
  labelWidthClass,
  highlightStep,
  valueAt,
  onSet,
}: VelocityLaneProps) {
  const setFromEvent = (step: number, e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = 1 - (e.clientY - rect.top) / rect.height;
    const v = Math.min(1, Math.max(0, raw));
    onSet(step, v <= 0.06 ? null : Math.round(v * 100) / 100);
  };

  return (
    <div className="mt-1.5 flex items-end">
      <div
        className={`${labelWidthClass} shrink-0 pr-2 text-right text-[9px] uppercase tracking-wider text-neutral-600`}
      >
        vel
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: steps }, (_, step) => {
          const v = valueAt(step);
          return (
            <div
              key={step}
              className={`relative h-9 w-6 shrink-0 cursor-ns-resize rounded-[2px] bg-[#1c1c1c] ${
                step % 4 === 0 && step > 0 ? 'ml-[5px]' : ''
              } ${step === highlightStep ? 'ring-1 ring-inset ring-white/30' : ''}`}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                setFromEvent(step, e);
              }}
              onPointerMove={(e) => {
                if (e.buttons & 1) setFromEvent(step, e);
              }}
            >
              {v !== null && (
                <div
                  className="pointer-events-none absolute inset-x-[3px] bottom-[3px] rounded-[1px]"
                  style={{
                    height: `${Math.max(10, Math.round(v * 84))}%`,
                    backgroundColor: color,
                    opacity: 0.35 + 0.65 * v,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
