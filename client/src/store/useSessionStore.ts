import { create } from 'zustand';
import type {
  SessionCode,
  StudentId,
  TeamId,
  SessionState,
} from '@shared/types/game';

// 세션 대기창 스냅샷 (학생·교사 공용 경량 타입)
export type LightSnapshot = Pick<SessionState, 'phase' | 'unassignedStudents' | 'teams'>;

// ============ localStorage 영속화 ============
const STORAGE_KEY = 'mesa_student_session';

export type SavedStudentSession = {
  sessionCode: SessionCode;
  studentId: StudentId;
  name: string;
};

export const saveStudentSession = (data: SavedStudentSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const loadStudentSession = (): SavedStudentSession | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
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
  localStorage.removeItem(STORAGE_KEY);
};

// ============ Zustand 스토어 ============
type SessionStore = {
  sessionCode: SessionCode | null;
  studentId: StudentId | null;
  studentName: string | null;

  snapshot: LightSnapshot | null;

  gameStarted: boolean;
  myTeamId: TeamId | null;

  setStudentIdentity: (code: SessionCode, studentId: StudentId, name: string) => void;
  setSessionCode: (code: SessionCode | null) => void;
  setSnapshot: (snap: LightSnapshot) => void;
  markGameStarted: (teamId: TeamId) => void;
  reset: () => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  sessionCode: null,
  studentId: null,
  studentName: null,
  snapshot: null,
  gameStarted: false,
  myTeamId: null,

  setStudentIdentity: (code, studentId, name) =>
    set({ sessionCode: code, studentId, studentName: name }),

  setSessionCode: (code) => set({ sessionCode: code }),

  setSnapshot: (snap) => set({ snapshot: snap }),

  markGameStarted: (teamId) => set({ gameStarted: true, myTeamId: teamId }),

  reset: () =>
    set({
      sessionCode: null,
      studentId: null,
      studentName: null,
      snapshot: null,
      gameStarted: false,
      myTeamId: null,
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
