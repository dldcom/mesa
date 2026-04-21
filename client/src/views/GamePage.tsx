// Phaser 게임을 마운트하는 React 컨테이너.
// 현재는 디버그 모드로 Act 1 을 바로 로드 (세션/팀 연동은 추후).

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createPhaserGame } from '@/main-phaser';

const GAME_CONTAINER_ID = 'mesa-game-container';

export default function GamePage() {
  const gameRef = useRef<Phaser.Game | null>(null);

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

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0e1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        id={GAME_CONTAINER_ID}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
