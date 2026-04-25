// 메모리 기반 세션 상태 매니저
// 서버 재시작 시 모두 날아감 (의도적 — 1회성 수업 + 같은 날 이어서 할 일 없음)

import type {
  SessionCode,
  StudentId,
  StudentInfo,
  StudentSlot,
  PathChoice,
  TeamId,
  TeamState,
  SessionState,
  SessionPhase,
  Character,
} from '../../../shared/types/game';
import { evaluateAct1, type Act1Evaluation } from '../../../shared/lib/act1Logic';
import {
  evaluateAct2,
  type Act2Evaluation,
  ACT2_CORE_COLORS,
  ACT2_CORE_WEIGHTS,
} from '../../../shared/lib/act2Logic';
import { CHARACTER_IDS } from '../../../shared/lib/characters';
import type { CoreColor, ScaleTilt, Act2State } from '../../../shared/types/game';
import { compare } from '../../../shared/lib/fraction';

const SLOT_ORDER: StudentSlot[] = ['A', 'B', 'C', 'D'];

// 팀 내 빈 슬롯 찾기 (A → B → C → D 순)
const firstEmptySlot = (students: StudentInfo[]): StudentSlot | null => {
  const taken = new Set(students.map((s) => s.slot).filter(Boolean));
  for (const s of SLOT_ORDER) if (!taken.has(s)) return s;
  return null;
};

// 혼동하기 쉬운 글자 (0/O, 1/I, Z, S 등) 제외
const CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXY2346789';

const makeId = (): string => Math.random().toString(36).substring(2, 10);

const makeSessionCode = (): SessionCode => {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
};

const emptyTeamState = (teamId: TeamId, teamName: string): TeamState => ({
  teamId,
  teamName,
  students: [],
  currentAct: 1,
  act1: { selections: { A: null, B: null, C: null, D: null } },
  act2: { scaleLeft: null, scaleRight: null, scaleTilt: 'empty', submittedCore: null },
  act3: { overlayPair: null, passcode: [null, null, null, null] },
  act4: { levers: { 12: null, 3: null, 6: null, 9: null }, confirmedBy: [] },
  completedActs: [],
  startedAt: null,
  completedAt: null,
});

export class SessionManager {
  private sessions = new Map<SessionCode, SessionState>();

  // 게임 진행 중인 팀의 권위 있는 상태 (startGame 시 생성, 퍼즐 액션으로 갱신)
  private teamStates = new Map<TeamId, TeamState>();

  // 학생 ↔ 세션/소켓 관계
  private studentToSession = new Map<StudentId, SessionCode>();
  private socketToStudent = new Map<string, StudentId>();
  private studentToSocket = new Map<StudentId, string>();

  // 교사
  private socketToTeacherSession = new Map<string, SessionCode>();

  // ===== 세션 생성 =====
  createSession(teacherId: number): SessionCode {
    let code: SessionCode;
    do {
      code = makeSessionCode();
    } while (this.sessions.has(code));

    this.sessions.set(code, {
      code,
      teacherId,
      phase: 'waiting',
      unassignedStudents: [],
      teams: [],
      createdAt: Date.now(),
      startedAt: null,
    });
    return code;
  }

  getSession(code: SessionCode): SessionState | undefined {
    return this.sessions.get(code);
  }

  // ===== 교사 소켓 연결 =====
  attachTeacherSocket(code: SessionCode, socketId: string): boolean {
    if (!this.sessions.has(code)) return false;
    this.socketToTeacherSession.set(socketId, code);
    return true;
  }

  getTeacherSessionCode(socketId: string): SessionCode | undefined {
    return this.socketToTeacherSession.get(socketId);
  }

  detachTeacherSocket(socketId: string) {
    this.socketToTeacherSession.delete(socketId);
  }

  // ===== 학생 내부 탐색 헬퍼 =====
  private findStudentInSession(
    session: SessionState,
    studentId: StudentId
  ): StudentInfo | null {
    const u = session.unassignedStudents.find((s) => s.id === studentId);
    if (u) return u;
    for (const t of session.teams) {
      const s = t.students.find((x) => x.id === studentId);
      if (s) return s;
    }
    return null;
  }

