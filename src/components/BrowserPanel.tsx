/**
 * BrowserPanel — left rail of the DAW shell (owned by the foundation).
 * Instrument / FX categories + Beatbox-style ASCII sound-field visualizer.
 */
import { Drum, Music, Piano, Waves, Clock3, SlidersHorizontal } from 'lucide-react';
import AsciiWave from '@/components/AsciiWave';

interface Item {
  icon: React.ReactNode;
  label: string;
  hint: string;
}

function Category({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </p>
      <ul>
        {items.map((it) => (
          <li
            key={it.label}
            title={it.hint}
            className="flex cursor-grab items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-neutral-300 hover:bg-[#2b2b2b]"
          >
            <span className="text-[#ff8c2e]">{it.icon}</span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrowserPanel() {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-neutral-800 bg-[#1e1e1e] p-2">
      <p className="mb-2 shrink-0 px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
        Browser
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Category
          title="Instruments"
          items={[
            { icon: <Drum size={14} />, label: 'Drum Kit', hint: 'Drag onto a MIDI track (drumkit)' },
            { icon: <Music size={14} />, label: 'Bass', hint: 'Drag onto a track (monosynth bass)' },
            { icon: <Piano size={14} />, label: 'Keys', hint: 'Drag onto a track (polysynth keys)' },
          ]}
        />
        <Category
          title="Audio FX"
          items={[
            { icon: <Waves size={14} />, label: 'Reverb', hint: 'Send FX — adjust in the device rack' },
            { icon: <Clock3 size={14} />, label: 'Delay', hint: 'Send FX — adjust in the device rack' },
            { icon: <SlidersHorizontal size={14} />, label: 'Filter', hint: 'Per-track low-pass filter' },
          ]}
        />
      </div>

      {/* Beatbox-style ASCII sound field — live master-level reactive */}
      <div className="mt-2 shrink-0">
        <AsciiWave />
        <p className="mt-1.5 px-1 text-[9px] leading-relaxed text-neutral-600">
          ASCII wave reacts to master level. Press ▶ to go ON AIR.
        </p>
      </div>
    </aside>
  );
}
