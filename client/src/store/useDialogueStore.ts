// 다이얼로그 큐 상태.
// Phaser 씬과 React 컴포넌트 모두가 직접 접근해 공유하는 단일 출처.
// 마지막 줄에 choices 가 있으면 선택 UI 가 뜨고, 선택 결과가 onResolve 로 전달됨.
// 대화가 선택 없이 그냥 끝나거나 close() 로 닫히면 onResolve(null).

import { create } from 'zustand';

export type DialogueChoice = { label: string; value: string };
export type DialogueLine = {
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
};
export type DialogueScript = Record<string, DialogueLine[]>;

type Resolver = (value: string | null) => void;

type DialogueStore = {
  lines: DialogueLine[];
  index: number;
  open: boolean;
  onResolve: Resolver | null;
  show: (lines: DialogueLine[], onResolve?: Resolver) => void;
  next: () => void;
  choose: (value: string) => void;
  close: () => void;
};

export const useDialogueStore = create<DialogueStore>((set, get) => ({
  lines: [],
  index: 0,
  open: false,
  onResolve: null,

  show: (lines, onResolve) => {
    if (!lines.length) return;
    set({ lines, index: 0, open: true, onResolve: onResolve ?? null });
  },

  next: () => {
    const { lines, index, onResolve } = get();
    // 선택지 있는 줄에서는 next 로 넘어가지 않음 (반드시 choose 필요)
    if (lines[index]?.choices?.length) return;
    if (index + 1 >= lines.length) {
      set({ open: false, lines: [], index: 0, onResolve: null });
      onResolve?.(null);
    } else {
      set({ index: index + 1 });
    }
  },

  choose: (value) => {
    const cb = get().onResolve;
    set({ open: false, lines: [], index: 0, onResolve: null });
    cb?.(value);
  },

  close: () => {
    const cb = get().onResolve;
    set({ open: false, lines: [], index: 0, onResolve: null });
    cb?.(null);
  },
}));
