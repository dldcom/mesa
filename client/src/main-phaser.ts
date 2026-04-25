// Phaser 게임 인스턴스 팩토리
// React 의 GamePage 가 마운트되면서 이걸 호출해 Phaser 를 띄움

import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import PrologueScene from './scenes/PrologueScene';
import Act1Scene from './scenes/Act1Scene';
import Act2Scene from './scenes/Act2Scene';
import type { Character } from '@shared/types/game';

export type MesaGameInit = {
  parent: string;
  act?: 1 | 2 | 3 | 4; // 어느 막으로 시작할지 (기본: 1)
  mode?: 'solo' | 'multi'; // solo: 로컬 판정, multi: 서버 권위
  slot?: 'A' | 'B' | 'C' | 'D'; // multi 시 내 슬롯
  character?: Character; // 내가 고른 캐릭터 (기본: dragon)
};

export const createPhaserGame = (opts: MesaGameInit): Phaser.Game => {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: opts.parent,
    backgroundColor: '#0a0e1a',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: import.meta.env.DEV,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    pixelArt: true,
    scene: [BootScene, PrologueScene, Act1Scene, Act2Scene],
  };
  const game = new Phaser.Game(config);
  // 씬 간 공유: 막, 모드(solo/multi), 내 슬롯, 내 캐릭터
  game.registry.set('startAct', opts.act ?? 1);
  game.registry.set('mode', opts.mode ?? 'solo');
  game.registry.set('mySlot', opts.slot ?? 'A');
  game.registry.set('myCharacter', opts.character ?? 'dragon');
  return game;
};
