// 캐릭터별 4방향 walk 애니메이션 등록 헬퍼.
// 키 규칙: `${character}:walk_${dir}` (예: dragon:walk_down)
// 4명이 각각 다른 캐릭터를 고를 수 있어서 키를 캐릭터별로 분리해야 충돌이 없음.

import Phaser from 'phaser';
import type { Character, StudentSlot } from '@shared/types/game';
import { CHARACTER_IDS } from '@shared/lib/characters';
import { useSessionStore } from '@/store/useSessionStore';
import { useTouchControlsStore } from '@/store/useTouchControlsStore';

const DIR_ROWS = [
  { dir: 'down' as const, start: 0, end: 5 },
  { dir: 'up' as const, start: 6, end: 11 },
  { dir: 'right' as const, start: 12, end: 17 },
  { dir: 'left' as const, start: 18, end: 23 },
];

export type WalkDir = 'down' | 'up' | 'right' | 'left';

export const animKey = (character: Character, dir: WalkDir): string =>
  `${character}:walk_${dir}`;

// 4종 모두에 대해 down/up/right/left walk 애니메이션 등록.
// 이미 존재하는 키는 건너뜀 (씬 재진입 시 안전).
export const ensureCharacterAnimations = (scene: Phaser.Scene) => {
  for (const id of CHARACTER_IDS) {
    if (!scene.textures.exists(id)) continue; // BootScene 에서 로드 실패한 경우 스킵
    for (const r of DIR_ROWS) {
      const key = animKey(id, r.dir);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(id, {
          start: r.start,
          end: r.end,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }
};

// 입력 통합 — 가상 조이스틱이 활성이면 그것 우선, 아니면 cursor keys 사용.
// 반환: 속도(vx,vy) + 우세 방향(walk anim 결정용).
const JOY_DEADZONE = 0.18;

export const readMovementInput = (
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  speed: number
): { vx: number; vy: number; dir: WalkDir | null } => {
  const { joyX, joyY } = useTouchControlsStore.getState();
  const mag = Math.hypot(joyX, joyY);
  if (mag > JOY_DEADZONE) {
    const vx = joyX * speed;
    const vy = joyY * speed;
    let dir: WalkDir;
    if (Math.abs(joyX) > Math.abs(joyY)) {
      dir = joyX < 0 ? 'left' : 'right';
    } else {
      dir = joyY < 0 ? 'up' : 'down';
    }
    return { vx, vy, dir };
  }
  // 키보드 cursor keys
  let vx = 0;
  let vy = 0;
  let dir: WalkDir | null = null;
  if (cursors.left.isDown) { vx = -speed; dir = 'left'; }
  else if (cursors.right.isDown) { vx = speed; dir = 'right'; }
  if (cursors.up.isDown) { vy = -speed; dir = dir ?? 'up'; }
  else if (cursors.down.isDown) { vy = speed; dir = dir ?? 'down'; }
  return { vx, vy, dir };
};

// 슬롯 → 캐릭터 매핑. 멀티 모드에서 useSessionStore 의 스냅샷을 보고 결정.
// 솔로/스냅샷 없음 → 모두 dragon.
export const getSlotCharacters = (): Record<StudentSlot, Character> => {
  const fallback: Record<StudentSlot, Character> = {
    A: 'dragon',
    B: 'dragon',
    C: 'dragon',
    D: 'dragon',
  };
  const { snapshot, myTeamId, mySlot, myCharacter } = useSessionStore.getState();
  if (!myTeamId || !snapshot) {
    // 솔로 모드라도 본인이 고른 캐릭터는 반영 (테스트 편의)
    if (mySlot && myCharacter) {
      const out = { ...fallback };
      out[mySlot] = myCharacter;
      return out;
    }
    return fallback;
  }
  const team = snapshot.teams.find((t) => t.id === myTeamId);
  if (!team) return fallback;
  const out = { ...fallback };
  for (const s of team.students) {
    if (s.slot && s.character) out[s.slot] = s.character;
  }
  return out;
};
