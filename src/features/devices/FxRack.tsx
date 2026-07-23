/**
 * FxRack — Ableton-style device chain strip: Reverb → Delay → Filter.
 * One knob per card is wired to a real store param via `setFxParam`
 * (reverb, delay, filterFreq); secondary knobs are visual-only macros.
 * The per-device power toggle is visual (dims/bypasses the card) and
 * does not mutate the stored values.
 */
import { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import type { FxParam, Track } from '@/types/daw';
import Knob from './Knob';

const formatHz = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
const format01 = (v: number): string => v.toFixed(2);

interface DeviceDef {
  id: 'reverb' | 'delay' | 'filter';
  name: string;
}

const DEVICES: DeviceDef[] = [
  { id: 'reverb', name: 'Reverb' },
  { id: 'delay', name: 'Delay' },
  { id: 'filter', name: 'Filter' },
];

interface FxRackProps {
  track: Track;
}

export default function FxRack({ track }: FxRackProps) {
  const setFxParam = useProjectStore((s) => s.setFxParam);
  const [power, setPower] = useState<Record<DeviceDef['id'], boolean>>({
    reverb: true,
    delay: true,
    filter: true,
  });
  // Visual-only macro state for secondary knobs (no engine params exist).
  const [macro, setMacro] = useState({ decay: 0.5, time: 0.4, feedback: 0.35, reso: 0.3 });

  const setFx = (param: FxParam) => (v: number) => setFxParam(track.id, param, v);

  const knobsFor = (id: DeviceDef['id']) => {
    switch (id) {
      case 'reverb':
        return (
          <>
            <Knob
              label="Amount"
              value={track.fx.reverb}
              min={0}
              max={1}
              defaultValue={0.2}
              formatValue={format01}
              onChange={setFx('reverb')}
            />
            <Knob
              label="Decay"
              value={macro.decay}
              min={0}
              max={1}
              formatValue={format01}
              onChange={(v) => setMacro((m) => ({ ...m, decay: v }))}
            />
          </>
        );
      case 'delay':
        return (
          <>
            <Knob
              label="Amount"
              value={track.fx.delay}
              min={0}
              max={1}
              defaultValue={0}
              formatValue={format01}
              onChange={setFx('delay')}
            />
            <Knob
              label="Time"
              value={macro.time}
              min={0}
              max={1}
              formatValue={format01}
              onChange={(v) => setMacro((m) => ({ ...m, time: v }))}
            />
            <Knob
              label="Fdbk"
              value={macro.feedback}
              min={0}
              max={1}
              formatValue={format01}
              onChange={(v) => setMacro((m) => ({ ...m, feedback: v }))}
            />
          </>
        );
      case 'filter':
        return (
          <>
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
            <Knob
              label="Res"
              value={macro.reso}
              min={0}
              max={1}
              formatValue={format01}
              onChange={(v) => setMacro((m) => ({ ...m, reso: v }))}
            />
          </>
        );
    }
  };

  return (
    <div className="p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-widest text-neutral-400 uppercase">
          FX Chain
        </span>
        <span className="text-[8px] tracking-wider text-neutral-600 uppercase">
          {track.name}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {DEVICES.map((device) => {
          const on = power[device.id];
          return (
            <div
              key={device.id}
              className={`flex items-center gap-2 rounded-sm border bg-[#1c1c1c] px-2 py-1.5 transition-opacity ${
                on ? 'border-[#333]' : 'border-[#2a2a2a] opacity-50'
              }`}
            >
              {/* power toggle (visual) */}
              <button
                type="button"
                onClick={() => setPower((p) => ({ ...p, [device.id]: !p[device.id] }))}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border ${
                  on ? 'border-[#ff8c2e] bg-[#ff8c2e]' : 'border-[#3a3a3a] bg-[#222]'
                }`}
                title={`${device.name} power (visual)`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-black' : 'bg-[#3a3a3a]'}`}
                />
              </button>
              <span
                className={`w-11 shrink-0 text-[9px] font-semibold tracking-widest uppercase ${
                  on ? 'text-neutral-300' : 'text-neutral-600'
                }`}
              >
                {device.name}
              </span>
              <div className={`flex flex-1 justify-end gap-1 ${on ? '' : 'pointer-events-none'}`}>
                {knobsFor(device.id)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
