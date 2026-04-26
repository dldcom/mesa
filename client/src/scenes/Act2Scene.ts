// 2막: 냉각수 코어 식별
// 6개 코어 → 양팔 저울로 비교 + 4명 단서로 추론 → 정답 코어(파랑=7/4)를 투입구에 제출
// solo 모드: 슬롯 A 단서만 보임 (테스트 편의)
// multi 모드: 본인 슬롯 단서만 보임, 저울/제출은 서버 권위

import Phaser from 'phaser';
import { gameEventBus } from '@/lib/gameEventBus';
import { getSocket } from '@/services/socket';
import { useDialogueStore, type DialogueScript } from '@/store/useDialogueStore';
import { useAct2Store } from '@/store/useAct2Store';
import {
  ACT2_CORE_COLORS,
  ACT2_TARGET_COLOR,
  CORE_COLOR_HEX,
  CORE_COLOR_LABELS,
} from '@shared/lib/act2Logic';
import type {
  Act2State,
  CoreColor,
  StudentSlot,
  TeamState,
} from '@shared/types/game';
import { ACT2_SPAWNS } from '@shared/maps/act2.spawns';
import { requireSpawn } from '@shared/maps/types';
import {
  animKey,
  ensureCharacterAnimations,
  getSlotCharacters,
  readMovementInput,
} from './characterAnims';
import type { Character } from '@shared/types/game';

const VIEW_W = 1280;
const VIEW_H = 720;
const PLAYER_SPEED = 180;

// 저울 — 위치는 ACT2_SPAWNS 의 'item_scale_center' 에서, 빔 길이만 코드 상수
const SCALE_BEAM_LEN = 220; // 빔 양쪽 길이 (시각 디자인 상수)
const PAN_DROP_RADIUS = 70; // 코어 드롭 인식 반경
const SCALE_PILLAR_BASE_Y = 560; // 받침대 바닥 (시각용)

// 코어 시각 사이즈 (위치는 ACT2_SPAWNS 에서)
const CORE_SIZE = 56;

// 투입구 시각 사이즈 (위치는 ACT2_SPAWNS 에서)
const INLET_W = 180;
const INLET_H = 130;
const INLET_DROP_RADIUS = 90;

// NPC 인접 거리
const NPC_PROXIMITY = 80;

// ── ACT2_SPAWNS 에서 위치 lookup ──
const PLAYER_SPAWN = requireSpawn(ACT2_SPAWNS, 'playerspawn');
const RESEARCHER_SPAWN = requireSpawn(ACT2_SPAWNS, 'npc_researcher');
const SCALE_CENTER = requireSpawn(ACT2_SPAWNS, 'item_scale_center');
const INLET_SPAWN = requireSpawn(ACT2_SPAWNS, 'item_inlet');

const SCALE_CENTER_X = SCALE_CENTER.x;
const SCALE_CENTER_Y = SCALE_CENTER.y;
const SCALE_PILLAR_TOP_Y = SCALE_CENTER_Y;
const RESEARCHER_X = RESEARCHER_SPAWN.x;
const RESEARCHER_Y = RESEARCHER_SPAWN.y;
const INLET_X = INLET_SPAWN.x;
const INLET_Y = INLET_SPAWN.y;

type CoreSprite = {
  color: CoreColor;
  homeX: number;
  homeY: number;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  dragging: boolean;
};

export default class Act2Scene extends Phaser.Scene {
  private mode: 'solo' | 'multi' = 'solo';
  private mySlot: StudentSlot = 'A';
  private myCharacter: Character = 'dragon';
  private slotCharacters: Record<StudentSlot, Character> = {
    A: 'dragon', B: 'dragon', C: 'dragon', D: 'dragon',
  };

  private player!: Phaser.Physics.Arcade.Sprite;
  private selfLabel!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private toast!: Phaser.GameObjects.Text;

  private cores = new Map<CoreColor, CoreSprite>();
  private scaleBeam!: Phaser.GameObjects.Rectangle;
  private leftPanX = 0;
  private leftPanY = 0;
  private rightPanX = 0;
  private rightPanY = 0;

  private researcher!: Phaser.GameObjects.Sprite;
  private nearbyResearcher = false;
  private resolved = false;

  // 서버 상태 캐시
  private state: Act2State = {
    scaleLeft: null,
    scaleRight: null,
    scaleTilt: 'empty',
    submittedCore: null,
  };

