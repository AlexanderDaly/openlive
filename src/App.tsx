/**
 * OpenLive — app shell (owned by the foundation).
 * Full-viewport dark DAW layout:
 *   top    TransportBar
 *   left   BrowserPanel | center SessionView/ArrangementView | right MixerPanel
 *   bottom DetailPanel (ClipEditor + DeviceRack)
 */
import TransportBar from '@/components/TransportBar';
import BrowserPanel from '@/components/BrowserPanel';
import DetailPanel from '@/components/DetailPanel';
import SessionView from '@/features/session/SessionView';
import ArrangementView from '@/features/arrangement/ArrangementView';
import MixerPanel from '@/features/mixer/MixerPanel';
import { useProjectStore } from '@/store/projectStore';

export default function App() {
  const view = useProjectStore((s) => s.view);

  return (
    <div className="grid h-screen w-screen grid-cols-[220px_1fr_280px] grid-rows-[48px_1fr_240px] overflow-hidden bg-[#1a1a1a] text-neutral-200">
      {/* Transport — full width */}
      <div className="col-span-3">
        <TransportBar />
      </div>

      {/* Browser — left, spans center + detail rows */}
      <div className="row-span-2 min-h-0">
        <BrowserPanel />
      </div>

      {/* Center — session or arrangement */}
      <main className="min-h-0 min-w-0">
        {view === 'session' ? <SessionView /> : <ArrangementView />}
      </main>

      {/* Mixer — right, spans center + detail rows */}
      <div className="row-span-2 min-h-0">
        <MixerPanel />
      </div>

      {/* Detail — bottom center */}
      <div className="min-h-0 min-w-0">
        <DetailPanel />
      </div>
    </div>
  );
}
