/**
 * useMeterLevel — subscribe to an engine meter getter at ~30fps.
 * Lives in its own file (not controls.tsx) so component files only export
 * components (react-refresh rule). Mixer feature folder only.
 */
import { useEffect, useRef, useState } from 'react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Minimal structural type for Tone.Meter (normalRange) — avoids importing Tone. */
export interface MeterLike {
  getValue(): number | number[];
}

/** Safe when the getter returns undefined (pre-audio-start). */
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
