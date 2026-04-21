// Phaser 게임 인스턴스 팩토리
// React 의 GamePage 가 마운트되면서 이걸 호출해 Phaser 를 띄움

import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import Act1Scene from './scenes/Act1Scene';

export type MesaGameInit = {
  parent: string;
  act?: 1 | 2 | 3 | 4; // 어느 막으로 시작할지 (기본: 1)
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
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    pixelArt: true,
    scene: [BootScene, Act1Scene],
  };
  const game = new Phaser.Game(config);
  // 진입할 막 정보를 씬 간 공유 데이터로 저장
  game.registry.set('startAct', opts.act ?? 1);
  return game;
};