  // ===== 학생 입장 (신규 or 재접속) =====
  addStudent(
    code: SessionCode,
    name: string,
    socketId: string,
    reconnectId?: StudentId
  ):
    | { ok: true; studentId: StudentId; phase: SessionPhase; reconnected: boolean }
    | { ok: false; reason: string } {
    const session = this.sessions.get(code);
    if (!session) {
      return { ok: false, reason: '존재하지 않는 세션 코드입니다.' };
    }

    // --- 재접속 시도 ---
    if (reconnectId) {
      const existing = this.findStudentInSession(session, reconnectId);
      if (existing) {
        // 이전 소켓 매핑 정리
        const oldSocketId = this.studentToSocket.get(reconnectId);
        if (oldSocketId && oldSocketId !== socketId) {
          this.socketToStudent.delete(oldSocketId);
        }
        existing.connected = true;
        this.socketToStudent.set(socketId, reconnectId);
        this.studentToSocket.set(reconnectId, socketId);
        return {
          ok: true,
          studentId: reconnectId,
          phase: session.phase,
          reconnected: true,
        };
      }
      // reconnectId 가 유효하지 않으면 → 아래 신규 입장 경로로 fall through
    }

    // --- 신규 입장 ---
    if (session.phase !== 'waiting') {
      return {
        ok: false,
        reason:
          '이미 게임이 시작된 세션입니다. 이전에 참여한 적 있다면 같은 태블릿에서 다시 접속해 주세요.',
      };
    }

    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: '이름을 입력해주세요.' };

    const all = [
      ...session.unassignedStudents,
      ...session.teams.flatMap((t) => t.students),
    ];
    if (all.some((s) => s.name === trimmed)) {
      return {
        ok: false,
        reason: '같은 이름이 이미 있습니다. 다르게 적어주세요.',
      };
    }

    const studentId = makeId();
    const newStudent: StudentInfo = {
      id: studentId,
      name: trimmed,
      connected: true,
    };
    session.unassignedStudents.push(newStudent);
    this.studentToSession.set(studentId, code);
    this.socketToStudent.set(socketId, studentId);
    this.studentToSocket.set(studentId, socketId);

