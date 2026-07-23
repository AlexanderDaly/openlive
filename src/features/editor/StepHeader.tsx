/**
 * Beat-number header row aligned with the step grid columns.
 */
interface StepHeaderProps {
  steps: number;
  /** Tailwind width class matching the grid's row-label column. */
  labelWidthClass: string;
}

export default function StepHeader({ steps, labelWidthClass }: StepHeaderProps) {
  return (
    <div className="mb-1 flex items-center">
      <div className={`${labelWidthClass} shrink-0`} />
      <div className="flex gap-[3px]">
        {Array.from({ length: steps }, (_, s) => (
          <div
            key={s}
            className={`w-6 shrink-0 text-center text-[8px] tabular-nums ${
              s % 4 === 0 && s > 0 ? 'ml-[5px]' : ''
            } ${s % 4 === 0 ? 'text-neutral-500' : 'text-neutral-700'}`}
          >
            {s % 4 === 0 ? s / 4 + 1 : '·'}
          </div>
        ))}
      </div>
    </div>
  );
}