  constructor() {
    super('Act2Scene');
  }

  create() {
    this.mode = (this.registry.get('mode') as 'solo' | 'multi') ?? 'solo';
    this.mySlot = (this.registry.get('mySlot') as StudentSlot | undefined) ?? 'A';
    this.myCharacter =
      (this.registry.get('myCharacter') as Character | undefined) ?? 'dragon';
    this.slotCharacters = getSlotCharacters();
    this.slotCharacters[this.mySlot] = this.myCharacter;

    this.drawBackground();
    ensureCharacterAnimations(this);
    this.spawnPlayer();
    this.spawnResearcher();
    this.spawnScale();
    this.spawnCores();
    this.spawnInlet();
    this.spawnToast();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );

    this.cameras.main.setBounds(0, 0, VIEW_W, VIEW_H);

    // HUD 단서 패널 표시
    useAct2Store.getState().show(this.mySlot);

    // 멀티: 서버 상태 구독
    if (this.mode === 'multi') {
      const onTeamState = ({ teamState }: { teamState: TeamState }) => {
        this.applyServerState(teamState);
      };
      const onSolved = ({ act }: { act: number }) => {
        if (act !== 2 || this.resolved) return;
        this.resolved = true;
        this.handleVictory();
      };
      const onFailed = ({ act }: { act: number; reason: string }) => {
        if (act !== 2) return;
        this.handleFailure();
      };
      gameEventBus.on('server:teamState', onTeamState);
      gameEventBus.on('server:puzzleSolved', onSolved);
      gameEventBus.on('server:puzzleFailed', onFailed);
      this.events.once('shutdown', () => {
        gameEventBus.off('server:teamState', onTeamState);
        gameEventBus.off('server:puzzleSolved', onSolved);
        gameEventBus.off('server:puzzleFailed', onFailed);
      });
    }

    this.events.once('shutdown', () => {
      useAct2Store.getState().hide();
      useDialogueStore.getState().close();
    });

    // 대화를 Space 로 닫으면 같은 keydown 이 update() 의 JustDown(space) 로 한 번 더 잡혀서
    // 방금 닫은 대화가 곧바로 재시작되는 문제가 있음. 닫히는 순간 Phaser 키 상태를 리셋.
    const unsubDialogue = useDialogueStore.subscribe((state, prev) => {
      if (prev?.open && !state.open) this.spaceKey.reset();
    });
    this.events.once('shutdown', unsubDialogue);

