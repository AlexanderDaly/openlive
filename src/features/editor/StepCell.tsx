/**
 * Shared step cell for the drum grid and melodic piano-roll.
 * Left-click toggles, shift-click / right-click cycles velocity,
 * pointer-drag paints (handled by the parent via onPaintEnter).
 */
import type { PointerEvent } from 'react';

interface StepCellProps {
  active: boolean;
  velocity: number;
  color: string;
  /** True when the transport playhead is on this column. */
  highlight: boolean;
  /** True at each beat boundary (step % 4 === 0, step > 0). */
  beatStart: boolean;
  size: 'md' | 'sm';
  /** Tailwind classes for the empty state (varies per row/context). */
  inactiveClassName: string;
  onToggle: () => void;
  onCycleVelocity: () => void;
  onPaintEnter: () => void;
}

export default function StepCell({
  active,
  velocity,
  color,
  highlight,
  beatStart,
  size,
  inactiveClassName,
  onToggle,
  onCycleVelocity,
  onPaintEnter,
}: StepCellProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`relative shrink-0 rounded-[2px] outline-none ${
        size === 'md' ? 'h-6 w-6' : 'h-4 w-6'
      } ${beatStart ? 'ml-[5px]' : ''} ${active ? '' : inactiveClassName}`}
      style={
        active
          ? { backgroundColor: color, opacity: 0.3 + 0.7 * Math.min(1, Math.max(0, velocity)) }
          : undefined
      }
      onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        if (e.button !== 0) return;
        if (e.shiftKey) onCycleVelocity();
        else onToggle();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onCycleVelocity();
      }}
      onPointerEnter={(e) => {
        if (e.buttons & 1) onPaintEnter();
      }}
    >
      {highlight && (
        <span className="pointer-events-none absolute inset-0 rounded-[2px] bg-white/10 ring-1 ring-inset ring-white/50" />
      )}
    </button>
  );
}
