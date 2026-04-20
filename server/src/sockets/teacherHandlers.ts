import type { Socket } from 'socket.io';
import type { MesaIo } from './index';
import { sessionManager } from '../game/sessionManager';

const sessionRoom = (code: string) => `session:${code}`;
const teacherRoom = (code: string) => `teacher:${code}`;

// 세션 변경 시 모두에게 스냅샷 브로드캐스트
const broadcastSessionState = (io: MesaIo, code: string) => {
  const snapshot = sessionManager.getSnapshot(code);
  if (!snapshot) return;
  const light = {
    phase: snapshot.phase,
    unassignedStudents: snapshot.unassignedStudents,
    teams: snapshot.teams,
  };
  io.to(sessionRoom(code)).emit('session:state', light);
  // 교사에게는 풀 스냅샷도 별도로 전달
  io.to(teacherRoom(code)).emit('teacher:sessionState', snapshot);
};

export const registerTeacherHandlers = (io: MesaIo, socket: Socket) => {
  // 교사가 세션에 "관찰자"로 연결
  socket.on('teacher:joinSession', ({ sessionCode }) => {
    if (!sessionManager.attachTeacherSocket(sessionCode, socket.id)) {
      socket.emit('error', {
        code: 'SESSION_NOT_FOUND',
        message: '세션을 찾을 수 없습니다.',
      });
      return;
    }
    socket.join(sessionRoom(sessionCode));
    socket.join(teacherRoom(sessionCode));
    console.log(`[Teacher] joined session ${sessionCode}`);
    broadcastSessionState(io, sessionCode);
  });

  // 팀 생성
  socket.on('teacher:createTeam', ({ teamName }) => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    sessionManager.createTeam(code, teamName);
    broadcastSessionState(io, code);
  });

  // 학생 → 팀 배정
  socket.on('teacher:assignToTeam', ({ studentId, teamId }) => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    const r = sessionManager.assignStudentToTeam(code, studentId, teamId);
    if (!r.ok) {
      socket.emit('error', { code: 'ASSIGN_FAILED', message: r.reason ?? '' });
      return;
    }
    broadcastSessionState(io, code);
  });

  // 학생 → 미배정 풀로 되돌리기
  socket.on('teacher:unassignStudent', ({ studentId }) => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    const r = sessionManager.unassignStudent(code, studentId);
    if (!r.ok) {
      socket.emit('error', { code: 'UNASSIGN_FAILED', message: r.reason ?? '' });
      return;
    }
    broadcastSessionState(io, code);
  });

  // 게임 시작
  socket.on('teacher:startGame', () => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    const r = sessionManager.startGame(code);
    if (!r.ok) {
      socket.emit('error', { code: 'START_FAILED', message: r.reason ?? '' });
      return;
    }
    // 모든 참가자에게 게임 시작 알림 + 자기 팀 ID 전달은 클라가 스냅샷으로 알 수 있음
    const snapshot = sessionManager.getSnapshot(code);
    if (snapshot) {
      for (const team of snapshot.teams) {
        io.to(sessionRoom(code)).emit('game:started', { teamId: team.id });
      }
    }
    broadcastSessionState(io, code);
    console.log(`[Teacher] started game for session ${code}`);
  });

  // 자동 배정
  socket.on('teacher:autoAssign', () => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    sessionManager.autoAssign(code);
    broadcastSessionState(io, code);
  });

  // 팀 삭제
  socket.on('teacher:removeTeam', ({ teamId }) => {
    const code = sessionManager.getTeacherSessionCode(socket.id);
    if (!code) return;
    sessionManager.removeTeam(code, teamId);
    broadcastSessionState(io, code);
  });

  socket.on('disconnect', () => {
    sessionManager.detachTeacherSocket(socket.id);
  });
};

export { broadcastSessionState };
