/**
 * useTransportStep — polls `engine.getTransportPosition()` via rAF and
 * returns the absolute 16th-note step index (bars*16 + beats*4 + sixteenth).
 * Only re-renders when the step actually changes. Returns 0 when stopped
 * or when the engine has not been unlocked yet (meters/getters may be
 * undefined before the first user gesture).
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
      const pos = engine.getTransportPosition(); // 'bars:beats:sixteenths'
      const parts = pos.split(':');
      const bars = Number.parseInt(parts[0] ?? '0', 10) || 0;
      const beats = Number.parseInt(parts[1] ?? '0', 10) || 0;
      const sixteenths = Number.parseFloat(parts[2] ?? '0') || 0;
      const s = bars * 16 + beats * 4 + Math.floor(sixteenths);
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
