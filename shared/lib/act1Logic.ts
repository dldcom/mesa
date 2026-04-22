// 1막 "전력망 동기화" 권위 있는 정답 판정
// 시나리오 명세: docs/mesa-scenario.md 의 1막 정답 ② — ① — ② — ①
//
// 4명의 학생(A/B/C/D)은 각자 시작값과 2개 경로를 가진다.
// 각 경로는 연산(+/−)과 피연산자를 적용해 도착값을 낸다.
// 4명의 도착값 합 = 8/8(= 1) 이어야 해결.
// 분모는 전 구간 8 고정.

import type { Fraction } from '../types/game';
import { add, equals, f } from './fraction';

export type StudentSlot = 'A' | 'B' | 'C' | 'D';
export type PathChoice = 1 | 2;

type PathDef = {
  op: '+' | '-';
  operand: Fraction; // 분모 8
  arrival: Fraction; // 계산 편의용 (start op operand 결과)
};

type StudentPuzzle = {
  slot: StudentSlot;
  start: Fraction;
  paths: { [K in PathChoice]: PathDef };
};

// ── 퍼즐 정의 ──────────────────────────────────────────────
// docs/mesa-scenario.md 표와 동일. 도착값은 문서 기준으로 박아둠.
export const ACT1_PUZZLE: Record<StudentSlot, StudentPuzzle> = {
  A: {
    slot: 'A',
    start: f(1, 8),
    paths: {
      1: { op: '+', operand: f(5, 8), arrival: f(6, 8) },
      2: { op: '+', operand: f(2, 8), arrival: f(3, 8) },
    },
  },
  B: {
    slot: 'B',
    start: f(3, 8),
    paths: {
      1: { op: '-', operand: f(1, 8), arrival: f(2, 8) },
      2: { op: '+', operand: f(1, 8), arrival: f(4, 8) },
    },
  },
  C: {
    slot: 'C',
    start: f(5, 8),
    paths: {
      1: { op: '-', operand: f(1, 8), arrival: f(4, 8) },
      2: { op: '-', operand: f(3, 8), arrival: f(2, 8) },
    },
  },
  D: {
    slot: 'D',
    start: f(7, 8),
    paths: {
      1: { op: '-', operand: f(6, 8), arrival: f(1, 8) },
      2: { op: '-', operand: f(3, 8), arrival: f(4, 8) },
    },
  },
};

// 목표: 합이 정확히 1 (= 8/8)
export const ACT1_TARGET: Fraction = f(8, 8);

export const getArrival = (slot: StudentSlot, choice: PathChoice): Fraction =>
  ACT1_PUZZLE[slot].paths[choice].arrival;

export type Act1Evaluation = {
  sum: Fraction;
  target: Fraction;
  status: 'solved' | 'overload' | 'shortage';
  diff: Fraction; // sum - target
  arrivals: Record<StudentSlot, Fraction>;
};

// 4명 전원 선택 확정 시 호출. 서버 권위 판정.
export const evaluateAct1 = (
  selections: Record<StudentSlot, PathChoice>
): Act1Evaluation => {
  const arrivals: Record<StudentSlot, Fraction> = {
    A: getArrival('A', selections.A),
    B: getArrival('B', selections.B),
    C: getArrival('C', selections.C),
    D: getArrival('D', selections.D),
  };
  const sum = (['A', 'B', 'C', 'D'] as const).reduce<Fraction>(
    (acc, s) => add(acc, arrivals[s]),
    f(0, 8)
  );
  const diff = f(sum.numerator - ACT1_TARGET.numerator, 8);
  let status: Act1Evaluation['status'];
  if (equals(sum, ACT1_TARGET)) status = 'solved';
  else if (sum.numerator > ACT1_TARGET.numerator) status = 'overload';
  else status = 'shortage';
  return { sum, target: ACT1_TARGET, status, diff, arrivals };
};
