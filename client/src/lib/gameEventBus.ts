// Phaser 씬 ↔ React 오버레이 사이 이벤트 버스
// Phaser 가 이미 의존성이므로 별도 mitt 추가 안 하고 내장 EventEmitter 사용.

import Phaser from 'phaser';
import type { TeamState, StudentSlot } from '@shared/types/game';

export type GameEventMap = {
  // Phaser → React: NPC 근처 진입/이탈 (대화 말풍선 제어)
  'npc:proximityEnter': { npcKey: string; label?: string };
  'npc:proximityLeave': { npcKey: string };

  // Phaser → React: 1막 해결 알림 (다음 막 전환용)
  'act1:solved': undefined;

  // React → Phaser: 서버에서 받은 팀 상태 전달 (멀티 모드)
  'server:teamState': { teamState: TeamState };
  'server:puzzleSolved': { act: 1 | 2 | 3 | 4 };
  'server:puzzleFailed': { act: 1 | 2 | 3 | 4; reason: string };
  'server:playerMoved': {
    slot: StudentSlot;
    x: number;
    y: number;
    anim: string | null;
    frame: number;
  };
};

class TypedEventBus {
  private emitter = new Phaser.Events.EventEmitter();

  emit<K extends keyof GameEventMap>(event: K, payload?: GameEventMap[K]) {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void
  ) {
    this.emitter.on(event, handler);
  }

  off<K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void
  ) {
    this.emitter.off(event, handler);
  }

  destroy() {
    this.emitter.removeAllListeners();
  }
}

export const gameEventBus = new TypedEventBus();
