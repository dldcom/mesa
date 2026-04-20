// 분수 유틸 (4학년 과정: 동분모 연산, 가분수↔대분수)

import type { Fraction } from '@shared/types/game';

export const f = (numerator: number, denominator: number): Fraction => ({
  numerator,
  denominator,
});

export const isValid = (x: Fraction): boolean =>
  Number.isInteger(x.numerator) &&
  Number.isInteger(x.denominator) &&
  x.denominator > 0;

// 동분모 전제 덧셈
export const add = (a: Fraction, b: Fraction): Fraction => {
  if (a.denominator !== b.denominator) {
    throw new Error(`동분모 아님: ${a.denominator} vs ${b.denominator}`);
  }
  return f(a.numerator + b.numerator, a.denominator);
};

// 동분모 전제 뺄셈
export const subtract = (a: Fraction, b: Fraction): Fraction => {
  if (a.denominator !== b.denominator) {
    throw new Error(`동분모 아님: ${a.denominator} vs ${b.denominator}`);
  }
  return f(a.numerator - b.numerator, a.denominator);
};

// 교차 곱셈으로 동등성 판단 (약분 여부 무관)
export const equals = (a: Fraction, b: Fraction): boolean =>
  a.numerator * b.denominator === b.numerator * a.denominator;

export const compare = (a: Fraction, b: Fraction): -1 | 0 | 1 => {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const toDecimal = (x: Fraction): number => x.numerator / x.denominator;

// 진분수 여부 (0 < x < 1)
export const isProper = (x: Fraction): boolean =>
  x.numerator > 0 && x.numerator < x.denominator;

// 가분수 → 대분수
export const toMixed = (
  x: Fraction
): { whole: number; remainder: Fraction } => {
  const whole = Math.floor(x.numerator / x.denominator);
  const remainderNumerator = x.numerator - whole * x.denominator;
  return { whole, remainder: f(remainderNumerator, x.denominator) };
};

// 대분수 → 가분수
export const toImproper = (whole: number, frac: Fraction): Fraction =>
  f(whole * frac.denominator + frac.numerator, frac.denominator);

// 표시용
export const format = (x: Fraction): string => `${x.numerator}/${x.denominator}`;

export const formatMixed = (x: Fraction): string => {
  const { whole, remainder } = toMixed(x);
  if (whole === 0) return format(remainder);
  if (remainder.numerator === 0) return `${whole}`;
  return `${whole}과 ${format(remainder)}`;
};
