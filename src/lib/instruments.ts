/**
 * Shared instrument metadata for the app shell (owned by the foundation).
 * Used by the BrowserPanel (drag sources / click-to-add) and App.tsx
 * (center-view drop target) to create tracks with a matching instrument.
 */
import type { InstrumentKind, Track, TrackType } from '@/types/daw';

/** DataTransfer MIME type for dragging an instrument out of the browser. */
export const INSTRUMENT_DRAG_TYPE = 'application/x-openlive-instrument';

export interface InstrumentMeta {
  kind: InstrumentKind;
  /** Browser list label. */
  label: string;
  /** New-track base name ("Drums 2", "Bass 1", ...). */
  trackName: string;
  color: string;
  type: TrackType;
}

export const INSTRUMENTS: InstrumentMeta[] = [
  { kind: 'drumkit', label: 'Drum Kit', trackName: 'Drums', color: '#e05c5c', type: 'drums' },
  { kind: 'bass', label: 'Bass', trackName: 'Bass', color: '#e0a43c', type: 'midi' },
  { kind: 'keys', label: 'Keys', trackName: 'Keys', color: '#5cb56a', type: 'midi' },
];

export function instrumentMeta(kind: InstrumentKind): InstrumentMeta {
  return INSTRUMENTS.find((m) => m.kind === kind) ?? (INSTRUMENTS[2] as InstrumentMeta);
}

/** `addTrack` init payload for a new track playing this instrument. */
export function instrumentTrackInit(
  kind: InstrumentKind,
  existingTracks: Track[],
): Partial<Omit<Track, 'id'>> {
  const meta = instrumentMeta(kind);
  const count = existingTracks.filter((t) => t.instrument === meta.kind).length;
  return {
    name: `${meta.trackName} ${count + 1}`,
    type: meta.type,
    instrument: meta.kind,
    color: meta.color,
  };
}
