// 1막: 전력망 동기화
// 현재 턴 목표: 맵 배경 + 충돌 + 플레이어 조작 (화살표 키)
// 추후: 4인 팀 Socket 동기화, 분수 경로 선택 UI, 합산 검증

import Phaser from 'phaser';

const TILE_SIZE = 32;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;
const MAP_PIXEL_W = TILE_SIZE * MAP_WIDTH; // 2048
const MAP_PIXEL_H = TILE_SIZE * MAP_HEIGHT;
const PLAYER_SPEED = 180;

type MapData = {
  content: {
    layers: Array<{
      name: string;
      data?: number[];
      objects?: Array<{
        id?: number;
        name: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
      }>;
    }>;
  };
};

export default class Act1Scene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super('Act1Scene');
  }

  create() {
    // 1. 배경 이미지 (캐릭터 아래 렌더) — depth 0
    const bgBelow = this.add.image(0, 0, 'act1_bg');
    bgBelow.setOrigin(0, 0);
    bgBelow.setDisplaySize(MAP_PIXEL_W, MAP_PIXEL_H);
    bgBelow.setDepth(0);

    // 2. 맵 데이터에서 충돌·스폰·천장 추출
    const mapData = this.cache.json.get('act1_data') as MapData;
    const collisionLayer = mapData.content.layers.find(
      (l) => l.name === 'collision'
    );
    const overlayLayer = mapData.content.layers.find(
      (l) => l.name === 'overlay'
    );
    const spawnLayer = mapData.content.layers.find((l) => l.name === 'spawn');

    // 2-a. 천장(overlay) 레이어 렌더 — 캐릭터보다 위(depth 20)
    const overlay = overlayLayer?.data ?? [];
    const hasOverlay = overlay.some((v) => v === 1);
    if (hasOverlay) {
      const bgAbove = this.add.image(0, 0, 'act1_bg');
      bgAbove.setOrigin(0, 0);
      bgAbove.setDisplaySize(MAP_PIXEL_W, MAP_PIXEL_H);
      bgAbove.setDepth(20);

      // overlay 타일 위치만 보이도록 geometry mask 생성
      const maskG = this.make.graphics({}, false);
      maskG.fillStyle(0xffffff);
      for (let i = 0; i < overlay.length; i++) {
        if (overlay[i] === 1) {
          const x = (i % MAP_WIDTH) * TILE_SIZE;
          const y = Math.floor(i / MAP_WIDTH) * TILE_SIZE;
          maskG.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
      bgAbove.setMask(maskG.createGeometryMask());
    }

    // 3. 충돌 벽 (보이지 않는 Static Body)
    this.walls = this.physics.add.staticGroup();
    const collision = collisionLayer?.data ?? [];
    for (let i = 0; i < collision.length; i++) {
      if (collision[i] === 1) {
        const x = (i % MAP_WIDTH) * TILE_SIZE + TILE_SIZE / 2;
        const y = Math.floor(i / MAP_WIDTH) * TILE_SIZE + TILE_SIZE / 2;
        const wall = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, 0x000000, 0);
        this.physics.add.existing(wall, true);
        this.walls.add(wall);
      }
    }

    // 4. 스폰 오브젝트 배치
    const spawns = spawnLayer?.objects ?? [];

    // 4-a. 플레이어
    const playerSpawn =
      spawns.find((o) => o.name === 'playerspawn') ?? { x: 200, y: 200 };

    this.player = this.physics.add.sprite(
      playerSpawn.x + TILE_SIZE / 2,
      playerSpawn.y + TILE_SIZE / 2,
      'dragon',
      0
    );
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    // 스프라이트는 48×64 지만 충돌 히트박스는 발 기준 작게
    this.player.setSize(32, 20);
    this.player.setOffset(8, 40);

    // 4-b. NPC (이름이 'npc_' 로 시작)
    const npcSpawns = spawns.filter((o) => o.name.startsWith('npc_'));
    for (const s of npcSpawns) {
      const npcKey = s.name.replace('npc_', ''); // 예: 'npc_researcher' → 'researcher'
      if (!this.textures.exists(npcKey)) continue;
      const npc = this.add.sprite(
        s.x + TILE_SIZE / 2,
        s.y + TILE_SIZE / 2,
        npcKey,
        0
      );
      npc.setDepth(10);
      // 이름표
      this.add
        .text(s.x + TILE_SIZE / 2, s.y - 8, npcKey, {
          color: '#fbbf24',
          fontSize: '11px',
          backgroundColor: '#000000aa',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(11);
    }

    // 4-c. 아이템 (이름이 'item_' 로 시작)
    const itemSpawns = spawns.filter((o) => o.name.startsWith('item_'));
    for (const s of itemSpawns) {
      const itemKey = s.name.replace('item_', '');
      if (!this.textures.exists(itemKey)) continue;
      const item = this.add.image(
        s.x + TILE_SIZE / 2,
        s.y + TILE_SIZE / 2,
        itemKey
      );
      item.setDepth(9);
      // 반짝이는 듯한 효과 (약간 통통 튀는 애니메이션)
      this.tweens.add({
        targets: item,
        y: item.y - 3,
        duration: 800,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // 6. 충돌 연결
    this.physics.add.collider(this.player, this.walls);

    // 7. 월드 경계
    this.physics.world.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // 8. 카메라 추적
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);
    this.cameras.main.setZoom(1.5);

    // 9. 걷기 애니메이션 (CharacterMaker 가 생성한 6프레임 × 4방향)
    //    행 순서: down(0~5), up(6~11), right(12~17), left(18~23)
    const dirs = [
      { key: 'walk_down', start: 0, end: 5 },
      { key: 'walk_up', start: 6, end: 11 },
      { key: 'walk_right', start: 12, end: 17 },
      { key: 'walk_left', start: 18, end: 23 },
    ];
    for (const d of dirs) {
      this.anims.create({
        key: d.key,
        frames: this.anims.generateFrameNumbers('dragon', {
          start: d.start,
          end: d.end,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // 10. 입력
    this.cursors = this.input.keyboard!.createCursorKeys();

    // 11. 디버그 HUD
    this.debugText = this.add.text(10, 10, '', {
      color: '#fff',
      fontSize: '14px',
      backgroundColor: '#000000aa',
      padding: { x: 6, y: 4 },
    });
    this.debugText.setScrollFactor(0);
    this.debugText.setDepth(1000);

    // 안내 문구
    const hint = this.add.text(
      this.scale.width / 2,
      this.scale.height - 40,
      '방향키로 이동 · 살짝 구현 테스트 빌드',
      {
        color: '#93c5fd',
        fontSize: '14px',
        fontFamily: 'Pretendard, sans-serif',
      }
    );
    hint.setOrigin(0.5);
    hint.setScrollFactor(0);
    hint.setDepth(1000);
  }

  update() {
    if (!this.player || !this.cursors) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = 0;
    let vy = 0;
    let anim: string | null = null;

    if (this.cursors.left.isDown) {
      vx = -PLAYER_SPEED;
      anim = 'walk_left';
    } else if (this.cursors.right.isDown) {
      vx = PLAYER_SPEED;
      anim = 'walk_right';
    }
    if (this.cursors.up.isDown) {
      vy = -PLAYER_SPEED;
      anim = anim ?? 'walk_up';
    } else if (this.cursors.down.isDown) {
      vy = PLAYER_SPEED;
      anim = anim ?? 'walk_down';
    }

    body.setVelocity(vx, vy);

    if (anim) {
      this.player.anims.play(anim, true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(0); // 정면 대기 프레임
    }

    this.debugText.setText(
      `player: (${Math.round(this.player.x)}, ${Math.round(this.player.y)})\n` +
        `tile: (${Math.floor(this.player.x / TILE_SIZE)}, ${Math.floor(this.player.y / TILE_SIZE)})`
    );
  }
}
