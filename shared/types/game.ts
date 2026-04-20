// 게임 핵심 도메인 타입

export type Fraction = {
  numerator: number;
  denominator: number;
};

export type SessionCode = string;
export type TeamId = string;
export type StudentId = string;

export type ActId = 1 | 2 | 3 | 4;

// ===== 학생 정보 (대기/게임 공통) =====
export type StudentInfo = {
  id: StudentId;
  name: string;
  connected: boolean; // 현재 소켓 연결 여부 (재접속 대기 중이면 false)
};

// ===== 1막: 전력망 동기화 =====
export type Act1State = {
  selections: (1 | 2 | null)[]; // 학생 4명의 경로 선택
  currentSum: Fraction | null;
};

// ===== 2막: 냉각수 코어 식별 =====
export type CoreColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export type Act2State = {
  scaleLeft: CoreColor[];
  scaleRight: CoreColor[];
  submittedCore: CoreColor | null;
  revealedClues: Record<StudentId, string>; // 학생별 자기 단서
};

// ===== 3막: AI 오버라이드 암호 =====
export type DiskId = 'A' | 'B' | 'C' | 'D';

export type Act3State = {
  overlayPair: [DiskId, DiskId] | null;
  passcode: (number | null)[]; // 4자리
};

// ===== 4막: 최종 제어실 =====
export type Act4LeverPosition = 12 | 3 | 6 | 9;

export type Act4State = {
  levers: Record<Act4LeverPosition, Fraction | null>;
  confirmedBy: StudentId[];
};

export type ActState = Act1State | Act2State | Act3State | Act4State;

// ===== 대기창용 팀 (게임 상태 없음) =====
export type TeamLobby = {
  id: TeamId;
  name: string;
  students: StudentInfo[];
};

// ===== 게임용 팀 상태 (4막 전체 진행 상태 포함) =====
export type TeamState = {
  teamId: TeamId;
  teamName: string;
  students: StudentInfo[];
  currentAct: ActId;
  act1: Act1State;
  act2: Act2State;
  act3: Act3State;
  act4: Act4State;
  completedActs: ActId[];
  startedAt: number | null;
  completedAt: number | null;
};

// ===== 세션 전체 상태 (대기창~게임 통합) =====
export type SessionPhase = 'waiting' | 'playing' | 'ended';

export type SessionState = {
  code: SessionCode;
  teacherId: number;
  phase: SessionPhase;
  unassignedStudents: StudentInfo[];
  teams: TeamLobby[]; // 대기창용 경량 팀 정보
  createdAt: number;
  startedAt: number | null;
};
