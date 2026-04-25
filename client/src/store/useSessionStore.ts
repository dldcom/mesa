import { create } from 'zustand';
import type {
  SessionCode,
  StudentId,
  StudentSlot,
  TeamId,
  SessionState,
  Character,
} from '@shared/types/game';

// 세션 대기창 스냅샷 (학생·교사 공용 경량 타입)
export type LightSnapshot = Pick<SessionState, 'phase' | 'unassignedStudents' | 'teams'>;

// ============ sessionStorage 영속화 ============
// sessionStorage 를 쓰는 이유: 같은 시크릿 프로필의 여러 창이 localStorage 를 공유해서
// 4명 테스트 시 마지막 창만 유지되는 문제가 있음. sessionStorage 는 탭별로 분리되고
// F5 새로고침엔 살아남으므로, "탭 닫으면 세션 종료"로 의미가 더 깔끔해짐.
const STORAGE_KEY = 'mesa_student_session';

export type SavedStudentSession = {
  sessionCode: SessionCode;
  studentId: StudentId;
  name: string;
};

export const saveStudentSession = (data: SavedStudentSession) => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const loadStudentSession = (): SavedStudentSession | null => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedStudentSession;
    if (!parsed.sessionCode || !parsed.studentId || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearStudentSession = () => {
  sessionStorage.removeItem(STORAGE_KEY);
};

// ============ Zustand 스토어 ============
type SessionStore = {
  sessionCode: SessionCode | null;
  studentId: StudentId | null;
  studentName: string | null;

  snapshot: LightSnapshot | null;

  gameStarted: boolean;
  myTeamId: TeamId | null;
  mySlot: StudentSlot | null;
  myCharacter: Character | null;

  setStudentIdentity: (code: SessionCode, studentId: StudentId, name: string) => void;
  setSessionCode: (code: SessionCode | null) => void;
  setSnapshot: (snap: LightSnapshot) => void;
  markGameStarted: (teamId: TeamId, slot: StudentSlot, character: Character) => void;
  reset: () => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  sessionCode: null,
  studentId: null,
  studentName: null,
  snapshot: null,
  gameStarted: false,
  myTeamId: null,
  mySlot: null,
  myCharacter: null,

  setStudentIdentity: (code, studentId, name) =>
    set({ sessionCode: code, studentId, studentName: name }),

  setSessionCode: (code) => set({ sessionCode: code }),

  setSnapshot: (snap) => set({ snapshot: snap }),

  markGameStarted: (teamId, slot, character) =>
    set({ gameStarted: true, myTeamId: teamId, mySlot: slot, myCharacter: character }),

  reset: () =>
    set({
      sessionCode: null,
      studentId: null,
      studentName: null,
      snapshot: null,
      gameStarted: false,
      myTeamId: null,
      mySlot: null,
      myCharacter: null,
    }),
}));

// ============ 헬퍼 ============
export const isUnassigned = (
  snap: LightSnapshot | null,
  studentId: StudentId | null
): boolean => {
  if (!snap || !studentId) return true;
  return snap.unassignedStudents.some((s) => s.id === studentId);
};

export const findMyTeam = (
  snap: LightSnapshot | null,
  studentId: StudentId | null
): { id: TeamId; name: string } | null => {
  if (!snap || !studentId) return null;
  for (const t of snap.teams) {
    if (t.students.some((s) => s.id === studentId)) return { id: t.id, name: t.name };
  }
  return null;
};
