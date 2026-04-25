// 1막 상태창용 Zustand 스토어.
// Phaser 씬이 상태 변화를 이 스토어에 푸시하고, React 사이드 패널이 구독해서 렌더.

import { create } from 'zustand';
import type { PathChoice, StudentSlot } from '@shared/types/game';

type Act1Store = {
  visible: boolean;
  currentSlot: StudentSlot;
  selections: Record<StudentSlot, PathChoice | null>;
  show: (
    currentSlot: StudentSlot,
    selections: Record<StudentSlot, PathChoice | null>
  ) => void;
  sync: (
    currentSlot: StudentSlot,
    selections: Record<StudentSlot, PathChoice | null>
  ) => void;
  hide: () => void;
};

export const useAct1Store = create<Act1Store>((set) => ({
  visible: false,
  currentSlot: 'A',
  selections: { A: null, B: null, C: null, D: null },
  show: (currentSlot, selections) =>
    set({ visible: true, currentSlot, selections: { ...selections } }),
  sync: (currentSlot, selections) =>
    set({ currentSlot, selections: { ...selections } }),
  hide: () => set({ visible: false }),
}));
