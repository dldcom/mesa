// 1막: 전력망 동기화
// solo 모드: 혼자 1/2/3/4 키로 슬롯 전환, 로컬 판정
// multi 모드: 내 슬롯 고정, 서버 권위 판정, team:state 로 동료 선택 동기화

import Phaser from 'phaser';
import { gameEventBus } from '@/lib/gameEventBus';
import { getSocket } from '@/services/socket';
import {
  useDialogueStore,
  type DialogueScript,
} from '@/store/useDialogueStore';
import { useAct1Store } from '@/store/useAct1Store';
import {
  ACT1_PUZZLE,
  evaluateAct1,
  type PathChoice,
  type StudentSlot,
  type Act1Evaluation,
} from '@shared/lib/act1Logic';
import type { TeamState } from '@shared/types/game';
import { format } from '@shared/lib/fraction';

const TILE_SIZE = 32;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;
const MAP_PIXEL_W = TILE_SIZE * MAP_WIDTH;
const MAP_PIXEL_H = TILE_SIZE * MAP_HEIGHT;
const PLAYER_SPEED = 180;
const NPC_PROXIMITY = 80;
const LEVER_PROXIMITY = 56;
const DOOR_PROXIMITY = 100;
const BATTERY_PROXIMITY = 100;

// 배터리(재단 중앙) 렌더 스케일. 32px 원본 × 4 = 128px ≈ 재단 4타일.
const BATTERY_BASE_SCALE = 4;
const BATTERY_PULSE_SCALE = BATTERY_BASE_SCALE * 1.3;
const BATTERY_RESTING_SCALE = BATTERY_BASE_SCALE * 1.1;

// 문 충돌 박스 가로 너비(타일 단위). 맵 통로가 4타일이면 4 로 확장.
const DOOR_COLLISION_WIDTH_TILES = 4;

// ── 세로 통로 문 (item_door_<slot>): 통로 4×4 타일, 패널 좌우 슬라이드 ──
// 원본 PNG 의 불투명 영역이 중앙 16px 뿐이라 가로·세로 모두 4배 스케일 필요.
const DOOR_SCALE_X = 4; // 실제 그림 16×4 = 64px × 2패널 = 4타일 폭
const DOOR_SCALE_Y = 4; // 세로 4타일 = 128px
const DOOR_CLOSED_OFFSET = TILE_SIZE;        // ±32, 64px 패널이 중앙에서 만남
const DOOR_OPEN_OFFSET = TILE_SIZE * 3;      // ±96, 통로 4타일 밖으로 완전히 치움

// ── 가로 통로 문 (item_doorh_<slot>): 통로 0.5타일폭 × 5타일높이, 패널 1장이 위로 슬라이드 ──
// 원본 16px 불투명 폭 × 1(그대로) = 16px = 0.5타일. 높이 32×5 = 160px = 5타일.
// c = 타일 오른쪽 절반, d = 타일 왼쪽 절반 (서로 마주보는 문)
const DOORH_PASSAGE_W_TILES = 0.5;
const DOORH_PASSAGE_H_TILES = 5;
const DOORH_SCALE_X = 1;
const DOORH_SCALE_Y = DOORH_PASSAGE_H_TILES;                   // 5
const DOORH_OPEN_RISE = TILE_SIZE * DOORH_PASSAGE_H_TILES;     // 160, 열릴 때 패널 높이만큼 위로

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

type Npc = {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
  label: string;
};

type Lever = {
  slot: StudentSlot;
  choice: PathChoice;
  sprite: Phaser.GameObjects.Image;
  on: boolean;
  x: number;
  y: number;
};

type Vec2 = { x: number; y: number };

// 같은 팀의 다른 학생 (멀티 모드 한정). 서버 player:moved 이벤트로 위치 동기화.
type RemotePlayer = {
  slot: StudentSlot;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  anim: string | null;
  frame: number;
};

type Door = {
  slot: StudentSlot;
  panels: Phaser.GameObjects.Image[];  // 세로문: 2장(좌·우), 가로문: 1장(위로 슬라이드)
  collisionBody: Phaser.GameObjects.Rectangle;
  centerX: number;
  centerY: number;
  locked: boolean;   // 내 슬롯이 아니면 잠김(색상: 빨강). 잠김 상태에선 열 수 없음.
  isOpen: boolean;   // Space 상호작용으로 열었는지. 열려 있으면 충돌 해제 + 패널 슬라이드.
  closedPositions: Vec2[];
  openPositions: Vec2[];
};

