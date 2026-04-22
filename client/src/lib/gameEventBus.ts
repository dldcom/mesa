// Phaser 씬 ↔ React 오버레이 사이 이벤트 버스
// Phaser 가 이미 의존성이므로 별도 mitt 추가 안 하고 내장 EventEmitter 사용.

import Phaser from 'phaser';

export type GameEventMap = {
  // Phaser → React: NPC 근처 진입/이탈 (대화 말풍선 제어)
  'npc:proximityEnter': { npcKey: string; label?: string };
  'npc:proximityLeave': { npcKey: string };

  // Phaser → React: NPC 상호작용(Space/탭/클릭) → 퍼즐 열기
  'act1:open': { npcKey: string };

  // React → Phaser: 퍼즐 해결 알림 (씬에서 다음 방 문 여는 연출 등)
  'act1:solved': undefined;

  // React → Phaser: 퍼즐 닫기 (씬이 일시정지 해제 등)
  'act1:close': undefined;
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
