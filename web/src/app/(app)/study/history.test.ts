import assert from "node:assert/strict";
import { test } from "node:test";
import type { Graded, StudyView } from "./actions";
import { applyCardEdit, isSuperseded, markReported, needsReload, patchAt, type Entry } from "./history";

const graded = (cardId: number, logId: number): Graded => ({
  cardId,
  logId,
  isCorrect: false,
  graderIsCorrect: false,
  reason: "이유",
  answer: "답",
  headword: "word",
  senseKo: `뜻 ${cardId}`,
  exampleEn: `Example ${cardId}.`,
  exampleKo: `예문 ${cardId}.`,
  due: 0,
});
const entry = (cardId: number, logId: number): Entry => ({ graded: graded(cardId, logId), reported: false });
const counts = { done: 0, review: 0, new: 0, learning: 0, newTotal: 1, moreNew: 0, restNew: 0 } as unknown as StudyView["counts"];
const card = (cardId: number): StudyView => ({ status: "card", cardId, exampleEn: "x", kind: "new", level: "a1", counts });

test("같은 카드를 뒤에 다시 판정받은 앞선 결과만 정정할 수 없다", () => {
  const list = [entry(1, 10), entry(2, 11), entry(1, 12)];
  assert.equal(isSuperseded(list, 0), true);
  assert.equal(isSuperseded(list, 1), false);
  assert.equal(isSuperseded(list, 2), false);
});

test("정정과 오류 신고는 그 결과에만 반영된다", () => {
  const list = [entry(1, 10), entry(1, 11)];
  const patched = patchAt(list, 0, { isCorrect: true, due: 5 });
  assert.deepEqual([patched[0].graded.isCorrect, patched[0].graded.due], [true, 5]);
  assert.equal(patched[1].graded.isCorrect, false);
  const reported = markReported(list, 1);
  assert.deepEqual(reported.map((e) => e.reported), [false, true]);
});

test("카드 수정 내용은 그 카드의 모든 결과에 옮겨 간다", () => {
  const list = [entry(1, 10), entry(2, 11), entry(1, 12)];
  const edited = applyCardEdit(list, { cardId: 1, senseKo: "새 뜻", exampleEn: "New.", exampleKo: "새 예문." });
  assert.deepEqual(edited.map((e) => e.graded.senseKo), ["새 뜻", "뜻 2", "새 뜻"]);
  assert.equal(edited[2].graded.answer, "답");
});

test("맨 앞 다시 불러오기: 이미 답했거나, 바뀐 카드가 맨 앞이거나 맨 앞이 완료·대기 화면일 때만", () => {
  const none = new Set<number>();
  assert.equal(needsReload(card(3), true, none), true);
  assert.equal(needsReload(card(3), false, none), false);
  assert.equal(needsReload(card(3), false, new Set([1])), false);
  assert.equal(needsReload(card(3), false, new Set([3])), true);
  assert.equal(needsReload({ status: "done", counts }, false, new Set([1])), true);
  assert.equal(needsReload({ status: "waiting", until: 0, counts }, false, new Set([1])), true);
  assert.equal(needsReload({ status: "done", counts }, false, none), false);
});
