import { create } from 'zustand';
import type {
  SessionCode,
  TeamId,
  StudentId,
  ActId,
  TeamState,
} from '@shared/types/game';

type GameStore = {
  // 세션 정보
  sessionCode: SessionCode | null;
  studentId: StudentId | null;
  studentName: string | null;
  teamId: TeamId | null;

  // 팀 상태 (서버에서 broadcast 받음)
  teamState: TeamState | null;

  // 현재 진행 중인 막
  currentAct: ActId | null;

  // 액션
  setSession: (code: SessionCode, studentId: StudentId, name: string) => void;
  setTeam: (teamId: TeamId) => void;
  setTeamState: (state: TeamState) => void;
  setCurrentAct: (act: ActId) => void;
  reset: () => void;
};

export const useGameStore = create<GameStore>((set) => ({
  sessionCode: null,
  studentId: null,
  studentName: null,
  teamId: null,
  teamState: null,
  currentAct: null,

  setSession: (code, studentId, name) =>
    set({ sessionCode: code, studentId, studentName: name }),
  setTeam: (teamId) => set({ teamId }),
  setTeamState: (state) => set({ teamState: state, currentAct: state.currentAct }),
  setCurrentAct: (act) => set({ currentAct: act }),
  reset: () =>
    set({
      sessionCode: null,
      studentId: null,
      studentName: null,
      teamId: null,
      teamState: null,
      currentAct: null,
    }),
}));
