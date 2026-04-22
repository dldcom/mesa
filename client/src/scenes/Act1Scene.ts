// 1막: 전력망 동기화
// 월드 내 상호작용 기반 퍼즐:
// - 레버 8개 (A/B/C/D × 2) 중 각 슬롯마다 1개만 당길 수 있음
// - 4슬롯 전원 선택 완료 시 자동 판정
// - 성공: 배터리 점등 + 카메라 쉐이크 / 실패: 전원 리셋
// 솔로 테스트: 플레이어 혼자 네 방을 오가며 전부 당겨볼 수 있음.

import Phaser from 'phaser';
import { gameEventBus } from '@/lib/gameEventBus';
import {
  ACT1_PUZZLE,
  evaluateAct1,
  type PathChoice,
  type StudentSlot,
  type Act1Evaluation,
} from '@shared/lib/act1Logic';
import { format } from '@shared/lib/fraction';

const TILE_SIZE = 32;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;
const MAP_PIXEL_W = TILE_SIZE * MAP_WIDTH;
const MAP_PIXEL_H = TILE_SIZE * MAP_HEIGHT;
const PLAYER_SPEED = 180;
const NPC_PROXIMITY = 56;
const LEVER_PROXIMITY = 44;

// 문 충돌 박스 가로 너비(타일 단위). 맵 통로가 4타일이면 4 로 확장.
const DOOR_COLLISION_WIDTH_TILES = 4;

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

type DoorState = 'available' | 'locked';

