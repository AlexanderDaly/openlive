/**
 * useTransportStep — polls `engine.getTransportStep()` via rAF and returns
 * the absolute 16th-note step index (tick-derived, so it stays correct for
 * non-bar-aligned positions). Only re-renders when the step actually
 * changes. Returns 0 when stopped or before the engine is unlocked.
 */
import { useEffect, useState } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';

export function useTransportStep(): number {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isPlaying || !engine.isStarted()) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const s = engine.getTransportStep();
      if (s !== last) {
        last = s;
        setStep(s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Derive stopped state without setState-in-effect.
  return isPlaying ? step : 0;
}
