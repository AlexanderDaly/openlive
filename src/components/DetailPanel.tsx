/**
 * DetailPanel — bottom strip of the DAW shell (owned by the foundation).
 * Hosts the feature-owned ClipEditor and DeviceRack side by side.
 */
import ClipEditor from '@/features/editor/ClipEditor';
import DeviceRack from '@/features/devices/DeviceRack';

export default function DetailPanel() {
  return (
    <section className="grid h-full grid-cols-[1fr_320px] border-t border-neutral-800 bg-[#202020]">
      <ClipEditor />
      <DeviceRack />
    </section>
  );
}
