/**
 * SynthPanel — macro panel for bass/keys tracks.
 * The cutoff knob is wired to the real `filterFreq` fx param via
 * `setFxParam`. Resonance and the ADSR envelope are visual-only macros
 * (the fixed engine/store contract exposes no such params) and are kept
 * as local component state, clearly labelled as macros.
 */
import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { useProjectStore } from '@/store/projectStore';
import type { Track } from '@/types/daw';
import Knob from './Knob';

const formatHz = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

interface SynthPanelProps {
  track: Track;
}

export default function SynthPanel({ track }: SynthPanelProps) {
  const setFxParam = useProjectStore((s) => s.setFxParam);

  // Visual-only macro state (no matching engine params in the contract).
  const [resonance, setResonance] = useState(0.35);
  const [env, setEnv] = useState({ a: 0.05, d: 0.3, s: 0.6, r: 0.25 });

  const envSliders = [
    { key: 'a' as const, label: 'A' },
    { key: 'd' as const, label: 'D' },
    { key: 's' as const, label: 'S' },
    { key: 'r' as const, label: 'R' },
  ];

  return (
    <div className="border-b border-neutral-800 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-widest text-neutral-400 uppercase">
          {track.instrument === 'bass' ? 'Mono Synth' : 'Poly Synth'}
        </span>
        <span className="text-[8px] tracking-wider text-neutral-600 uppercase">
          {track.instrument}
        </span>
      </div>

      <div className="flex items-start gap-2">
        {/* Real param: filter cutoff */}
        <Knob
          label="Cutoff"
          value={track.fx.filterFreq}
          min={20}
          max={18000}
          log
          defaultValue={18000}
          formatValue={formatHz}
          onChange={(v) => setFxParam(track.id, 'filterFreq', Math.round(v))}
        />

        {/* Visual-only macro: resonance */}
        <div className="flex flex-1 flex-col gap-1 rounded-sm border border-[#2a2a2a] bg-[#1c1c1c] p-2">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-semibold tracking-widest text-neutral-500 uppercase">
              Resonance
            </span>
            <span className="text-[8px] text-neutral-600 uppercase">macro</span>
          </div>
          <Slider
            value={[resonance]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => setResonance(v ?? 0)}
            className="w-full"
          />
          <div className="mt-1 flex items-end justify-between gap-2">
            <div className="flex items-end gap-1.5">
              {envSliders.map(({ key, label }) => (
                <div key={key} className="flex flex-col items-center gap-0.5">
                  <Slider
                    orientation="vertical"
                    value={[env[key]]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={([v]) => setEnv((e) => ({ ...e, [key]: v ?? 0 }))}
                    className="h-10 data-[orientation=vertical]:min-h-10"
                  />
                  <span className="text-[8px] font-semibold text-neutral-500">{label}</span>
                </div>
              ))}
            </div>
            <span className="text-[8px] leading-tight text-neutral-600 uppercase">
              envelope
              <br />
              visual only
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
