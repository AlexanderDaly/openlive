/**
 * Polls the audio engine's transport step via requestAnimationFrame and
 * returns the current step index (0 .. lengthSteps-1) within the clip,
 * or -1 when the transport is stopped / position is unavailable.
 * Tick-based (engine.getTransportStep), so clips with lengthSteps != 16
 * stay aligned.
 */
import { useEffect, useState } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';

export function usePlayheadStep(lengthSteps: number): number {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      try {
        const absolute = engine.getTransportStep();
        const len = Math.max(1, lengthSteps);
        const s = ((absolute % len) + len) % len;
        setStep((prev) => (prev === s ? prev : s));
      } catch {
        /* engine not unlocked yet — keep last step */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, lengthSteps]);

  // Derive stopped state without setState-in-effect.
  return isPlaying ? step : -1;
}