export default class Act1Scene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private debugText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;

  // NPC
  private npcs: Npc[] = [];
  private nearbyNpc: Npc | null = null;

  // 퍼즐 엔티티
  private levers: Lever[] = [];
  private doors: Door[] = [];
  private battery: Phaser.GameObjects.Image | null = null;
  private nearbyLever: Lever | null = null;
  private nearbyDoor: Door | null = null;
  private nearbyBattery = false;

  // 입력
  private spaceKey!: Phaser.Input.Keyboard.Key;

  // 퍼즐 상태
  private selections: Record<StudentSlot, PathChoice | null> = {
    A: null,
    B: null,
    C: null,
    D: null,
  };
  private mode: 'solo' | 'multi' = 'solo';
  private currentSlot: StudentSlot = 'A'; // multi: 서버가 배정, solo: 1/2/3/4 로 변경
  private resolved = false; // 성공 후 잠금

  // 멀티 모드 — 같은 팀 다른 플레이어
  private remotePlayers = new Map<StudentSlot, RemotePlayer>();
  private lastBroadcast = 0;
  private lastBroadcastX = 0;
  private lastBroadcastY = 0;
  private lastBroadcastAnim: string | null = null;

  constructor() {
    super('Act1Scene');
  }

  create() {
    // 0. 모드 결정
    this.mode = (this.registry.get('mode') as 'solo' | 'multi') ?? 'solo';
    this.currentSlot =
      (this.registry.get('mySlot') as StudentSlot | undefined) ?? 'A';

    // 1. 배경
    const bgBelow = this.add.image(0, 0, 'act1_bg');
    bgBelow.setOrigin(0, 0);
    bgBelow.setDisplaySize(MAP_PIXEL_W, MAP_PIXEL_H);
    bgBelow.setDepth(0);

    // 2. 맵 데이터
    const mapData = this.cache.json.get('act1_data') as MapData;
    const collisionLayer = mapData.content.layers.find(
      (l) => l.name === 'collision'
    );
    const overlayLayer = mapData.content.layers.find(
      (l) => l.name === 'overlay'
    );
    const spawnLayer = mapData.content.layers.find((l) => l.name === 'spawn');

    // 2-a. 천장 마스크
    const overlay = overlayLayer?.data ?? [];
    if (overlay.some((v) => v === 1)) {
      const bgAbove = this.add.image(0, 0, 'act1_bg');
      bgAbove.setOrigin(0, 0);
      bgAbove.setDisplaySize(MAP_PIXEL_W, MAP_PIXEL_H);
      bgAbove.setDepth(20);

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

    // 3. 충돌 벽
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

    // 4. 스폰 파싱
    const spawns = spawnLayer?.objects ?? [];
    const playerSpawn = spawns.find((o) => o.name === 'playerspawn') ?? {
      x: 200,
      y: 200,
    };

    // 4-a. 플레이어
    this.player = this.physics.add.sprite(
      playerSpawn.x + TILE_SIZE / 2,
      playerSpawn.y + TILE_SIZE / 2,
      'dragon',
      0
    );
    this.player.setDepth(10);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(32, 20);
    this.player.setOffset(8, 40);

    // 4-b. NPC
    const npcSpawns = spawns.filter((o) => o.name.startsWith('npc_'));
    for (const s of npcSpawns) {
      const npcKey = s.name.replace('npc_', '');
      if (!this.textures.exists(npcKey)) continue;
      const sprite = this.add.sprite(
        s.x + TILE_SIZE / 2,
        s.y + TILE_SIZE / 2,
        npcKey,
        0
      );
      sprite.setDepth(10);
      sprite.setInteractive({ useHandCursor: true });
      // 48×64 NPC 의 발치만 잡음
      this.makeSolid(sprite, 28, 14, 24);
      const npc: Npc = {
        sprite,
        key: npcKey,
        label: `${npcKey} — 가까이 가서 Space/클릭으로 대화`,
      };
      this.npcs.push(npc);

      sprite.on('pointerdown', () => this.tryTalkToNpc(npc));

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

    // 4-c. 레버 (item_lever_<slot>_<choice>)
    const leverRegex = /^item_lever_([ABCD])_([12])$/;
    for (const s of spawns) {
      const m = s.name.match(leverRegex);
      if (!m) continue;
      const slot = m[1] as StudentSlot;
      const choice = parseInt(m[2]) as PathChoice;
      const cx = s.x + TILE_SIZE / 2;
      const cy = s.y + TILE_SIZE / 2;
      const sprite = this.add.image(cx, cy, 'lever_off');
      sprite.setScale(2.5);
      sprite.setDepth(9);
      sprite.setInteractive({ useHandCursor: true });
      // 레버 (2.5배 스케일) 밑단
      this.makeSolid(sprite, 24, 14, 8);
      const lever: Lever = { slot, choice, sprite, on: false, x: cx, y: cy };
      this.levers.push(lever);
      sprite.on('pointerdown', () => this.tryPullLever(lever));

      // 라벨: 슬롯 + 연산
      const path = ACT1_PUZZLE[slot].paths[choice];
      const sym = choice === 1 ? '①' : '②';
      this.add
        .text(
          cx,
          cy - 20,
          `${slot} ${sym} ${path.op}${format(path.operand)}`,
          {
            color: '#fde68a',
            fontSize: '10px',
            backgroundColor: '#00000099',
            padding: { x: 3, y: 2 },
          }
        )
        .setOrigin(0.5, 1)
        .setDepth(11);
    }

    // 4-d. 문
    // 스폰 규칙: 통로 영역의 "왼쪽 위 끝" 타일 좌상단에 찍기.
    //   item_door_<slot>   → 세로 통로 4×4 (위아래 진입, 패널 좌우 슬라이드)
    //   item_doorh_<slot>  → 가로 통로 1×3 (좌우 진입, 패널 위아래 슬라이드)
    const doorRegex = /^item_door_([abcd])$/i;
    const doorHRegex = /^item_doorh_([abcd])$/i;
    for (const s of spawns) {
      const mV = s.name.match(doorRegex);
      const mH = s.name.match(doorHRegex);
      if (!mV && !mH) continue;

      const slot = (mV ?? mH)![1].toUpperCase() as StudentSlot;
      const isHorizontal = !!mH;

      // 방향별 파라미터 (패널 개수·스케일·위치·충돌) 계산
      let cx: number, cy: number;
      let scaleX: number, scaleY: number;
      let textureKeys: string[];
      let closedPositions: Vec2[];
      let openPositions: Vec2[];
      let collisionW: number, collisionH: number;

      if (!isHorizontal) {
        // 세로 통로 4×4: 패널 2장 좌우로 갈라짐
        cx = s.x + TILE_SIZE * 2;
        cy = s.y + TILE_SIZE * 2;
        scaleX = DOOR_SCALE_X;
        scaleY = DOOR_SCALE_Y;
        textureKeys = ['door_panel_L', 'door_panel_R'];
        closedPositions = [
          { x: cx - DOOR_CLOSED_OFFSET, y: cy },
          { x: cx + DOOR_CLOSED_OFFSET, y: cy },
        ];
        openPositions = [
          { x: cx - DOOR_OPEN_OFFSET, y: cy },
          { x: cx + DOOR_OPEN_OFFSET, y: cy },
        ];
        collisionW = TILE_SIZE * DOOR_COLLISION_WIDTH_TILES;
        collisionH = TILE_SIZE;
      } else {
        // 가로 통로 0.5×5: 패널 1장이 위로 슬라이드, 마스크로 통로 밖 영역이 클립되어 "벽에 가려짐"
        // c = 타일 오른쪽 절반 부착 / d = 왼쪽 절반 부착 / 그 외 = 타일 중앙
        cx =
          slot === 'C' ? s.x + TILE_SIZE * 0.75
          : slot === 'D' ? s.x + TILE_SIZE * 0.25
          : s.x + TILE_SIZE * 0.5;
        cy = s.y + (TILE_SIZE * DOORH_PASSAGE_H_TILES) / 2;
        scaleX = DOORH_SCALE_X;
        scaleY = DOORH_SCALE_Y;
        textureKeys = ['door_panel_L'];
        closedPositions = [{ x: cx, y: cy }];
        openPositions = [{ x: cx, y: cy - DOORH_OPEN_RISE }];
        collisionW = TILE_SIZE * DOORH_PASSAGE_W_TILES;
        collisionH = TILE_SIZE * DOORH_PASSAGE_H_TILES;
      }

      // 패널 생성 — 세로문은 같은 패널을 "하단(depth 9) + 상단(depth 11, 위쪽만 마스크)"
      // 두 벌로 만들어 플레이어(depth 10)가 문 위쪽 뒤로 지나가고, 아래쪽 앞에 서는 유사 3D 효과.
      // 가로문은 단일 스프라이트 + 통로 영역 마스크 (벽에 가려짐).
      const panels: Phaser.GameObjects.Image[] = [];
      const expandedClosed: Vec2[] = [];
      const expandedOpen: Vec2[] = [];

      if (isHorizontal) {
        const maskG = this.make.graphics({}, false);
        maskG.fillStyle(0xffffff);
        maskG.fillRect(cx - collisionW / 2, cy - collisionH / 2, collisionW, collisionH);
        const mask = maskG.createGeometryMask();
        textureKeys.forEach((key, i) => {
          const p = this.add.image(closedPositions[i].x, closedPositions[i].y, key);
          p.setScale(scaleX, scaleY);
          p.setDepth(11);
          p.setTint(0xef4444);
          p.setMask(mask);
          panels.push(p);
          expandedClosed.push(closedPositions[i]);
          expandedOpen.push(openPositions[i]);
        });
      } else {
        // 세로문: 상단 사본에만 "y < cy" 마스크. 하단은 그대로 (자동으로 상단 사본이 위쪽을 덮음)
        const upperMaskG = this.make.graphics({}, false);
        upperMaskG.fillStyle(0xffffff);
        upperMaskG.fillRect(0, 0, MAP_PIXEL_W, cy);
        const upperMask = upperMaskG.createGeometryMask();
        textureKeys.forEach((key, i) => {
          const pos = closedPositions[i];
          const lower = this.add.image(pos.x, pos.y, key);
          lower.setScale(scaleX, scaleY);
          lower.setDepth(9); // 플레이어(10) 아래
          lower.setTint(0xef4444);

          const upper = this.add.image(pos.x, pos.y, key);
          upper.setScale(scaleX, scaleY);
          upper.setDepth(11); // 플레이어(10) 위
          upper.setTint(0xef4444);
          upper.setMask(upperMask);

          panels.push(lower, upper);
          expandedClosed.push(pos, pos);
          expandedOpen.push(openPositions[i], openPositions[i]);
        });
      }

      // 충돌 박스 (통로 방향에 맞춰 회전된 사각형). 문은 닫힌 상태로 시작 → 충돌 활성화.
      const collisionBody = this.add.rectangle(cx, cy, collisionW, collisionH, 0xef4444, 0);
      this.physics.add.existing(collisionBody, true);

      const door: Door = {
        slot,
        panels,
        collisionBody,
        centerX: cx,
        centerY: cy,
        locked: slot !== this.currentSlot,
        isOpen: false,
        closedPositions: expandedClosed,
        openPositions: expandedOpen,
      };
      this.doors.push(door);

      // 각 문에 플레이어 충돌 연결
      this.physics.add.collider(this.player, collisionBody);

      // 슬롯 라벨 — 세로 통로 문은 위, 가로 통로 문은 왼쪽에 붙여서 본체와 안 겹치게
      const labelX = isHorizontal ? cx - TILE_SIZE * 2 - 4 : cx;
      const labelY = isHorizontal ? cy : cy - TILE_SIZE * 2 - 4;
      this.add
        .text(labelX, labelY, `방 ${slot}`, {
          color: '#fde68a',
          fontSize: '11px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(isHorizontal ? 1 : 0.5, isHorizontal ? 0.5 : 1)
        .setDepth(12);
    }

    // 4-e. 배터리 (item_battery) — 텍스처 없으면 blue_core 로 대체
    // 32px 원본을 4배로 키워 재단(4타일) 중앙에 맞춤. 스폰은 타일 좌상단 기준이라 +TILE_SIZE 로 한 타일 보정.
    const batterySpawn = spawns.find((o) => o.name === 'item_battery');
    if (batterySpawn) {
      const key = this.textures.exists('battery') ? 'battery' : 'blue_core';
      if (this.textures.exists(key)) {
        this.battery = this.add.image(
          batterySpawn.x + TILE_SIZE,
          batterySpawn.y + TILE_SIZE,
          key
        );
        this.battery.setScale(BATTERY_BASE_SCALE);
        this.battery.setDepth(9);
        this.battery.setAlpha(0.5); // 꺼져 있는 상태
        // 배터리 본체 충돌박스 (재단 위 스프라이트 4타일 ≈ 128px 중 본체 크기만 잡음)
        this.makeSolid(this.battery, 80, 80);
        this.tweens.add({
          targets: this.battery,
          y: this.battery.y - 6,
          duration: 1200,
          ease: 'Sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      }
    }

    // 4-f. 그 외 item_ (기존 fallback — 이미 처리된 것 제외)
    const handled = new Set([
      ...spawns.filter((o) => leverRegex.test(o.name)).map((o) => o.name),
      ...spawns.filter((o) => doorRegex.test(o.name)).map((o) => o.name),
      'item_battery',
    ]);
    const leftoverItems = spawns.filter(
      (o) => o.name.startsWith('item_') && !handled.has(o.name)
    );
    for (const s of leftoverItems) {
      const itemKey = s.name.replace('item_', '');
      if (!this.textures.exists(itemKey)) continue;
      const item = this.add.image(
        s.x + TILE_SIZE / 2,
        s.y + TILE_SIZE / 2,
        itemKey
      );
      item.setDepth(9);
      this.makeSolid(item, 24, 16, 4);
      this.tweens.add({
        targets: item,
        y: item.y - 3,
        duration: 800,
        ease: 'Sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // 5. 물리
    this.physics.add.collider(this.player, this.walls);
    this.physics.world.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

    // 6. 카메라
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);
    this.cameras.main.setZoom(1.5);

    // 7. 애니메이션
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

    // 8. 입력
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    // 슬롯 스위치 키 1/2/3/4 — 솔로 테스트 전용
    if (this.mode === 'solo') {
      const slotKeys: Array<[string, StudentSlot]> = [
        ['ONE', 'A'],
        ['TWO', 'B'],
        ['THREE', 'C'],
        ['FOUR', 'D'],
      ];
      for (const [keyName, slot] of slotKeys) {
        this.input.keyboard!.on(`keydown-${keyName}`, () =>
          this.switchSlot(slot)
        );
      }
    }

    // 9. HUD — 좌상단
    this.hudText = this.add.text(10, 10, '', {
      color: '#e2e8f0',
      fontSize: '13px',
      fontFamily: 'Pretendard, sans-serif',
      backgroundColor: '#0f172acc',
      padding: { x: 10, y: 8 },
      lineSpacing: 4,
    });
    this.hudText.setScrollFactor(0).setDepth(1000);

    // 10. 디버그 HUD — 우상단
    this.debugText = this.add.text(this.scale.width - 10, 10, '', {
      color: '#94a3b8',
      fontSize: '11px',
      fontFamily: 'monospace',
      backgroundColor: '#0f172a99',
      padding: { x: 6, y: 4 },
      align: 'right',
    });
    this.debugText.setOrigin(1, 0).setScrollFactor(0).setDepth(1000);

    // 11. 토스트 (중앙 하단, 성공/실패 메시지)
    this.toast = this.add.text(this.scale.width / 2, this.scale.height - 80, '', {
      color: '#fde68a',
      fontSize: '18px',
      fontFamily: 'Pretendard, sans-serif',
      fontStyle: 'bold',
      backgroundColor: '#0f172aee',
      padding: { x: 20, y: 12 },
      align: 'center',
    });
    this.toast.setOrigin(0.5).setScrollFactor(0).setDepth(1000).setAlpha(0);

    // 12. 하단 안내
    const hint = this.add.text(
      this.scale.width / 2,
      this.scale.height - 30,
      '방향키 이동 · 1/2/3/4 슬롯 스위치 · 레버·문·NPC 앞에서 Space',
      {
        color: '#93c5fd',
        fontSize: '12px',
        fontFamily: 'Pretendard, sans-serif',
      }
    );
    hint.setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    this.updateHud();
    this.refreshDoorLocks();

    // 대화를 Space 로 닫으면 같은 keydown 이 이 씬의 JustDown(space) 로 한 번 더 잡혀
    // 방금 닫은 대화를 곧바로 재시작시키는 문제가 있음. 닫히는 순간 키 상태를 리셋.
    const unsubDialogue = useDialogueStore.subscribe((state, prev) => {
      if (prev?.open && !state.open) this.spaceKey.reset();
    });
    this.events.once('shutdown', unsubDialogue);

    // 멀티: 서버 이벤트 구독 + 초기 상태는 이미 도착했을 수도 있으니 다음 team:state 를 기다림
    if (this.mode === 'multi') this.subscribeServerEvents();

    // React 상태 패널 표시 (씬 내내 우상단에 노출)
    useAct1Store.getState().show(this.currentSlot, this.selections);
    this.events.once('shutdown', () => useAct1Store.getState().hide());

    // 씬 진입 인트로
    this.showDialogue('intro');
  }

  private subscribeServerEvents() {
    const onTeamState = (p: { teamState: TeamState }) =>
      this.applyServerState(p.teamState);
    const onSolved = (p: { act: number }) => {
      if (p.act === 1) this.playVictoryFromServer();
    };
    const onFailed = (p: { act: number; reason: string }) => {
      if (p.act !== 1) return;
      const status = p.reason === 'overload' ? 'overload' : 'shortage';
      this.playFailureFromServer(status);
    };
    const onPlayerMoved = (p: {
      slot: StudentSlot;
      x: number;
      y: number;
      anim: string | null;
      frame: number;
    }) => this.applyRemotePlayer(p);
    gameEventBus.on('server:teamState', onTeamState);
    gameEventBus.on('server:puzzleSolved', onSolved);
    gameEventBus.on('server:puzzleFailed', onFailed);
    gameEventBus.on('server:playerMoved', onPlayerMoved);
    this.events.once('shutdown', () => {
      gameEventBus.off('server:teamState', onTeamState);
      gameEventBus.off('server:puzzleSolved', onSolved);
      gameEventBus.off('server:puzzleFailed', onFailed);
      gameEventBus.off('server:playerMoved', onPlayerMoved);
    });
  }

  private applyRemotePlayer(p: {
    slot: StudentSlot;
    x: number;
    y: number;
    anim: string | null;
    frame: number;
  }) {
    if (p.slot === this.currentSlot) return; // 자기 자신은 무시
    let rp = this.remotePlayers.get(p.slot);
    if (!rp) {
      const sprite = this.add.sprite(p.x, p.y, 'dragon', p.frame);
      sprite.setDepth(10);
      sprite.setAlpha(0.85);
      const label = this.add.text(p.x, p.y - 36, p.slot, {
        color: '#fbbf24',
        fontSize: '11px',
        fontFamily: 'Pretendard, sans-serif',
        backgroundColor: '#0f172acc',
        padding: { x: 4, y: 2 },
      });
      label.setOrigin(0.5, 1);
      label.setDepth(11);
      rp = {
        slot: p.slot,
        sprite,
        label,
        targetX: p.x,
        targetY: p.y,
        anim: p.anim,
        frame: p.frame,
      };
      this.remotePlayers.set(p.slot, rp);
    } else {
      rp.targetX = p.x;
      rp.targetY = p.y;
      rp.anim = p.anim;
      rp.frame = p.frame;
    }
    if (p.anim) rp.sprite.anims.play(p.anim, true);
    else {
      rp.sprite.anims.stop();
      rp.sprite.setFrame(p.frame);
    }
  }

  // 서버가 보낸 팀 상태를 로컬 렌더에 반영
  private applyServerState(ts: TeamState) {
    this.selections = { ...ts.act1.selections };
    // 레버 비주얼 동기화
    for (const lever of this.levers) {
      const want = this.selections[lever.slot] === lever.choice;
      if (lever.on !== want) {
        lever.on = want;
        lever.sprite.setTexture(want ? 'lever_on' : 'lever_off');
      }
    }
    this.updateHud();
  }

  update() {
    if (!this.player || !this.cursors) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // 다이얼로그 오픈 중이면 입력 차단
    if (useDialogueStore.getState().open) {
      body.setVelocity(0, 0);
      this.player.anims.stop();
      this.player.setFrame(0);
      return;
    }

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

    if (anim) this.player.anims.play(anim, true);
    else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }

    // 근접 감지 — NPC, 레버, 문, 배터리
    this.updateNpcProximity();
    this.updateLeverProximity();
    this.updateDoorProximity();
    this.updateBatteryProximity();

    // Space 상호작용 (우선순위: 레버 > 문 > 배터리 > NPC)
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      if (this.nearbyLever) this.tryPullLever(this.nearbyLever);
      else if (this.nearbyDoor) this.tryOpenDoor(this.nearbyDoor);
      else if (this.nearbyBattery) this.tryInspectBattery();
      else if (this.nearbyNpc) this.tryTalkToNpc(this.nearbyNpc);
    }

    this.debugText.setText(
      `x:${Math.round(this.player.x)} y:${Math.round(this.player.y)}\n` +
        `tile:(${Math.floor(this.player.x / TILE_SIZE)},${Math.floor(this.player.y / TILE_SIZE)})`
    );

    // 멀티: 내 위치 브로드캐스트 (변화 있을 때 + 100ms 쓰로틀)
    if (this.mode === 'multi') {
      const now = this.time.now;
      const moved =
        Math.abs(this.player.x - this.lastBroadcastX) > 1 ||
        Math.abs(this.player.y - this.lastBroadcastY) > 1 ||
        anim !== this.lastBroadcastAnim;
      if (moved && now - this.lastBroadcast > 100) {
        this.lastBroadcast = now;
        this.lastBroadcastX = this.player.x;
        this.lastBroadcastY = this.player.y;
        this.lastBroadcastAnim = anim;
        getSocket().emit('player:move', {
          x: this.player.x,
          y: this.player.y,
          anim,
          frame: this.player.frame.name as unknown as number,
        });
      }

      // 원격 플레이어 위치 보간 (수신 위치로 부드럽게)
      for (const rp of this.remotePlayers.values()) {
        rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, rp.targetX, 0.25);
        rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, rp.targetY, 0.25);
        rp.label.x = rp.sprite.x;
        rp.label.y = rp.sprite.y - 36;
      }
    }
  }

  // ── 근접 감지 ──────────────────────────────
  private updateNpcProximity() {
    let closest: { npc: Npc; dist: number } | null = null;
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        npc.sprite.x,
        npc.sprite.y
      );
      if (d <= NPC_PROXIMITY && (!closest || d < closest.dist))
        closest = { npc, dist: d };
    }
    const next = closest?.npc ?? null;
    if (this.nearbyNpc !== next) {
      if (this.nearbyNpc)
        gameEventBus.emit('npc:proximityLeave', { npcKey: this.nearbyNpc.key });
      if (next)
        gameEventBus.emit('npc:proximityEnter', {
          npcKey: next.key,
          label: next.label,
        });
      this.nearbyNpc = next;
    }
  }

  private updateLeverProximity() {
    let closest: { lever: Lever; dist: number } | null = null;
    for (const lever of this.levers) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        lever.x,
        lever.y
      );
      if (d <= LEVER_PROXIMITY && (!closest || d < closest.dist))
        closest = { lever, dist: d };
    }
    this.nearbyLever = closest?.lever ?? null;
  }

  private updateDoorProximity() {
    let closest: { door: Door; dist: number } | null = null;
    for (const door of this.doors) {
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        door.centerX,
        door.centerY
      );
      if (d <= DOOR_PROXIMITY && (!closest || d < closest.dist))
        closest = { door, dist: d };
    }
    this.nearbyDoor = closest?.door ?? null;
  }

  private updateBatteryProximity() {
    if (!this.battery) {
      this.nearbyBattery = false;
      return;
    }
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.battery.x,
      this.battery.y
    );
    this.nearbyBattery = d <= BATTERY_PROXIMITY;
  }

  // ── 상호작용 ──────────────────────────────
  private tryOpenDoor(door: Door) {
    if (door.isOpen) return;
    if (useDialogueStore.getState().open) return;
    if (door.locked) {
      this.playSfx('sfx_door_denied', 0.4);
      useDialogueStore.getState().show([
        { speaker: 'M.E.S.A', text: '접근 거부. 들어갈 수 없는 방입니다.' },
        { speaker: 'M.E.S.A', text: `이 구역은 ${door.slot} 담당자만 출입할 수 있습니다.` },
      ]);
      return;
    }
    this.setDoorOpen(door, true);
  }

  private tryInspectBattery() {
    if (useDialogueStore.getState().open) return;
    const lines = this.resolved
      ? [
          { speaker: '배터리', text: '배터리가 환하게 빛나며 진동하고 있다.' },
          { speaker: '배터리', text: '전력망이 동기화되었다. 다음 구역으로 갈 수 있을 것 같다.' },
        ]
      : [
          { speaker: '배터리', text: '배터리가 희미하게 반짝이고 있다.' },
          { speaker: '배터리', text: '아직 작동은 안하는 것 같다…' },
        ];
    useDialogueStore.getState().show(lines);
  }

  private tryTalkToNpc(npc: Npc) {
    // 거리 재검사 (클릭은 멀리서도 오기 때문)
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      npc.sprite.x,
      npc.sprite.y
    );
    if (d > NPC_PROXIMITY) return;
    this.showDialogue(npc.key);
  }

  private tryPullLever(lever: Lever) {
    if (useDialogueStore.getState().open) return;
    if (this.resolved) {
      useDialogueStore.getState().show([
        { speaker: '레버', text: '이젠 돌릴 필요가 없을 것 같아.' },
      ]);
      return;
    }

    const sym = lever.choice === 1 ? '①' : '②';
    const path = ACT1_PUZZLE[lever.slot].paths[lever.choice];
    const action = lever.on ? '내리겠습니까' : '올리겠습니까';
    const prompt = `${lever.slot} 방 ${sym} 레버 (${path.op}${format(path.operand)}) 를 ${action}?`;

    useDialogueStore.getState().show(
      [
        {
          speaker: '레버',
          text: prompt,
          choices: [
            { label: '예', value: 'yes' },
            { label: '아니오', value: 'no' },
          ],
        },
      ],
      (v) => {
        if (v === 'yes') this.executePullLever(lever);
      }
    );
  }

  private executePullLever(lever: Lever) {
    if (this.resolved) return;

    // ===== 멀티 =====
    if (this.mode === 'multi') {
      if (lever.slot !== this.currentSlot) {
        this.showToast(`${lever.slot} 팀원이 조작하는 레버입니다`, 1500);
        return;
      }
      // 이미 켜진 같은 레버 → 해제(null), 그 외 → 해당 choice 로
      const nextChoice: PathChoice | null = lever.on ? null : lever.choice;
      getSocket().emit('puzzle:action', {
        act: 1,
        type: 'selectPath',
        choice: nextChoice,
      });
      return;
    }

    // ===== 솔로 =====
    // 다른 슬롯 레버 클릭 시 슬롯 자동 전환 (모든 문 닫고 색상 재계산)
    if (lever.slot !== this.currentSlot) {
      this.currentSlot = lever.slot;
      for (const d of this.doors) this.setDoorOpen(d, false);
      this.refreshDoorLocks();
    }

    if (lever.on) {
      // 이미 켜진 레버를 다시 누르면 끔 → 선택 해제
      lever.on = false;
      lever.sprite.setTexture('lever_off');
      this.selections[lever.slot] = null;
    } else {
      // 같은 슬롯의 다른 레버는 자동으로 꺼짐
      for (const other of this.levers) {
        if (other.slot === lever.slot && other !== lever && other.on) {
          other.on = false;
          other.sprite.setTexture('lever_off');
        }
      }
      lever.on = true;
      lever.sprite.setTexture('lever_on');
      this.selections[lever.slot] = lever.choice;
    }

    this.updateHud();
    this.refreshDoorLocks();
    this.checkAllSelected();
  }

  private switchSlot(slot: StudentSlot) {
    if (this.resolved) return;
    this.currentSlot = slot;
    for (const d of this.doors) this.setDoorOpen(d, false);
    this.updateHud();
    this.refreshDoorLocks();
    this.showToast(`당신은 이제 ${slot} 입니다`, 1200);
  }

  // ── 문 상태 ──────────────────────────────
  // locked: 슬롯 매칭 기반 (색상만 반영). 열림/닫힘과 독립.
  // isOpen: Space 상호작용으로 토글 (패널 위치 + 충돌 반영).
  private refreshDoorLocks() {
    for (const door of this.doors) {
      door.locked = door.slot !== this.currentSlot;
      const tint = door.locked ? 0xef4444 : 0x10b981;
      for (const p of door.panels) p.setTint(tint);
    }
  }

  private setDoorOpen(door: Door, isOpen: boolean) {
    if (door.isOpen === isOpen) return;
    door.isOpen = isOpen;

    this.playSfx('sfx_door_open', 0.5, 0.2); // 열림·닫힘 공용 효과음 (앞 0.2초 묵음 스킵)

    const positions = isOpen ? door.openPositions : door.closedPositions;
    door.panels.forEach((panel, i) => {
      const target = positions[i];
      this.tweens.add({
        targets: panel,
        x: target.x,
        y: target.y,
        duration: 350,
        ease: 'Cubic.easeOut',
      });
    });

    const body = door.collisionBody.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = !isOpen;
  }

  // 에셋이 실제로 로드된 경우에만 재생 (파일 없으면 무시). seek 은 시작 오프셋(초).
  private playSfx(key: string, volume = 0.5, seek = 0) {
    if (!this.cache.audio.exists(key)) return;
    this.sound.play(key, { volume, seek });
  }

  // ── HUD ──────────────────────────────
  private updateHud() {
    const myMeta = ACT1_PUZZLE[this.currentSlot];
    const mySel = this.selections[this.currentSlot];
    const myCurrent = mySel == null ? myMeta.start : myMeta.paths[mySel].arrival;
    const mySym = mySel == null ? '시작' : mySel === 1 ? '①' : '②';

    const switchHint = this.mode === 'solo' ? '  (1/2/3/4 스위치)' : '';

    const lines: string[] = [
      `🎯 목표 합: 8/8 (= 1)`,
      `👤 당신: ${this.currentSlot} 방${switchHint}`,
      `📍 내 분수: ${format(myCurrent)}  (${mySym})`,
      ``,
      `📊 팀 진행:`,
    ];
    const sums: number[] = [];
    for (const slot of ['A', 'B', 'C', 'D'] as StudentSlot[]) {
      const meta = ACT1_PUZZLE[slot];
      const sel = this.selections[slot];
      const marker = slot === this.currentSlot ? '▶' : ' ';
      if (sel == null) {
        lines.push(`  ${marker} ${slot}: ${format(meta.start)} → ?`);
      } else {
        const arrival = meta.paths[sel].arrival;
        const sym = sel === 1 ? '①' : '②';
        lines.push(`  ${marker} ${slot}: ${format(meta.start)} → ${format(arrival)} ${sym}`);
        sums.push(arrival.numerator);
      }
    }
    const total = sums.reduce((a, b) => a + b, 0);
    const allSet = Object.values(this.selections).every((v) => v !== null);
    lines.push('');
    lines.push(
      allSet
        ? `현재 합: ${total}/8 (자동 판정 중)`
        : `현재 합: ${total}/8 (진행 중)`
    );

    this.hudText.setText(lines.join('\n'));

    // React 사이드 패널 동기화
    useAct1Store.getState().sync(this.currentSlot, this.selections);
  }

  // ── 자동 판정 ──────────────────────────────
  private checkAllSelected() {
    const slots: StudentSlot[] = ['A', 'B', 'C', 'D'];
    const all = slots.every((s) => this.selections[s] != null);
    if (!all) return;

    const final: Record<StudentSlot, PathChoice> = {
      A: this.selections.A!,
      B: this.selections.B!,
      C: this.selections.C!,
      D: this.selections.D!,
    };
    const evaluation = evaluateAct1(final);
    if (evaluation.status === 'solved') this.playVictory(evaluation);
    else this.playFailure(evaluation);
  }

  // ===== 승리/실패 공통 비주얼 =====
  private playVictoryCore() {
    this.resolved = true;
    this.showDialogue('victory');
    this.cameras.main.shake(600, 0.008);
    if (this.battery) {
      this.tweens.add({
        targets: this.battery,
        alpha: 1,
        scale: BATTERY_PULSE_SCALE,
        duration: 800,
        ease: 'Cubic.easeOut',
        yoyo: true,
        hold: 200,
        onComplete: () => this.battery?.setScale(BATTERY_RESTING_SCALE),
      });
    }
    for (const door of this.doors) {
      door.locked = false;
      for (const p of door.panels) p.setTint(0x10b981);
      this.setDoorOpen(door, true);
    }
    gameEventBus.emit('act1:solved');
  }

  private playFailureCore(status: 'overload' | 'shortage') {
    this.showDialogue(status === 'overload' ? 'fail_overload' : 'fail_shortage');
    this.cameras.main.shake(250, 0.004);
  }

  // solo: 로컬 판정 결과로 승리 연출
  private playVictory(_ev: Act1Evaluation) {
    this.playVictoryCore();
  }

  // solo: 로컬 판정 결과로 실패 + 로컬 리셋
  private playFailure(ev: Act1Evaluation) {
    this.playFailureCore(ev.status === 'overload' ? 'overload' : 'shortage');
    this.time.delayedCall(800, () => {
      for (const lever of this.levers) {
        lever.on = false;
        lever.sprite.setTexture('lever_off');
      }
      this.selections = { A: null, B: null, C: null, D: null };
      this.updateHud();
    });
  }

  // multi: 서버 권위 이벤트에서 호출 (로컬 리셋은 team:state 가 알아서)
  private playVictoryFromServer() {
    this.playVictoryCore();
  }

  private playFailureFromServer(status: 'overload' | 'shortage') {
    this.playFailureCore(status);
  }

  // 아이템/NPC 아래에 별도 정적 충돌 박스를 붙임 (발치/밑단만 잡아 가까이 가도 겹치지 않게)
  // offsetY: 스프라이트 중심에서 아래로 얼마나 내릴지 (+ = 아래)
  private makeSolid(
    go: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    w: number,
    h: number,
    offsetY = 0
  ) {
    const rect = this.add.rectangle(go.x, go.y + offsetY, w, h, 0xff0000, 0);
    this.physics.add.existing(rect, true);
    this.physics.add.collider(this.player, rect);
  }

  // dialogue_act1 JSON 에서 키로 대사 묶음을 꺼내 스토어에 주입
  private showDialogue(key: string) {
    const script = this.cache.json.get('dialogue_act1') as
      | DialogueScript
      | undefined;
    const lines = script?.[key];
    if (!lines?.length) return;
    useDialogueStore.getState().show(lines);
  }

  private showToast(msg: string, durationMs: number) {
    this.toast.setText(msg);
    this.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(1);
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      delay: durationMs,
      duration: 400,
    });
  }
}
