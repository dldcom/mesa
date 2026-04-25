// 2막 상태창용 Zustand 스토어.
// Phaser 씬이 마운트/언마운트 시 visible 토글 + 본인 슬롯 푸시.
// 단서 자체는 ACT2_CLUES 에서 정적으로 가져옴 (서버 동기화 불필요).

import { create } from 'zustand';
import type { StudentSlot } from '@shared/types/game';

type Act2Store = {
  visible: boolean;
  slot: StudentSlot | null;
  show: (slot: StudentSlot) => void;
  hide: () => void;
};

export const useAct2Store = create<Act2Store>((set) => ({
  visible: false,
  slot: null,
  show: (slot) => set({ visible: true, slot }),
  hide: () => set({ visible: false }),
}));