    return { ok: true, studentId, phase: session.phase, reconnected: false };
  }

  // ===== 학생 연결 끊김 (제거 X, 표시만) =====
  markStudentDisconnected(
    socketId: string
  ): { sessionCode: SessionCode; studentId: StudentId } | null {
    const studentId = this.socketToStudent.get(socketId);
    if (!studentId) return null;
    const code = this.studentToSession.get(studentId);
    if (!code) return null;
    const session = this.sessions.get(code);
    if (!session) return null;

    const student = this.findStudentInSession(session, studentId);
    if (student) student.connected = false;

    this.socketToStudent.delete(socketId);
    this.studentToSocket.delete(studentId);
    // studentToSession 은 유지 (재접속을 위해)

    return { sessionCode: code, studentId };
  }

  // ===== 학생 명시적 제거 (교사 또는 학생 본인이 나가겠다 선언) =====
  removeStudentPermanently(studentId: StudentId): SessionCode | null {
    const code = this.studentToSession.get(studentId);
    if (!code) return null;
    const session = this.sessions.get(code);
    if (!session) return null;

    session.unassignedStudents = session.unassignedStudents.filter(
      (s) => s.id !== studentId
    );
    for (const t of session.teams) {
      t.students = t.students.filter((s) => s.id !== studentId);
    }

    const socketId = this.studentToSocket.get(studentId);
    if (socketId) this.socketToStudent.delete(socketId);
    this.studentToSocket.delete(studentId);
    this.studentToSession.delete(studentId);

    return code;
  }

  getStudentSessionCode(socketId: string): SessionCode | undefined {
    const studentId = this.socketToStudent.get(socketId);
    if (!studentId) return undefined;
    return this.studentToSession.get(studentId);
  }

  getStudentIdBySocket(socketId: string): StudentId | null {
    return this.socketToStudent.get(socketId) ?? null;
  }

  // ===== 팀 관리 =====
  createTeam(code: SessionCode, teamName: string): TeamId | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    const teamId = makeId();
    session.teams.push({
      id: teamId,
      name: teamName.trim() || `팀${session.teams.length + 1}`,
      students: [],
    });
    return teamId;
  }

  removeTeam(code: SessionCode, teamId: TeamId): boolean {
    const session = this.sessions.get(code);
    if (!session) return false;
    const team = session.teams.find((t) => t.id === teamId);
    if (!team) return false;

    for (const s of team.students) delete s.slot;
    session.unassignedStudents.push(...team.students);
    session.teams = session.teams.filter((t) => t.id !== teamId);
    return true;
  }

  assignStudentToTeam(
    code: SessionCode,
    studentId: StudentId,
    teamId: TeamId
  ): { ok: boolean; reason?: string } {
    const session = this.sessions.get(code);
    if (!session) return { ok: false, reason: '세션 없음' };

    const team = session.teams.find((t) => t.id === teamId);
    if (!team) return { ok: false, reason: '팀 없음' };
    if (team.students.length >= 4)
      return { ok: false, reason: '팀 인원이 이미 4명입니다.' };

    let student: StudentInfo | undefined;
    student = session.unassignedStudents.find((s) => s.id === studentId);
    if (student) {
      session.unassignedStudents = session.unassignedStudents.filter(
        (s) => s.id !== studentId
      );
    } else {
      for (const t of session.teams) {
        const found = t.students.find((s) => s.id === studentId);
        if (found) {
          student = found;
          t.students = t.students.filter((s) => s.id !== studentId);
          break;
        }
      }
    }
    if (!student) return { ok: false, reason: '학생을 찾을 수 없음' };

    // 팀 내 빈 슬롯 부여
    const slot = firstEmptySlot(team.students);
    if (slot) student.slot = slot;

    // 새 팀 안에 같은 캐릭터를 이미 누가 골랐다면 충돌 → 본인의 캐릭터 클리어
    if (student.character) {
      const taken = new Set(team.students.map((s) => s.character).filter(Boolean));
      if (taken.has(student.character)) delete student.character;
    }

    team.students.push(student);
    return { ok: true };
  }

  // ===== 캐릭터 선택 =====
  // 팀 배정 후에만 허용. 같은 팀 안에서는 유니크.
  setStudentCharacter(
    studentId: StudentId,
    character: Character | null
  ): { ok: boolean; reason?: string; sessionCode?: SessionCode } {
    const code = this.studentToSession.get(studentId);
    if (!code) return { ok: false, reason: '세션을 찾을 수 없습니다.' };
    const session = this.sessions.get(code);
    if (!session) return { ok: false, reason: '세션 없음' };

    if (character !== null && !(CHARACTER_IDS as readonly string[]).includes(character)) {
      return { ok: false, reason: '알 수 없는 캐릭터입니다.' };
    }

    // 팀 안에 있는지 (= 배정됐는지) 확인
    const team = session.teams.find((t) =>
      t.students.some((s) => s.id === studentId)
    );
    if (!team) {
      return { ok: false, reason: '팀에 배정된 후에 캐릭터를 고를 수 있어요.', sessionCode: code };
    }
    const student = team.students.find((s) => s.id === studentId)!;

    if (character === null) {
      delete student.character;
      return { ok: true, sessionCode: code };
    }

    // 같은 팀 내 충돌 검사
    const conflict = team.students.find(
      (s) => s.id !== studentId && s.character === character
    );
    if (conflict) {
      return { ok: false, reason: `${conflict.name} 친구가 이미 선택했어요.`, sessionCode: code };
    }

    student.character = character;
    return { ok: true, sessionCode: code };
  }

  // 게임 시작 직전 호출: 각 팀 안에서 캐릭터를 안 고른 학생에게 남은 캐릭터 중 하나 무작위 배정.
  private autoAssignCharacters(session: SessionState): void {
    for (const team of session.teams) {
      const taken = new Set(team.students.map((s) => s.character).filter(Boolean));
      const available = CHARACTER_IDS.filter((c) => !taken.has(c));
      // 셔플
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [available[i], available[j]] = [available[j], available[i]];
      }
      for (const s of team.students) {
        if (s.character) continue;
        const next = available.shift();
        if (next) s.character = next;
      }
    }
  }

  unassignStudent(
    code: SessionCode,
    studentId: StudentId
  ): { ok: boolean; reason?: string } {
    const session = this.sessions.get(code);
    if (!session) return { ok: false, reason: '세션 없음' };

    for (const t of session.teams) {
      const found = t.students.find((s) => s.id === studentId);
      if (found) {
        t.students = t.students.filter((s) => s.id !== studentId);
        delete found.slot; // 슬롯 해제
        session.unassignedStudents.push(found);
        return { ok: true };
      }
    }
    return { ok: false, reason: '배정된 학생이 아닙니다.' };
  }

  // ===== 자동 배정 =====
  autoAssign(code: SessionCode): { ok: boolean; reason?: string } {
    const session = this.sessions.get(code);
    if (!session) return { ok: false, reason: '세션 없음' };

    const pool = [...session.unassignedStudents];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const pushWithSlot = (team: { students: StudentInfo[] }, s: StudentInfo) => {
      const slot = firstEmptySlot(team.students);
      if (slot) s.slot = slot;
      team.students.push(s);
    };

    for (const team of session.teams) {
      while (team.students.length < 4 && pool.length > 0) {
        pushWithSlot(team, pool.shift()!);
      }
    }

    while (pool.length > 0) {
      const newTeamId = makeId();
      const newTeam = {
        id: newTeamId,
        name: `팀${session.teams.length + 1}`,
        students: [] as StudentInfo[],
      };
      while (newTeam.students.length < 4 && pool.length > 0) {
        pushWithSlot(newTeam, pool.shift()!);
      }
      session.teams.push(newTeam);
    }

    session.unassignedStudents = [];
    return { ok: true };
  }

  // ===== 게임 시작 =====
  canStartGame(code: SessionCode): { ok: boolean; reason?: string } {
    const session = this.sessions.get(code);
    if (!session) return { ok: false, reason: '세션 없음' };
    if (session.phase !== 'waiting')
      return { ok: false, reason: '이미 시작되었거나 종료된 세션입니다.' };
    if (session.unassignedStudents.length > 0)
      return { ok: false, reason: '아직 팀에 배정되지 않은 학생이 있습니다.' };
    if (session.teams.length === 0)
      return { ok: false, reason: '팀이 하나도 없습니다.' };
    for (const team of session.teams) {
      if (team.students.length !== 4)
        return {
          ok: false,
          reason: `"${team.name}" 팀이 4명이 아닙니다 (현재 ${team.students.length}명).`,
        };
    }
    return { ok: true };
  }

  startGame(code: SessionCode): {
    ok: boolean;
    reason?: string;
    teamStates?: TeamState[];
  } {
    const check = this.canStartGame(code);
    if (!check.ok) return check;

    const session = this.sessions.get(code)!;
    // 캐릭터 미선택자에게 자동 배정 (팀 내 유니크 보장)
    this.autoAssignCharacters(session);
    session.phase = 'playing';
    session.startedAt = Date.now();

    const teamStates: TeamState[] = session.teams.map((t) => {
      const ts = emptyTeamState(t.id, t.name);
      // 연결 상태 + 슬롯 그대로 복사
      ts.students = t.students.map((s) => ({ ...s }));
      ts.startedAt = Date.now();
      this.teamStates.set(t.id, ts);
      return ts;
    });

    return { ok: true, teamStates };
  }

  // ===== 게임 상태 접근 =====
  getTeamState(teamId: TeamId): TeamState | undefined {
    return this.teamStates.get(teamId);
  }

  // 소켓으로부터 "내가 속한 팀 + 슬롯" 찾기 (게임 진행 중 전제)
  getPlayerContextBySocket(
    socketId: string
  ): { teamState: TeamState; slot: StudentSlot } | null {
    const studentId = this.socketToStudent.get(socketId);
    if (!studentId) return null;
    for (const ts of this.teamStates.values()) {
      const stu = ts.students.find((s) => s.id === studentId);
      if (stu?.slot) return { teamState: ts, slot: stu.slot };
    }
    return null;
  }

  // ===== 1막 액션 적용 =====
  applyAct1Selection(
    teamId: TeamId,
    slot: StudentSlot,
    choice: PathChoice | null
  ): { teamState: TeamState; evaluation: Act1Evaluation | null } | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    ts.act1.selections[slot] = choice;
    const sel = ts.act1.selections;
    const allFilled = sel.A && sel.B && sel.C && sel.D;
    if (!allFilled) return { teamState: ts, evaluation: null };
    const evaluation = evaluateAct1({
      A: sel.A!,
      B: sel.B!,
      C: sel.C!,
      D: sel.D!,
    });
    if (evaluation.status === 'solved' && !ts.completedActs.includes(1)) {
      ts.completedActs.push(1);
    }
    return { teamState: ts, evaluation };
  }

  resetAct1(teamId: TeamId): TeamState | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    ts.act1.selections = { A: null, B: null, C: null, D: null };
    return ts;
  }

  // ===== 2막 액션 적용 =====
  // 양팔 저울 기울기 계산 — 클라가 무게를 모르므로 서버가 비교 결과만 알려줌.
  private computeScaleTilt(act2: Act2State): ScaleTilt {
    if (!act2.scaleLeft && !act2.scaleRight) return 'empty';
    if (!act2.scaleLeft) return 'right';   // 왼쪽 비어있음 → 오른쪽으로 기움
    if (!act2.scaleRight) return 'left';
    const cmp = compare(
      ACT2_CORE_WEIGHTS[act2.scaleLeft],
      ACT2_CORE_WEIGHTS[act2.scaleRight]
    );
    if (cmp > 0) return 'left';
    if (cmp < 0) return 'right';
    return 'balanced';
  }

  // 양팔 저울에 코어 올리기. side='left'|'right'. 같은 코어가 다른 쪽에 있으면 자동 제거.
  // 같은 쪽에 다른 코어가 있으면 교체 (한 쪽 1개 정책).
  applyAct2Place(
    teamId: TeamId,
    color: CoreColor,
    side: 'left' | 'right'
  ): TeamState | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    if (!(ACT2_CORE_COLORS as readonly string[]).includes(color)) return null;
    // 같은 색이 반대편에 있다면 거기서 제거
    if (side === 'left' && ts.act2.scaleRight === color) ts.act2.scaleRight = null;
    if (side === 'right' && ts.act2.scaleLeft === color) ts.act2.scaleLeft = null;
    if (side === 'left') ts.act2.scaleLeft = color;
    else ts.act2.scaleRight = color;
    ts.act2.scaleTilt = this.computeScaleTilt(ts.act2);
    return ts;
  }

  applyAct2Remove(teamId: TeamId, side: 'left' | 'right'): TeamState | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    if (side === 'left') ts.act2.scaleLeft = null;
    else ts.act2.scaleRight = null;
    ts.act2.scaleTilt = this.computeScaleTilt(ts.act2);
    return ts;
  }

  applyAct2Submit(
    teamId: TeamId,
    color: CoreColor
  ): { teamState: TeamState; evaluation: Act2Evaluation } | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    if (!(ACT2_CORE_COLORS as readonly string[]).includes(color)) return null;
    const evaluation = evaluateAct2(color);
    ts.act2.submittedCore = color;
    if (evaluation.status === 'solved' && !ts.completedActs.includes(2)) {
      ts.completedActs.push(2);
    }
    return { teamState: ts, evaluation };
  }

  resetAct2Submission(teamId: TeamId): TeamState | null {
    const ts = this.teamStates.get(teamId);
    if (!ts) return null;
    ts.act2.submittedCore = null;
    return ts;
  }

  endSession(code: SessionCode): boolean {
    const session = this.sessions.get(code);
    if (!session) return false;
    session.phase = 'ended';
    return true;
  }

  // ===== 스냅샷 =====
  getSnapshot(code: SessionCode): SessionState | null {
    const s = this.sessions.get(code);
    if (!s) return null;
    return {
      code: s.code,
      teacherId: s.teacherId,
      phase: s.phase,
      unassignedStudents: s.unassignedStudents.map((st) => ({ ...st })),
      teams: s.teams.map((t) => ({ ...t, students: t.students.map((x) => ({ ...x })) })),
      createdAt: s.createdAt,
      startedAt: s.startedAt,
    };
  }

  // 특정 팀의 학생들에 대해 (socketId, slot) 목록 — startGame 시 팀룸 합류용
  getTeamSocketSlots(
    teamId: TeamId
  ): Array<{ socketId: string; slot: StudentSlot; studentId: StudentId }> {
    const ts = this.teamStates.get(teamId);
    if (!ts) return [];
    const out: Array<{ socketId: string; slot: StudentSlot; studentId: StudentId }> = [];
    for (const s of ts.students) {
      if (!s.slot) continue;
      const socketId = this.studentToSocket.get(s.id);
      if (socketId) out.push({ socketId, slot: s.slot, studentId: s.id });
    }
    return out;
  }

  findTeamOfStudent(code: SessionCode, studentId: StudentId): TeamId | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    for (const t of session.teams) {
      if (t.students.some((s) => s.id === studentId)) return t.id;
    }
    return null;
  }
}

export const sessionManager = new SessionManager();
