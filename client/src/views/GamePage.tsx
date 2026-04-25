// Phaser 게임을 마운트하는 React 컨테이너.
// 세션에서 들어왔으면 multi 모드 (서버 권위 판정), URL 직접 접근이면 solo 모드 (로컬 판정).

import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { createPhaserGame } from '@/main-phaser';
import { gameEventBus } from '@/lib/gameEventBus';
import DialogueBox from '@/components/DialogueBox';
import Act1StatusPanel from '@/components/Act1StatusPanel';
import Act2CluePanel from '@/components/Act2CluePanel';
import TouchControls from '@/components/TouchControls';
import { getSocket } from '@/services/socket';
import { useSessionStore } from '@/store/useSessionStore';
import type { TeamState } from '@shared/types/game';

const GAME_CONTAINER_ID = 'mesa-game-container';

export default function GamePage() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [proximityLabel, setProximityLabel] = useState<string | null>(null);

  const myTeamId = useSessionStore((s) => s.myTeamId);
  const mySlot = useSessionStore((s) => s.mySlot);
  const myCharacter = useSessionStore((s) => s.myCharacter);

  useEffect(() => {
    if (gameRef.current) return;
    const id = requestAnimationFrame(() => {
      const mode = myTeamId && mySlot ? 'multi' : 'solo';
      gameRef.current = createPhaserGame({
        parent: GAME_CONTAINER_ID,
        act: 1,
        mode,
        slot: mySlot ?? 'A',
        character: myCharacter ?? 'dragon',
      });
    });

    return () => {
      cancelAnimationFrame(id);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [myTeamId, mySlot, myCharacter]);

  // Phaser → React 이벤트 (근접 안내 버블)
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

  // 서버 → React → Phaser 이벤트 릴레이 (멀티 모드 전용)
  useEffect(() => {
    if (!myTeamId) return;
    const socket = getSocket();

    const onTeamState = (teamState: TeamState) =>
      gameEventBus.emit('server:teamState', { teamState });
    const onSolved = (data: { act: 1 | 2 | 3 | 4 }) =>
      gameEventBus.emit('server:puzzleSolved', { act: data.act });
    const onFailed = (data: { act: 1 | 2 | 3 | 4; reason: string }) =>
      gameEventBus.emit('server:puzzleFailed', data);
    const onPlayerMoved = (data: {
      slot: 'A' | 'B' | 'C' | 'D';
      x: number;
      y: number;
      anim: string | null;
      frame: number;
    }) => gameEventBus.emit('server:playerMoved', data);

    socket.on('team:state', onTeamState);
    socket.on('puzzle:solved', onSolved);
    socket.on('puzzle:failed', onFailed);
    socket.on('player:moved', onPlayerMoved);

    return () => {
      socket.off('team:state', onTeamState);
      socket.off('puzzle:solved', onSolved);
      socket.off('puzzle:failed', onFailed);
      socket.off('player:moved', onPlayerMoved);
    };
  }, [myTeamId]);

  return (
    <div style={styles.root}>
      <div id={GAME_CONTAINER_ID} style={styles.gameContainer} />

      {proximityLabel && (
        <div style={styles.proximityBubble}>{proximityLabel}</div>
      )}

      <Act1StatusPanel />
      <Act2CluePanel />
      <DialogueBox />
      <TouchControls />
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
