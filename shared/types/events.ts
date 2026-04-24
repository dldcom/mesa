// Socket.io 이벤트 타입 (클라 ↔ 서버 공유)

import type {
  ActId,
  SessionCode,
  StudentId,
  StudentSlot,
  TeamId,
  TeamState,
  SessionState,
  CoreColor,
  DiskId,
  Act4LeverPosition,
  Fraction,
} from './game';

// ============ 서버 → 클라이언트 ============
export interface ServerToClientEvents {
  // 학생/공통
  'session:joined': (data: { sessionCode: SessionCode; studentId: StudentId; phase: import('./game').SessionPhase }) => void;
  'session:state': (state: Pick<SessionState, 'phase' | 'unassignedStudents' | 'teams'>) => void;
  'team:assigned': (data: { teamId: TeamId; teamName: string }) => void;
  'team:state': (state: TeamState) => void;

  // 게임 진행
  'game:started': (data: { teamId: TeamId; slot: StudentSlot }) => void;
  'puzzle:solved': (data: { act: ActId; nextAct: ActId | null }) => void;
  'puzzle:failed': (data: { act: ActId; reason: string }) => void;

  // 교사 대시보드
  'teacher:sessionState': (state: SessionState) => void;

  // 공통
  'error': (data: { code: string; message: string }) => void;
}

// ============ 클라이언트 → 서버 ============
export interface ClientToServerEvents {
  // 학생
  'student:enter': (data: {
    sessionCode: SessionCode;
    name: string;
    reconnectId?: StudentId; // 재접속 시도 시 이전 studentId
  }) => void;
  'student:leave': () => void;

  // 교사 — 세션 관리
  'teacher:joinSession': (data: { sessionCode: SessionCode }) => void;
  'teacher:createTeam': (data: { teamName: string }) => void;
  'teacher:removeTeam': (data: { teamId: TeamId }) => void;
  'teacher:assignToTeam': (data: { studentId: StudentId; teamId: TeamId }) => void;
  'teacher:unassignStudent': (data: { studentId: StudentId }) => void;
  'teacher:autoAssign': () => void;
  'teacher:startGame': () => void;

  // 퍼즐 조작 (discriminated union)
  'puzzle:action': (action: PuzzleAction) => void;
}

// ============ 막별 퍼즐 조작 ============
export type PuzzleAction =
  | { act: 1; type: 'selectPath'; choice: 1 | 2 | null }
  | { act: 1; type: 'confirm' }
  | { act: 2; type: 'placeCoreOnScale'; core: CoreColor; side: 'left' | 'right' }
  | { act: 2; type: 'clearScale' }
  | { act: 2; type: 'submitCore'; core: CoreColor }
  | { act: 3; type: 'overlayDisks'; pair: [DiskId, DiskId] }
  | { act: 3; type: 'setPasscodeDigit'; index: 0 | 1 | 2 | 3; value: number }
  | { act: 3; type: 'submitPasscode' }
  | { act: 4; type: 'setLever'; position: Act4LeverPosition; value: Fraction }
  | { act: 4; type: 'confirm' }
  | { act: 4; type: 'cancelConfirm' };