type Door = {
  slot: StudentSlot;
  panelL: Phaser.GameObjects.Image;
  panelR: Phaser.GameObjects.Image;
  collisionBody: Phaser.GameObjects.Rectangle;
  centerX: number;
  centerY: number;
  state: DoorState;
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

  // 입력
  private spaceKey!: Phaser.Input.Keyboard.Key;

  // 퍼즐 상태
  private selections: Record<StudentSlot, PathChoice | null> = {
    A: null,
    B: null,
    C: null,
    D: null,
  };
  private currentSlot: StudentSlot = 'A'; // 솔로 테스트: 1/2/3/4 키로 스위치
  private resolved = false; // 성공 후 잠금

  constructor() {
    super('Act1Scene');
  }

  create() {
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
      sprite.setDepth(9);
      sprite.setInteractive({ useHandCursor: true });
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

    // 4-d. 문 (item_door_<slot>)
    const doorRegex = /^item_door_([abcd])$/i;
    for (const s of spawns) {
      const m = s.name.match(doorRegex);
      if (!m) continue;
      const slot = m[1].toUpperCase() as StudentSlot;
      const cx = s.x + TILE_SIZE / 2;
      const cy = s.y + TILE_SIZE / 2;

      const panelL = this.add.image(cx - 8, cy, 'door_panel_L');
      const panelR = this.add.image(cx + 8, cy, 'door_panel_R');
      panelL.setDepth(11);
      panelR.setDepth(11);
      // 초기 색: 열림=초록 (updateDoorLocks() 가 create() 끝에서 보정)
      panelL.setTint(0x10b981);
      panelR.setTint(0x10b981);

      // 충돌 박스 — 통로 폭 전체 커버 (4타일)
      const collisionBody = this.add.rectangle(
        cx,
        cy,
        TILE_SIZE * DOOR_COLLISION_WIDTH_TILES,
        TILE_SIZE,
        0xef4444,
        0 // 투명
      );
      this.physics.add.existing(collisionBody, true);
      const body = collisionBody.body as Phaser.Physics.Arcade.StaticBody;
      body.enable = false; // 초기 상태: available (통과 가능)

      const door: Door = {
        slot,
        panelL,
        panelR,
        collisionBody,
        centerX: cx,
        centerY: cy,
        state: 'available',
      };
      this.doors.push(door);

      // 각 문에 플레이어 충돌 연결
      this.physics.add.collider(this.player, collisionBody);

      // 슬롯 라벨 (문 위)
      this.add
        .text(cx, cy - 24, `방 ${slot}`, {
          color: '#fde68a',
          fontSize: '11px',
          backgroundColor: '#00000099',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(12);
    }

    // 4-e. 배터리 (item_battery) — 텍스처 없으면 blue_core 로 대체
    const batterySpawn = spawns.find((o) => o.name === 'item_battery');
    if (batterySpawn) {
      const key = this.textures.exists('battery') ? 'battery' : 'blue_core';
      if (this.textures.exists(key)) {
        this.battery = this.add.image(
          batterySpawn.x + TILE_SIZE / 2,
          batterySpawn.y + TILE_SIZE / 2,
          key
        );
        this.battery.setDepth(9);
        this.battery.setAlpha(0.5); // 꺼져 있는 상태
        this.tweens.add({
          targets: this.battery,
          y: this.battery.y - 3,
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
    // 슬롯 스위치 키 1/2/3/4 — 솔로 테스트용
    const slotKeys: Array<[string, StudentSlot]> = [
      ['ONE', 'A'],
      ['TWO', 'B'],
      ['THREE', 'C'],
      ['FOUR', 'D'],
    ];
    for (const [keyName, slot] of slotKeys) {
      this.input.keyboard!.on(`keydown-${keyName}`, () => this.switchSlot(slot));
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
      '방향키 이동 · 1/2/3/4 슬롯 스위치 · 레버·NPC 앞에서 Space',
      {
        color: '#93c5fd',
        fontSize: '12px',
        fontFamily: 'Pretendard, sans-serif',
      }
    );
    hint.setOrigin(0.5).setScrollFactor(0).setDepth(1000);

    this.updateHud();
    this.updateDoorLocks();
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

    if (anim) this.player.anims.play(anim, true);
    else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }

    // 근접 감지 — NPC, 레버
    this.updateNpcProximity();
    this.updateLeverProximity();

    // Space 상호작용
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      if (this.nearbyLever) this.tryPullLever(this.nearbyLever);
      else if (this.nearbyNpc) this.tryTalkToNpc(this.nearbyNpc);
    }

    this.debugText.setText(
      `x:${Math.round(this.player.x)} y:${Math.round(this.player.y)}\n` +
        `tile:(${Math.floor(this.player.x / TILE_SIZE)},${Math.floor(this.player.y / TILE_SIZE)})`
    );
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

  // ── 상호작용 ──────────────────────────────
  private tryTalkToNpc(npc: Npc) {
    // 거리 재검사 (클릭은 멀리서도 오기 때문)
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      npc.sprite.x,
      npc.sprite.y
    );
    if (d > NPC_PROXIMITY) return;
    this.showToast('"네 방의 레버를 당기고 전원이 끝나길 기다려라."', 2600);
  }

  private tryPullLever(lever: Lever) {
    if (this.resolved) return;
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      lever.x,
      lever.y
    );
    if (d > LEVER_PROXIMITY) return;

    // 솔로 테스트: 현재 슬롯과 매칭되는 레버만 당길 수 있음
    if (lever.slot !== this.currentSlot) {
      this.showToast(
        `이건 ${lever.slot} 슬롯 레버입니다. 현재 당신은 ${this.currentSlot} (1/2/3/4 로 변경)`,
        1800
      );
      return;
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
    this.updateDoorLocks();
    this.checkAllSelected();
  }

  private switchSlot(slot: StudentSlot) {
    if (this.resolved) return;
    this.currentSlot = slot;
    this.updateHud();
    this.updateDoorLocks();
    this.showToast(`당신은 이제 ${slot} 입니다`, 1200);
  }

  // ── 문 상태 ──────────────────────────────
  private updateDoorLocks() {
    // 솔로 테스트 규칙: 내가 아닌 슬롯의 문은 "잠김(빨강)" + 통과 불가
    //                  내 슬롯의 문은 "열림(초록)" + 통과 가능
    for (const door of this.doors) {
      const nextState: DoorState =
        door.slot === this.currentSlot ? 'available' : 'locked';
      if (door.state === nextState) continue;
      this.setDoorState(door, nextState);
    }
  }

  private setDoorState(door: Door, state: DoorState) {
    door.state = state;
    const tint = state === 'locked' ? 0xef4444 : 0x10b981;
    door.panelL.setTint(tint);
    door.panelR.setTint(tint);

    // 열기/닫기 트윈
    const targetLX = state === 'available' ? door.centerX - 16 : door.centerX - 8;
    const targetRX = state === 'available' ? door.centerX + 16 : door.centerX + 8;
    this.tweens.add({
      targets: door.panelL,
      x: targetLX,
      duration: 350,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: door.panelR,
      x: targetRX,
      duration: 350,
      ease: 'Cubic.easeOut',
    });

    // 충돌 토글
    const body = door.collisionBody.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = state === 'locked';
  }

  // ── HUD ──────────────────────────────
  private updateHud() {
    const lines: string[] = [
      `🎯 목표 합: 8/8 (= 1)`,
      `👤 당신: ${this.currentSlot}  (1/2/3/4 스위치)`,
      ``,
    ];
    const sums: number[] = [];
    for (const slot of ['A', 'B', 'C', 'D'] as StudentSlot[]) {
      const sel = this.selections[slot];
      if (sel == null) {
        lines.push(`  ${slot}: 대기 중…`);
      } else {
        const arrival = ACT1_PUZZLE[slot].paths[sel].arrival;
        const sym = sel === 1 ? '①' : '②';
        lines.push(`  ${slot}: ${sym} → ${format(arrival)}`);
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

  private playVictory(ev: Act1Evaluation) {
    this.resolved = true;
    this.showToast(`✅ 배터리 완충 — 통로 개방  (합 ${format(ev.sum)})`, 4000);
    // 카메라 쉐이크
    this.cameras.main.shake(600, 0.008);
    // 배터리 점등
    if (this.battery) {
      this.tweens.add({
        targets: this.battery,
        alpha: 1,
        scale: 1.3,
        duration: 800,
        ease: 'Cubic.easeOut',
        yoyo: true,
        hold: 200,
        onComplete: () => this.battery?.setScale(1.1),
      });
    }
    // 모든 문 열림 (애니메이션)
    for (const door of this.doors) this.setDoorState(door, 'available');
    gameEventBus.emit('act1:solved');
  }

  private playFailure(ev: Act1Evaluation) {
    const msg =
      ev.status === 'overload'
        ? `⚠️ 과부하  (+${format(ev.diff)})  — 다시 선택`
        : `⚠️ 에너지 부족 (${format(ev.diff)}) — 다시 선택`;
    this.showToast(msg, 2800);
    // 짧은 쉐이크
    this.cameras.main.shake(250, 0.004);
    // 전원 리셋: 모든 레버 + selections
    this.time.delayedCall(800, () => {
      for (const lever of this.levers) {
        lever.on = false;
        lever.sprite.setTexture('lever_off');
      }
      this.selections = { A: null, B: null, C: null, D: null };
      this.updateHud();
    });
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
