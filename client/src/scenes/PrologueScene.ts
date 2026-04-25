// 프롤로그: 자동 진행 컷씬
// 학교 뒷길을 걷던 4명이 무너진 입구를 발견 → 한 발 들임 → 발밑 무너짐 → Act1 시작
// 플레이어 조작 없음. 캐릭터 이동·대사 모두 자동.

import Phaser from 'phaser';
import { useDialogueStore } from '@/store/useDialogueStore';
import type { StudentSlot } from '@shared/lib/act1Logic';
import type { Character } from '@shared/types/game';
import {
  animKey,
  ensureCharacterAnimations,
  getSlotCharacters,
} from './characterAnims';

const SLOTS: StudentSlot[] = ['A', 'B', 'C', 'D'];

const VIEW_W = 1280;
const VIEW_H = 720;

// 새 prologue.png 기준 좌표 (1280×720 으로 스케일된 시점):
// - 흙길은 화면 세로 약 410 부근 가로 띠
// - 무너진 콘크리트 슬래브 + 구덩이는 오른쪽 약 (x=1010, y=440)
// - 학교는 좌상단을 차지
const PATH_Y = 410;
const ENTRANCE_X = 1010;
const ENTRANCE_Y = 440;

// 캐릭터 시작 위치 (왼쪽 끝, 길 위)
const START_X = 80;

const PROLOGUE_LINES = [
  { speaker: 'A', text: '어… 이런 입구가 있었어?' },
  { speaker: 'B', text: '표지판 글씨가 다 녹슬었어. 진짜 오래됐나봐.' },
  { speaker: 'C', text: '안에서 뭔가 깜빡이는 것 같은데?' },
  { speaker: 'D', text: '한번 들어가 볼래? 살짝만…' },
];

type Actor = {
  slot: StudentSlot;
  character: Character;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
};

export default class PrologueScene extends Phaser.Scene {
  private actors: Actor[] = [];

  constructor() {
    super('PrologueScene');
  }

  create() {
    this.drawBackground();
    this.ensureAnimations();
    this.spawnActors();

    // 카메라: 맵 전체 표시 (zoom=1, 좌표가 viewport 와 1:1)
    this.cameras.main.setBounds(0, 0, VIEW_W, VIEW_H);

    this.events.once('shutdown', () => {
      // 다이얼로그가 열린 채로 씬 전환되면 다음 씬에 잔류하므로 정리
      useDialogueStore.getState().close();
    });

    this.playCutscene();
  }

  update() {
    // 라벨이 캐릭터 머리 위에 따라붙음
    for (const a of this.actors) {
      a.label.x = a.sprite.x;
      a.label.y = a.sprite.y - 38;
    }
  }

  // ── 배경: 한 장짜리 prologue.png 를 뷰포트에 꽉 차게 + 구덩이 위에 깜빡이는 푸른 빛 오버레이 ──
  private drawBackground() {
    const bg = this.add.image(0, 0, 'prologue_bg');
    bg.setOrigin(0, 0);
    bg.setDisplaySize(VIEW_W, VIEW_H);
    bg.setDepth(0);

    // 정적인 푸른 빛 위에 살짝 깜빡이는 추가 광원 (구덩이 위치에)
    const glow = this.add.ellipse(ENTRANCE_X, ENTRANCE_Y, 70, 50, 0x3b82f6, 0.45);
    glow.setDepth(1);
    this.tweens.add({
      targets: glow,
      alpha: 0.1,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 제목 (잠깐 페이드 인/아웃)
    const title = this.add.text(VIEW_W / 2, 40, '프롤로그 — 방과 후', {
      color: '#f3f4f6',
      fontSize: '20px',
      fontFamily: 'Pretendard, sans-serif',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setDepth(50);
    this.tweens.add({
      targets: title,
      alpha: 1,
      duration: 1000,
      hold: 2200,
      yoyo: true,
    });
  }

  private ensureAnimations() {
    ensureCharacterAnimations(this);
  }

  private spawnActors() {
    const slotChars = getSlotCharacters();
    SLOTS.forEach((slot, i) => {
      const character = slotChars[slot];
      // 가로로 살짝씩 어긋나게 + 위/아래 지그재그
      const x = START_X + i * 30;
      const y = PATH_Y + (i % 2 === 0 ? -8 : 12);
      const sprite = this.add.sprite(x, y, character, 12);
      sprite.setDepth(10);
      const label = this.add.text(x, y - 38, slot, {
        color: '#fde68a',
        fontSize: '14px',
        fontFamily: 'Pretendard, sans-serif',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(11);
      this.actors.push({ slot, character, sprite, label });
    });
  }

  // ── 시퀀스: 걷기 → 대사 → 한 발 들어가기 → 흔들림+페이드 → Act1 ──
  private async playCutscene() {
    // 약간의 인트로 정적
    await this.delay(800);

    // 1. 입구 앞까지 걷기 (5초)
    await this.walkActorsTo(ENTRANCE_X - 180, 5000);

    // 2. 잠시 멈춤 → 대사
    await this.delay(400);
    await this.playDialogue();

    // 3. 한 발 들어가기 — 슬래브 위로 올라섬
    await this.walkActorsTo(ENTRANCE_X - 50, 1200);
    await this.delay(300);

    // 4. 발밑 무너짐 — 카메라 흔들림 + 캐릭터들이 구덩이 중심으로 빨려들며 작아짐
    this.cameras.main.shake(1600, 0.02);
    this.actors.forEach((a) => {
      this.tweens.add({
        targets: a.sprite,
        x: ENTRANCE_X,
        y: ENTRANCE_Y,
        scale: 0,
        alpha: 0,
        duration: 1500,
        ease: 'Cubic.easeIn',
      });
      this.tweens.add({
        targets: a.label,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeIn',
      });
    });
    await this.delay(1600);

    // 5. 페이드 아웃 → Act1
    this.cameras.main.fade(800, 0, 0, 0);
    await this.delay(850);
    this.scene.start('Act1Scene');
  }

  private walkActorsTo(targetX: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      let done = 0;
      const total = this.actors.length;
      this.actors.forEach((a, i) => {
        const offset = (total - 1 - i) * 30; // 뒤쪽일수록 더 뒤에 도착
        const goalX = targetX - offset;
        if (a.sprite.x === goalX) {
          done++;
          if (done === total) resolve();
          return;
        }
        a.sprite.play(animKey(a.character, 'right'), true);
        this.tweens.add({
          targets: a.sprite,
          x: goalX,
          duration,
          onComplete: () => {
            a.sprite.anims.stop();
            a.sprite.setFrame(12); // 오른쪽 정지 프레임
            done++;
            if (done === total) resolve();
          },
        });
      });
    });
  }

  // 4줄 대사를 한 번에 띄우고, 3초마다 자동 next(). 사용자가 Space 로 빨리 넘겨도 OK.
  private playDialogue(): Promise<void> {
    return new Promise((resolve) => {
      const store = useDialogueStore.getState();
      let timer: Phaser.Time.TimerEvent | null = null;

      store.show(PROLOGUE_LINES, () => {
        timer?.remove();
        resolve();
      });

      timer = this.time.addEvent({
        delay: 3200,
        loop: true,
        callback: () => {
          const s = useDialogueStore.getState();
          if (!s.open) {
            timer?.remove();
            return;
          }
          s.next();
        },
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }
}
