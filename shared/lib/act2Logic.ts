// 2막 "냉각수 코어 식별" 권위 있는 정답 판정
// 시나리오 명세: docs/mesa-scenario.md 의 2막 정답 — 파랑 코어 (= 7/4)
//
// 6개 코어가 있고 색은 빨강/파랑/초록/노랑/보라/주황.
// 무게 후보 집합은 {5/4, 6/4, 7/4, 8/4, 9/4, 10/4}, 중복 없음.
// 4명이 단서 1장씩을 가지고 추론해 색-무게 매핑을 풀면 정답 색이 나옴.
// 분모는 전 구간 4 고정.

import type { CoreColor, Fraction, StudentSlot } from '../types/game';
import { f } from './fraction';

export type { CoreColor };

// ── 무게 후보 집합 (UI 에서 항상 표시) ──────────────────────
export const ACT2_CANDIDATE_WEIGHTS: readonly Fraction[] = [
  f(5, 4),
  f(6, 4),
  f(7, 4),
  f(8, 4),
  f(9, 4),
  f(10, 4),
] as const;

// ── 코어 색 ↔ 실제 무게 (서버만 알아야 하는 정답 — 클라엔 안 보냄) ──
// 풀이 도출: B(2×초록=노랑) → 초록=5/4, 노랑=10/4
//          → C(보라=초록+3/4) → 보라=8/4
//          → A(빨강=파랑+2/4) → 남은 {6/4,7/4,9/4} 에서 차이 2/4 = (7,9)
//          → 파랑=7/4, 빨강=9/4 → 주황=6/4
export const ACT2_CORE_WEIGHTS: Record<CoreColor, Fraction> = {
  green: f(5, 4),
  orange: f(6, 4),
  blue: f(7, 4),
  purple: f(8, 4),
  red: f(9, 4),
  yellow: f(10, 4),
};

// ── 목표: 1과 3/4 (= 7/4) → 파랑 ────────────────────────
export const ACT2_TARGET_WEIGHT: Fraction = f(7, 4);
export const ACT2_TARGET_COLOR: CoreColor = 'blue';

// ── 단서 (4명에게 1장씩 분배) ────────────────────────
// text: 학생에게 보여줄 한글 문장
// 단서 자체는 색 이름과 분수만 노출, 정답 매핑은 절대 노출 안 함.
export type Act2Clue = {
  slot: StudentSlot;
  text: string;
};

export const ACT2_CLUES: Record<StudentSlot, Act2Clue> = {
  A: {
    slot: 'A',
    text: '빨강 코어는 파랑 코어보다 2/4 만큼 더 무겁다.',
  },
  B: {
    slot: 'B',
    text: '초록 코어 2개를 합치면 노랑 코어 1개와 무게가 같다.',
  },
  C: {
    slot: 'C',
    text: '보라 코어는 초록 코어보다 3/4 만큼 더 무겁다.',
  },
  D: {
    slot: 'D',
    text: '찾아야 할 코어는 1과 3/4 (= 7/4) 무게의 코어다.',
  },
};

// 6개 코어 색 (UI 렌더 순서)
export const ACT2_CORE_COLORS: readonly CoreColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
] as const;

// 색 → 한글 표시명 (UI/대사용)
export const CORE_COLOR_LABELS: Record<CoreColor, string> = {
  red: '빨강',
  blue: '파랑',
  green: '초록',
  yellow: '노랑',
  purple: '보라',
  orange: '주황',
};

// 색 → 디스플레이 컬러 (Phaser 0xRRGGBB)
export const CORE_COLOR_HEX: Record<CoreColor, number> = {
  red: 0xef4444,
  blue: 0x3b82f6,
  green: 0x22c55e,
  yellow: 0xfacc15,
  purple: 0xa855f7,
  orange: 0xf97316,
};

// ── 정답 검증 ─────────────────────────────────────────
export type Act2Evaluation = {
  status: 'solved' | 'wrong';
  submitted: CoreColor;
  correct: CoreColor;
};

export const evaluateAct2 = (submitted: CoreColor): Act2Evaluation => ({
  status: submitted === ACT2_TARGET_COLOR ? 'solved' : 'wrong',
  submitted,
  correct: ACT2_TARGET_COLOR,
});
