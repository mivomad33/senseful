// 이번 학습의 판정 결과 목록(화면 상태에만 둔다). 학습 화면이 앞뒤로 넘겨 다시 본다.
import type { Graded, StudyView } from "./actions";

/** 결과 하나. 오류 신고 표시는 결과마다 따로다. */
export interface Entry {
  graded: Graded;
  reported: boolean;
}

/** 같은 카드를 뒤에 다시 판정받았는지. 서버는 그 카드의 마지막 기록만 정정하므로, 그렇다면 정정할 수 없다. */
export function isSuperseded(list: readonly Entry[], i: number): boolean {
  const cardId = list[i].graded.cardId;
  return list.slice(i + 1).some((e) => e.graded.cardId === cardId);
}

/** i번째 결과의 판정 값을 바꾼다(정정). */
export function patchAt(list: readonly Entry[], i: number, patch: Partial<Graded>): Entry[] {
  return list.map((e, j) => (j === i ? { ...e, graded: { ...e.graded, ...patch } } : e));
}

/** i번째 결과에 오류 신고 표시를 단다. */
export function markReported(list: readonly Entry[], i: number): Entry[] {
  return list.map((e, j) => (j === i ? { ...e, reported: true } : e));
}

/** 카드 수정 내용을 그 카드의 모든 결과에 옮긴다. 카드 내용은 서버에서 카드 단위라서다. */
export function applyCardEdit(list: readonly Entry[], edited: Pick<Graded, "cardId" | "senseKo" | "exampleEn" | "exampleKo">): Entry[] {
  const { cardId, senseKo, exampleEn, exampleKo } = edited;
  return list.map((e) => (e.graded.cardId === cardId ? { ...e, graded: { ...e.graded, senseKo, exampleEn, exampleKo } } : e));
}

/**
 * 지난 결과에서 맨 앞으로 돌아갈 때 다음 카드를 다시 불러와야 하는지.
 * answered: 맨 앞 카드에 이미 답했다(최근 결과를 아직 넘기지 않았다).
 * changed: 맨 앞을 불러온 뒤 지난 결과에서 정정하거나 빼서 서버의 대기열이 바뀐 카드.
 * 맨 앞이 완료·대기 화면이거나 바로 그 카드의 문제면 다시 불러온다. 다른 카드를 풀던 중이면 쓰던 답안과 함께 그대로 둔다.
 */
export function needsReload(front: StudyView, answered: boolean, changed: ReadonlySet<number>): boolean {
  if (answered) return true;
  if (changed.size === 0) return false;
  return front.status !== "card" || changed.has(front.cardId);
}
