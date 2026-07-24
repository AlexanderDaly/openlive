/**
 * Thin wrapper kept for editor-folder imports: the store now exposes a
 * real `setClipColor` action (the old zustand `setState` workaround from
 * before the contract grew this action is gone).
 */
import { useProjectStore } from '@/store/projectStore';

export function setClipColor(clipId: string, color: string): void {
  useProjectStore.getState().setClipColor(clipId, color);
}
