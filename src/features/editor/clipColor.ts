/**
 * Local workaround: the fixed store contract exposes no clip-color action
 * (only renameClip / updateClipNotes / ...). zustand's public `setState`
 * lets us patch the clip's color through the store itself, keeping clips
 * the single source of truth without editing the store file.
 */
import { useProjectStore } from '@/store/projectStore';

export function setClipColor(clipId: string, color: string): void {
  useProjectStore.setState((s) => {
    const clip = s.clips[clipId];
    if (!clip) return {};
    return { clips: { ...s.clips, [clipId]: { ...clip, color } } };
  });
}
