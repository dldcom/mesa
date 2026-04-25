// 학생의 퍼즐 조작 이벤트를 받아 권위 있는 팀 상태에 반영.
// 슬롯은 소켓→학생→팀 매핑으로 서버가 결정 (클라가 조작 불가).

import type { Socket } from 'socket.io';
import type { MesaIo } from './index';
import { sessionManager } from '../game/sessionManager';

const teamRoom = (teamId: string) => `team:${teamId}`;

export const registerPuzzleHandlers = (io: MesaIo, socket: Socket) => {
  socket.on('puzzle:action', (action) => {
    const ctx = sessionManager.getPlayerContextBySocket(socket.id);
    if (!ctx) {
      socket.emit('error', {
        code: 'NOT_IN_GAME',
        message: '게임 중인 팀 소속이 아닙니다.',
      });
      return;
    }
    const { teamState, slot } = ctx;

    // 1막 — 경로 선택
    if (action.act === 1 && action.type === 'selectPath') {
      const result = sessionManager.applyAct1Selection(
        teamState.teamId,
        slot,
        action.choice
      );
      if (!result) return;
      const room = teamRoom(teamState.teamId);

      // 매 선택마다 팀 상태 브로드캐스트
      io.to(room).emit('team:state', result.teamState);

      // 4명 전원 선택됐으면 판정
      const ev = result.evaluation;
      if (!ev) return;
      if (ev.status === 'solved') {
        io.to(room).emit('puzzle:solved', { act: 1, nextAct: 2 });
        return;
      }
      // 실패 — 짧은 피드백 후 리셋 브로드캐스트
      io.to(room).emit('puzzle:failed', {
        act: 1,
        reason: ev.status === 'overload' ? 'overload' : 'shortage',
      });
      sessionManager.resetAct1(teamState.teamId);
      const reset = sessionManager.getTeamState(teamState.teamId);
      if (reset) io.to(room).emit('team:state', reset);
      return;
    }

    // 1막 — 확정 버튼 (현재 selectPath 만으로 자동 판정이라 no-op)
    if (action.act === 1 && action.type === 'confirm') return;

    // 2/3/4 막은 아직 미구현
  });

  // 같은 팀 멤버끼리 위치 공유. 서버는 권위 검증 안 하고 단순 릴레이.
  socket.on('player:move', (data) => {
    const ctx = sessionManager.getPlayerContextBySocket(socket.id);
    if (!ctx) return;
    socket.to(teamRoom(ctx.teamState.teamId)).emit('player:moved', {
      slot: ctx.slot,
      x: data.x,
      y: data.y,
      anim: data.anim,
      frame: data.frame,
    });
  });
};
