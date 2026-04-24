// 다이얼로그 큐 상태.
// Phaser 씬과 React 컴포넌트 모두가 직접 접근해 공유하는 단일 출처.

import { create } from 'zustand';

export type DialogueLine = { speaker: string; text: string };
export type DialogueScript = Record<string, DialogueLine[]>;

type DialogueStore = {
  lines: DialogueLine[];
  index: number;
  open: boolean;
  show: (lines: DialogueLine[]) => void;
  next: () => void;
  close: () => void;
};

export const useDialogueStore = create<DialogueStore>((set, get) => ({
  lines: [],
  index: 0,
  open: false,

  show: (lines) => {
    if (!lines.length) return;
    set({ lines, index: 0, open: true });
  },

  next: () => {
    const { lines, index } = get();
    if (index + 1 >= lines.length) {
      set({ open: false, lines: [], index: 0 });
    } else {
      set({ index: index + 1 });
    }
  },

  close: () => set({ open: false, lines: [], index: 0 }),
}));
