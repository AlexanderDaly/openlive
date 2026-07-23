/**
 * Polls the audio engine's transport position via requestAnimationFrame
 * and returns the current step index (0 .. lengthSteps-1) within the clip,
 * or -1 when the transport is stopped / position is unavailable.
 */
import { useEffect, useState } from 'react';
import { engine } from '@/audio/engine';
import { useProjectStore } from '@/store/projectStore';
import { STEPS_PER_BAR } from '@/types/daw';

export function usePlayheadStep(lengthSteps: number): number {
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      try {
        const pos = engine.getTransportPosition(); // 'bars:beats:sixteenths'
        const parts = pos.split(':').map(Number);
        if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
          const [bars = 0, beats = 0, six = 0] = parts;
          const absolute = Math.floor(bars * STEPS_PER_BAR + beats * 4 + six);
          const len = Math.max(1, lengthSteps);
          const s = ((absolute % len) + len) % len;
          setStep((prev) => (prev === s ? prev : s));
        }
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
