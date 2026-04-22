// Phaser 게임을 마운트하는 React 컨테이너.
// 현재는 디버그 모드로 Act 1 을 바로 로드 (세션/팀 연동은 추후).

import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { createPhaserGame } from '@/main-phaser';
import { gameEventBus } from '@/lib/gameEventBus';

const GAME_CONTAINER_ID = 'mesa-game-container';

export default function GamePage() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [proximityLabel, setProximityLabel] = useState<string | null>(null);

  useEffect(() => {
    // React StrictMode 에서 두 번 마운트 방지
    if (gameRef.current) return;

    // 컨테이너 DOM 이 준비될 때까지 한 틱 기다림
    const id = requestAnimationFrame(() => {
      gameRef.current = createPhaserGame({
        parent: GAME_CONTAINER_ID,
        act: 1,
      });
    });

    return () => {
      cancelAnimationFrame(id);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  // Phaser → React 이벤트 구독 (근접 안내 버블)
  useEffect(() => {
    const onEnter = (p: { npcKey: string; label?: string }) =>
      setProximityLabel(p.label ?? `${p.npcKey} 에게 다가감 — Space 또는 탭`);
    const onLeave = () => setProximityLabel(null);

    gameEventBus.on('npc:proximityEnter', onEnter);
    gameEventBus.on('npc:proximityLeave', onLeave);

    return () => {
      gameEventBus.off('npc:proximityEnter', onEnter);
      gameEventBus.off('npc:proximityLeave', onLeave);
    };
  }, []);

  return (
    <div style={styles.root}>
      <div id={GAME_CONTAINER_ID} style={styles.gameContainer} />

      {/* NPC 근처 진입 시 안내 버블 (Phaser 캔버스 위 absolute) */}
      {proximityLabel && (
        <div style={styles.proximityBubble}>{proximityLabel}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#0a0e1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gameContainer: { width: '100%', height: '100%' },
  proximityBubble: {
    position: 'absolute',
    bottom: 60,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 18px',
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#fde68a',
    border: '1px solid #fbbf24',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: 'Pretendard, sans-serif',
    pointerEvents: 'none',
    zIndex: 500,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  },
};
