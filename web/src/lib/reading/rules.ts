// 읽기 글 기준(docs/specs/2026-10-reading-gen 4.1-3). 비율 한도와 길이는 여기서만 바꾼다.

export const READING_LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

/** 넘는 단어 종류 비율 한도. 이 값 이하면 통과 */
export const MAX_ABOVE_RATIO = 0.05;

/** 레벨별 목표 전체 단어 수 */
export const TARGET_WORDS: Record<ReadingLevel, number> = { a1: 150, a2: 250, b1: 350, b2: 500, c1: 650 };

/** 목표 길이에서 허용하는 폭(±) */
export const LENGTH_TOLERANCE = 0.2;

export function isLevel(s: string | undefined): s is ReadingLevel {
  return READING_LEVELS.includes(s as ReadingLevel);
}

export const levelRank = (l: ReadingLevel) => READING_LEVELS.indexOf(l);

/** 목표 레벨의 전체 단어 수 허용 범위 [최소, 최대] */
export function lengthRange(level: ReadingLevel): [number, number] {
  const n = TARGET_WORDS[level];
  return [Math.round(n * (1 - LENGTH_TOLERANCE)), Math.round(n * (1 + LENGTH_TOLERANCE))];
}

/** 넘는 종류 수가 한도 안인지. 부동소수 오차 없이 정확히 5%를 통과로 본다 */
export function withinRatio(above: number, counted: number): boolean {
  return above * Math.round(1 / MAX_ABOVE_RATIO) <= counted;
}

/** 입력 오류(종료 코드 2) */
export class InputError extends Error {}

// 이야기와 덮기(docs/specs/2026-10-reading-stories). 장 수와 넘기는 단어 수는 여기서만 바꾼다.

/** 이야기 한 권의 장 수 [최소, 최대]. 장마다 위 비율 한도와 길이(TARGET_WORDS)를 지킨다 */
export const STORY_CHAPTERS: [number, number] = [6, 8];

/** 이야기 한 권을 위해 덮이지 않은 단어 중 뽑아 넘기는 수 */
export const PICK_COUNT: Record<ReadingLevel, number> = { a1: 80, a2: 80, b1: 100, b2: 120, c1: 120 };
