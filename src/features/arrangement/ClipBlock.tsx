/**
 * ClipBlock — a single arrangement clip on the timeline.
 * Owned by the Arrangement agent.
 *
 * Interactions:
 *  - click                -> select underlying pool clip (store.selectClip)
 *  - drag body horizontally -> moveArrangementClip (bar-snapped, live preview)
 *  - drag right edge        -> resizeArrangementClip (min 1 bar)
 *  - double-click / ×       -> onRequestRemove (confirm dialog in ArrangementView)
 */
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ArrangementClip, Clip } from '@/types/daw';
import { useProjectStore } from '@/store/projectStore';
import { PatternThumb } from './PatternThumb';

interface DragState {
  mode: 'move' | 'resize';
  startX: number;
  origStart: number;
  origLen: number;
  moved: boolean;
  finalStart: number;
  finalLen: number;
}

interface Props {
  ac: ArrangementClip;
  clip: Clip;
  pxPerBar: number;
  selected: boolean;
  onSelect: (arrangementClipId: string) => void;
  onRequestRemove: (arrangementClipId: string) => void;
}

/** Append an alpha byte to a '#rrggbb' color. */
function withAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex + alpha : hex;
}

export function ClipBlock({ ac, clip, pxPerBar, selected, onSelect, onRequestRemove }: Props) {
  const moveArrangementClip = useProjectStore((s) => s.moveArrangementClip);
  const resizeArrangementClip = useProjectStore((s) => s.resizeArrangementClip);
  const selectClip = useProjectStore((s) => s.selectClip);

  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<{ startBar: number; lengthBars: number } | null>(null);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, mode: DragState['mode']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      origStart: ac.startBar,
      origLen: ac.lengthBars,
      moved: false,
      finalStart: ac.startBar,
      finalLen: ac.lengthBars,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    const dBars = Math.round(dx / pxPerBar);
    if (d.mode === 'move') {
      d.finalStart = Math.max(0, d.origStart + dBars);
    } else {
      d.finalLen = Math.max(1, d.origLen + dBars);
    }
    setPreview({ startBar: d.finalStart, lengthBars: d.finalLen });
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setPreview(null);
    if (d.moved) {
      if (d.mode === 'move') {
        if (d.finalStart !== d.origStart) moveArrangementClip(ac.id, d.finalStart);
      } else if (d.finalLen !== d.origLen) {
        resizeArrangementClip(ac.id, d.finalLen);
      }
    } else if (d.mode === 'move') {
      // Plain click: select this block + the underlying pool clip.
      onSelect(ac.id);
      selectClip(clip.id);
    }
  };

  const startBar = preview?.startBar ?? ac.startBar;
  const lengthBars = preview?.lengthBars ?? ac.lengthBars;
  const left = startBar * pxPerBar;
  const width = Math.max(pxPerBar, lengthBars * pxPerBar);

  return (
    <div
      className="group absolute top-1 bottom-1 touch-none overflow-hidden rounded-[3px] border select-none"
      style={{
        left,
        width,
        backgroundColor: withAlpha(clip.color, '2e'),
        borderColor: selected ? '#ff8c2e' : withAlpha(clip.color, 'aa'),
        boxShadow: selected ? '0 0 0 1px #ff8c2e' : undefined,
        cursor: 'grab',
      }}
      title={`${clip.name} — bar ${ac.startBar + 1}, ${ac.lengthBars} bar${ac.lengthBars > 1 ? 's' : ''} (drag to move, right edge to resize, double-click to delete)`}
      onPointerDown={(e) => startDrag(e, 'move')}
      onPointerMove={onDragMove}
      onPointerUp={endDrag}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRequestRemove(ac.id);
      }}
    >
      {/* header strip */}
      <div
        className="flex h-4 items-center gap-1 pr-4 pl-1.5"
        style={{ backgroundColor: withAlpha(clip.color, '59') }}
      >
        <span className="truncate text-[9px] font-semibold tracking-wider text-neutral-100 uppercase">
          {clip.name}
        </span>
      </div>

      {/* pattern thumbnail */}
      <div className="h-[calc(100%-16px)] px-1 py-0.5 opacity-70">
        <PatternThumb clip={clip} />
      </div>

      {/* delete button (hover) */}
      <button
        type="button"
        aria-label="Remove arrangement clip"
        className="absolute top-0 right-0 hidden h-4 w-4 items-center justify-center text-[10px] leading-none text-neutral-300 group-hover:flex hover:bg-black/40 hover:text-white"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRequestRemove(ac.id);
        }}
      >
        ×
      </button>

      {/* resize handle (right edge) */}
      <div
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/20"
        onPointerDown={(e) => startDrag(e, 'resize')}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
      />
    </div>
  );
}