    // 인트로 대사
    this.time.delayedCall(500, () => this.showDialogue('intro'));
  }

  // ── 배경: act2.png (빈 냉각실) 한 장 ──
  private drawBackground() {
    const bg = this.add.image(0, 0, 'act2_bg');
    bg.setOrigin(0, 0);
    bg.setDisplaySize(VIEW_W, VIEW_H);
    bg.setDepth(0);
  }

  private spawnPlayer() {
    this.player = this.physics.add.sprite(
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      this.myCharacter,
      0
    );
    this.player.setDepth(15);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(32, 20);
    this.player.setOffset(8, 40);
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.selfLabel = this.add
      .text(this.player.x, this.player.y - 36, this.mySlot, {
        color: '#22d3ee',
        fontSize: '11px',
        fontFamily: 'Pretendard, sans-serif',
        fontStyle: 'bold',
        backgroundColor: '#0f172acc',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(16);
  }

  private spawnResearcher() {
    this.researcher = this.add.sprite(RESEARCHER_X, RESEARCHER_Y, 'researcher', 0);
    this.researcher.setDepth(15);
    this.researcher.setAlpha(0.85);
    this.add
      .text(RESEARCHER_X, RESEARCHER_Y - 38, '연구원 (홀로그램)', {
        color: '#67e8f9',
        fontSize: '11px',
        fontFamily: 'Pretendard, sans-serif',
        backgroundColor: '#0f172acc',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(16);
  }

  // ── 양팔 저울 (받침 + 회전 가능한 빔 + 양쪽 접시) ──
  private spawnScale() {
    // 받침대
    this.add.rectangle(
      SCALE_CENTER_X,
      (SCALE_PILLAR_TOP_Y + SCALE_PILLAR_BASE_Y) / 2,
      24,
      SCALE_PILLAR_BASE_Y - SCALE_PILLAR_TOP_Y,
      0x6b7280
    ).setDepth(5);
    this.add.rectangle(SCALE_CENTER_X, SCALE_PILLAR_BASE_Y, 180, 24, 0x4b5563).setDepth(5);
    // 회전축
    this.add.circle(SCALE_CENTER_X, SCALE_CENTER_Y, 14, 0x9ca3af).setDepth(7);

    // 빔 (회전체)
    this.scaleBeam = this.add.rectangle(
      SCALE_CENTER_X,
      SCALE_CENTER_Y,
      SCALE_BEAM_LEN * 2,
      14,
      0xe5e7eb
    );
    this.scaleBeam.setDepth(6);

    // 접시 위치 (수평 상태 기준 — 빔 회전 시 update 에서 갱신)
    this.recomputePanPositions(0);
  }

  private recomputePanPositions(tiltRad: number) {
    // 빔 회전. 왼쪽이 무거우면 왼쪽 내려가고 오른쪽 올라감.
    const dx = Math.cos(tiltRad) * SCALE_BEAM_LEN;
    const dy = Math.sin(tiltRad) * SCALE_BEAM_LEN;
    this.leftPanX = SCALE_CENTER_X - dx;
    this.leftPanY = SCALE_CENTER_Y - dy;
    this.rightPanX = SCALE_CENTER_X + dx;
    this.rightPanY = SCALE_CENTER_Y + dy;
  }

  private spawnCores() {
    // 코어 홈 위치는 ACT2_SPAWNS 의 'item_core_<color>' 에서 직접 lookup
    ACT2_CORE_COLORS.forEach((color) => {
      const spawn = requireSpawn(ACT2_SPAWNS, `item_core_${color}`);
      const homeX = spawn.x;
      const homeY = spawn.y;
      const container = this.add.container(homeX, homeY);
      container.setDepth(20);

      const body = this.add.rectangle(0, 0, CORE_SIZE, CORE_SIZE, CORE_COLOR_HEX[color]);
      body.setStrokeStyle(2, 0x000000, 0.5);
      const label = this.add
        .text(0, 0, '?', {
          color: '#fff',
          fontSize: '20px',
          fontFamily: 'Pretendard, sans-serif',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      // 코어 색 한글 라벨 (작게 아래)
      const colorTag = this.add
        .text(0, CORE_SIZE / 2 + 12, CORE_COLOR_LABELS[color], {
          color: '#cbd5e1',
          fontSize: '11px',
          fontFamily: 'Pretendard, sans-serif',
          backgroundColor: '#0f172acc',
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5);
      container.add([body, label, colorTag]);

      container.setSize(CORE_SIZE, CORE_SIZE);
      container.setInteractive({ draggable: true, useHandCursor: true });
      this.input.setDraggable(container);

      const sprite: CoreSprite = {
        color,
        homeX,
        homeY,
        container,
        body,
        label,
        dragging: false,
      };
      this.cores.set(color, sprite);

      container.on('dragstart', () => {
        if (this.resolved) return;
        sprite.dragging = true;
        container.setDepth(40);
      });
      container.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        if (this.resolved) return;
        container.x = dx;
        container.y = dy;
      });
      container.on('dragend', (p: Phaser.Input.Pointer) => {
        if (this.resolved) return;
        sprite.dragging = false;
        container.setDepth(20);
        this.handleCoreDrop(sprite, p.x, p.y);
      });
    });
  }

  // 드롭 위치 판정 → 액션 발사 OR 홈 복귀
  private handleCoreDrop(sprite: CoreSprite, px: number, py: number) {
    // 투입구 영역?
    if (
      Math.abs(px - INLET_X) < INLET_DROP_RADIUS &&
      Math.abs(py - INLET_Y) < INLET_DROP_RADIUS
    ) {
      // 제출 — 확인 다이얼로그
      this.confirmSubmit(sprite.color);
      this.snapBack(sprite); // 잠시 홈으로 (서버 응답 후 재배치)
      return;
    }
    // 왼쪽 접시?
    if (
      Math.hypot(px - this.leftPanX, py - this.leftPanY) < PAN_DROP_RADIUS
    ) {
      this.sendAction({ act: 2, type: 'placeOnScale', color: sprite.color, side: 'left' });
      // 낙관적 — 서버 응답 전 임시 위치 (서버 응답 오면 정확히 재배치)
      this.snapToPan(sprite, 'left');
      return;
    }
    if (
      Math.hypot(px - this.rightPanX, py - this.rightPanY) < PAN_DROP_RADIUS
    ) {
      this.sendAction({ act: 2, type: 'placeOnScale', color: sprite.color, side: 'right' });
      this.snapToPan(sprite, 'right');
      return;
    }
    // 그 외 — 만약 저울 위에 있던 코어를 멀리 옮기면 제거
    if (this.state.scaleLeft === sprite.color) {
      this.sendAction({ act: 2, type: 'removeFromScale', side: 'left' });
    } else if (this.state.scaleRight === sprite.color) {
      this.sendAction({ act: 2, type: 'removeFromScale', side: 'right' });
    }
    this.snapBack(sprite);
  }

  private snapBack(sprite: CoreSprite) {
    this.tweens.add({
      targets: sprite.container,
      x: sprite.homeX,
      y: sprite.homeY,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
  }

  private snapToPan(sprite: CoreSprite, side: 'left' | 'right') {
    const x = side === 'left' ? this.leftPanX : this.rightPanX;
    const y = side === 'left' ? this.leftPanY : this.rightPanY;
    this.tweens.add({
      targets: sprite.container,
      x,
      y: y - CORE_SIZE / 2 - 12,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
  }

  // ── 투입구 (코어 제출 영역) ──
  private spawnInlet() {
    this.add.rectangle(INLET_X, INLET_Y, INLET_W, INLET_H, 0x111827).setDepth(3);
    this.add.rectangle(INLET_X, INLET_Y, INLET_W, INLET_H, 0x000000, 0)
      .setStrokeStyle(3, 0xfbbf24, 0.85)
      .setDepth(4);
    this.add
      .text(INLET_X, INLET_Y - 8, '🎯 코어 투입구', {
        color: '#fde68a',
        fontSize: '14px',
        fontFamily: 'Pretendard, sans-serif',
        fontStyle: 'bold',
      })
      .setOrigin(0.5).setDepth(4);
    this.add
      .text(INLET_X, INLET_Y + 16, '여기로 드래그', {
        color: '#94a3b8',
        fontSize: '11px',
        fontFamily: 'Pretendard, sans-serif',
      })
      .setOrigin(0.5).setDepth(4);
  }

  private spawnToast() {
    this.toast = this.add
      .text(VIEW_W / 2, 100, '', {
        color: '#fde68a',
        fontSize: '18px',
        fontFamily: 'Pretendard, sans-serif',
        fontStyle: 'bold',
        backgroundColor: '#0f172ae6',
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(80)
      .setAlpha(0);
  }

  private showToast(text: string, durationMs = 1500) {
    this.toast.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({
      targets: this.toast,
      alpha: 0,
      duration: 500,
      delay: durationMs,
    });
  }

  // ── 서버 액션 송신 ──
  private sendAction(action: unknown) {
    if (this.mode !== 'multi') {
      // solo 는 일단 액션 결과를 로컬에서 흉내 (간이 — 서버 무게 매핑 모르므로 tilt 는 'balanced' 로)
      // TODO: solo 도 정확한 시뮬을 원하면 클라에 act2Logic 의 weights 까지 노출 필요
      this.simulateLocalAction(action as { act: number; type: string; color?: CoreColor; side?: 'left' | 'right' });
      return;
    }
    getSocket().emit('puzzle:action', action);
  }

  private simulateLocalAction(action: { act: number; type: string; color?: CoreColor; side?: 'left' | 'right' }) {
    if (action.act !== 2) return;
    const next = { ...this.state };
    if (action.type === 'placeOnScale' && action.color && action.side) {
      if (action.side === 'left' && next.scaleRight === action.color) next.scaleRight = null;
      if (action.side === 'right' && next.scaleLeft === action.color) next.scaleLeft = null;
      if (action.side === 'left') next.scaleLeft = action.color;
      else next.scaleRight = action.color;
    } else if (action.type === 'removeFromScale' && action.side) {
      if (action.side === 'left') next.scaleLeft = null;
      else next.scaleRight = null;
    } else if (action.type === 'submit' && action.color) {
      const correct = action.color === ACT2_TARGET_COLOR;
      if (correct) {
        this.resolved = true;
        this.handleVictory();
      } else {
        this.handleFailure();
      }
      return;
    }
    // tilt 는 solo 에선 정확히 안 알려줌 (학습용으로 'balanced' 표시)
    next.scaleTilt = 'balanced';
    this.state = next;
    this.refreshFromState();
  }

  private confirmSubmit(color: CoreColor) {
    if (useDialogueStore.getState().open) return;
    useDialogueStore.getState().show(
      [
        {
          speaker: '확인',
          text: `${CORE_COLOR_LABELS[color]} 코어를 투입구에 넣을까요? 오답이면 비상 차단됩니다.`,
          choices: [
            { label: '네, 넣겠습니다', value: 'yes' },
            { label: '취소', value: 'no' },
          ],
        },
      ],
      (v) => {
        if (v !== 'yes') return;
        this.sendAction({ act: 2, type: 'submit', color });
      }
    );
  }

  // ── 서버 상태 → 로컬 렌더 동기화 ──
  private applyServerState(ts: TeamState) {
    if (ts.currentAct !== 2 && ts.completedActs.includes(2)) return;
    this.state = { ...ts.act2 };
    this.refreshFromState();
  }

  private refreshFromState() {
    // 모든 코어를 일단 "홈" 으로 이동 (드래깅 중인 건 제외)
    for (const sprite of this.cores.values()) {
      if (sprite.dragging) continue;
      let targetX = sprite.homeX;
      let targetY = sprite.homeY;
      if (this.state.scaleLeft === sprite.color) {
        targetX = this.leftPanX;
        targetY = this.leftPanY - CORE_SIZE / 2 - 12;
      } else if (this.state.scaleRight === sprite.color) {
        targetX = this.rightPanX;
        targetY = this.rightPanY - CORE_SIZE / 2 - 12;
      }
      if (sprite.container.x !== targetX || sprite.container.y !== targetY) {
        this.tweens.add({
          targets: sprite.container,
          x: targetX,
          y: targetY,
          duration: 220,
          ease: 'Cubic.easeOut',
        });
      }
    }

    // 저울 빔 회전 (왼쪽 무거우면 왼쪽 내려감 = 양수 회전)
    let targetTilt = 0;
    if (this.state.scaleTilt === 'left') targetTilt = 0.18;
    else if (this.state.scaleTilt === 'right') targetTilt = -0.18;
    this.tweens.add({
      targets: this.scaleBeam,
      rotation: targetTilt,
      duration: 350,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        this.recomputePanPositions(this.scaleBeam.rotation);
      },
    });
  }

  private handleVictory() {
    this.showDialogue('victory');
    this.showToast('✓ 코어 식별 성공!', 2000);
    // TODO: 격벽 해제 / Act3 전환 (Act3 미구현)
  }

  private handleFailure() {
    this.showDialogue('fail_wrong');
    this.showToast('✗ 코어 무게 불일치', 1800);
  }

  // ── NPC 상호작용 ──
  private updateResearcherProximity() {
    const d = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, RESEARCHER_X, RESEARCHER_Y
    );
    const wasNear = this.nearbyResearcher;
    this.nearbyResearcher = d < NPC_PROXIMITY;
    if (this.nearbyResearcher && !wasNear) {
      gameEventBus.emit('npc:proximityEnter', {
        npcKey: 'researcher',
        label: '연구원 (홀로그램) 에게 다가감 — Space 또는 탭',
      });
    } else if (!this.nearbyResearcher && wasNear) {
      gameEventBus.emit('npc:proximityLeave', {});
    }
  }

  private showDialogue(key: string) {
    const script = this.cache.json.get('dialogue_act2') as DialogueScript | undefined;
    const lines = script?.[key];
    if (!lines?.length) return;
    useDialogueStore.getState().show(lines);
  }

  update() {
    if (!this.player || !this.cursors) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    if (useDialogueStore.getState().open) {
      body.setVelocity(0, 0);
      this.player.anims.stop();
      this.player.setFrame(0);
      this.selfLabel.x = this.player.x;
      this.selfLabel.y = this.player.y - 36;
      return;
    }

    const { vx, vy, dir } = readMovementInput(this.cursors, PLAYER_SPEED);
    body.setVelocity(vx, vy);
    if (dir) this.player.anims.play(animKey(this.myCharacter, dir), true);
    else { this.player.anims.stop(); this.player.setFrame(0); }

    this.selfLabel.x = this.player.x;
    this.selfLabel.y = this.player.y - 36;

    this.updateResearcherProximity();
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      if (this.nearbyResearcher) this.showDialogue('researcher');
    }
  }
}
