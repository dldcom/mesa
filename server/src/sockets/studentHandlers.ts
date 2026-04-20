import type { Socket } from 'socket.io';
import type { MesaIo } from './index';
import { sessionManager } from '../game/sessionManager';
import { broadcastSessionState } from './teacherHandlers';

const sessionRoom = (code: string) => `session:${code}`;

export const registerStudentHandlers = (io: MesaIo, socket: Socket) => {
  socket.on('student:enter', ({ sessionCode, name, reconnectId }) => {
    const result = sessionManager.addStudent(
      sessionCode,
      name,
      socket.id,
      reconnectId
    );
    if (!result.ok) {
      socket.emit('error', { code: 'ENTER_FAILED', message: result.reason });
      return;
    }

    socket.join(sessionRoom(sessionCode));
    socket.emit('session:joined', {
      sessionCode,
      studentId: result.studentId,
      phase: result.phase,
    });

    console.log(
      `[Student] ${name} ${result.reconnected ? 'RECONNECTED to' : 'joined'} ${sessionCode}`
    );
    broadcastSessionState(io, sessionCode);
  });

  // 학생이 명시적으로 나감 (예: "방 나가기" 버튼)
  socket.on('student:leave', () => {
    const studentId = sessionManager.getStudentIdBySocket(socket.id);
    if (!studentId) return;
    const code = sessionManager.removeStudentPermanently(studentId);
    if (code) {
      socket.leave(sessionRoom(code));
      broadcastSessionState(io, code);
    }
  });

  // 소켓 끊김 — 제거하지 않고 disconnect 표시만 (재접속 가능 상태 유지)
  socket.on('disconnect', () => {
    const marked = sessionManager.markStudentDisconnected(socket.id);
    if (marked) {
      broadcastSessionState(io, marked.sessionCode);
      console.log(
        `[Student] disconnected from ${marked.sessionCode} (can reconnect)`
      );
    }
  });
};
