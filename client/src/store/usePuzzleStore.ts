// 퍼즐 로컬 상태 (솔로 테스트용)
// 지금은 브라우저 메모리만 사용. 멀티 붙일 때 selectPath/confirm 구현을
// socket.emit 으로 바꾸고, 서버 broadcast 를 구독해 상태를 갱신하면 됨.

import { create } from 'zustand';
import type { Fraction } from '@shared/types/game';
import {
  ACT1_PUZZLE,
  ACT1_TARGET,
  evaluateAct1,
  type Act1Evaluation,
  type PathChoice,
  type StudentSlot,
} from '@shared/lib/act1Logic';

type Phase = 'selecting' | 'submitting' | 'solved' | 'failed';

type Act1LocalState = {
  open: boolean;
  phase: Phase;
  selections: Record<StudentSlot, PathChoice | null>;
  evaluation: Act1Evaluation | null;
};

type PuzzleStore = Act1LocalState & {
  openAct1: () => void;
  closeAct1: () => void;
  selectPath: (slot: StudentSlot, choice: PathChoice) => void;
  confirmAct1: () => void;
  resetAct1: () => void;
};

const initial: Act1LocalState = {
  open: false,
  phase: 'selecting',
  selections: { A: null, B: null, C: null, D: null },
  evaluation: null,
};

export const usePuzzleStore = create<PuzzleStore>((set, get) => ({
  ...initial,

  openAct1: () => set({ open: true }),
  closeAct1: () => set({ open: false }),

  selectPath: (slot, choice) =>
    set((s) => ({
      selections: { ...s.selections, [slot]: choice },
      // 선택 바뀌면 이전 평가 결과 무효화
      phase: 'selecting',
      evaluation: null,
    })),

  confirmAct1: () => {
    const { selections } = get();
    // 4명 모두 선택됐는지 확인
    if (
      selections.A == null ||
      selections.B == null ||
      selections.C == null ||
      selections.D == null
    ) {
      return;
    }
    set({ phase: 'submitting' });
    const evaluation = evaluateAct1({
      A: selections.A,
      B: selections.B,
      C: selections.C,
      D: selections.D,
    });
    set({
      evaluation,
      phase: evaluation.status === 'solved' ? 'solved' : 'failed',
    });
  },

  resetAct1: () => set({ ...initial, open: true }),
}));

// UI 가 편하게 꺼내 쓰도록 정적 데이터도 re-export
export { ACT1_PUZZLE, ACT1_TARGET };
export type { PathChoice, StudentSlot, Act1Evaluation };

// 참고: 현재 Fraction 타입은 여전히 @shared 에서 가져옴
export type { Fraction };
