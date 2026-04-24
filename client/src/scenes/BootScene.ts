// 에셋 로딩 씬. 서버의 /assets/ 폴더에서 맵/캐릭터/NPC/아이템을 로드.

import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // 로딩 진행 표시
    const { width, height } = this.scale;
    const barBg = this.add.rectangle(width / 2, height / 2, 400, 20, 0x222b3b);
    const bar = this.add.rectangle(
      width / 2 - 200,
      height / 2,
      0,
      20,
      0x3b82f6
    );
    bar.setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 40, '에셋 로딩 중…', {
      color: '#e5e7eb',
      fontSize: '16px',
      fontFamily: 'Pretendard, sans-serif',
    });
    label.setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.width = 400 * value;
    });

    // 맵 (1막 전력망 동기화)
    this.load.image('act1_bg', '/assets/maps/act1_power_grid.png');
    this.load.json('act1_data', '/assets/maps/act1_power_grid.json');

    // 1막 대사 스크립트
    this.load.json('dialogue_act1', '/assets/dialogue/act1.json');

    // 플레이어 캐릭터 (6프레임 × 4방향 = 24프레임 아틀라스)
    this.load.spritesheet('dragon', '/assets/characters/dragon.png', {
      frameWidth: 48,
      frameHeight: 64,
    });

    // NPC
    this.load.spritesheet('researcher', '/assets/npcs/researcher.png', {
      frameWidth: 48,
      frameHeight: 64,
    });

    // 아이템: 배터리 (현재는 blue_core 재사용)
    this.load.image('blue_core', '/assets/items/blue_core.png');

    // 1막 퍼즐 에셋: 레버 2종 + 문 좌/우 패널
    this.load.image('lever_off', '/assets/items/lever_off.png');
    this.load.image('lever_on', '/assets/items/lever_on.png');
    this.load.image('door_panel_L', '/assets/items/door_panel_L.png');
    this.load.image('door_panel_R', '/assets/items/door_panel_R.png');
  }

  create() {
    const startAct = this.game.registry.get('startAct') as 1 | 2 | 3 | 4;
    if (startAct === 1) {
      this.scene.start('Act1Scene');
    } else {
      // 다른 막은 아직 미구현
      this.scene.start('Act1Scene');
    }
  }
}
