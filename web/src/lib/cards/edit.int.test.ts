// 공용 카드 수정·빼기(관리자)와 신고·나만 빼기(사용자) 통합 테스트.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { reports, userCards } from "@/db/schema";
import { pickItems } from "@/lib/card-gen/create";
import { recordReview, todayQueue, type StudyLimits } from "@/lib/study/schedule";
import { addCard, addUser, at, day, db, ids, reset, T0 } from "../../../test/helpers";
import { excludeCard, excludeForUser, reportCard, restoreCard, restoreForUser, updateCard } from "./edit";

const limits: StudyLimits = { reviewsPerDay: 200, dayStartHour: 4, extraNewStep: 10 };
beforeEach(reset);

test("관리자가 고친 내용은 모든 사용자의 다음 학습에 바로 나오고 학습 상태는 그대로다", async () => {
  const a = await addUser();
  const b = await addUser();
  const id = await addCard("w0", { review: { userId: a.id, due: at(T0, -day(1)) } });
  await updateCard(db, id, { senseKo: " 고친 뜻 ", exampleEn: "Fixed.", exampleKo: "고친 번역." });
  for (const u of [a, b]) {
    const c = (await todayQueue(db, u, T0, limits)).ready.find((x) => x.card.id === id)!;
    assert.deepEqual([c.card.senseKo, c.card.exampleEn, c.card.exampleKo], ["고친 뜻", "Fixed.", "고친 번역."]);
  }
  const [s] = await db.select().from(userCards);
  assert.equal(s.reps, 3);
});

test("빈 칸이 있거나 없는 카드면 고치지 않는다", async () => {
  const id = await addCard("w0");
  await assert.rejects(updateCard(db, id, { senseKo: " ", exampleEn: "x", exampleKo: "y" }), /비울 수 없습니다/);
  await assert.rejects(updateCard(db, 9999, { senseKo: "a", exampleEn: "b", exampleKo: "c" }), /카드가 없습니다/);
});

test("관리자가 뺀 카드는 아무에게도 나오지 않고 그 항목은 생성 후보가 아니며, 취소하면 다시 나온다", async () => {
  const a = await addUser();
  const b = await addUser();
  const id = await addCard("w0", { review: { userId: a.id, due: at(T0, -day(1)) } });
  await addCard("w1");
  await excludeCard(db, id, T0);
  for (const u of [a, b]) assert.ok(!ids((await todayQueue(db, u, T0, limits)).ready).includes(id));
  assert.equal((await pickItems(db, 10)).length, 0);
  await assert.rejects(recordReview(db, a.id, { cardId: id, userAnswer: "x", graderIsCorrect: true }, T0), /뺀 카드/);
  await restoreCard(db, id, T0);
  assert.ok(ids((await todayQueue(db, a, T0, limits)).ready).includes(id));
});

test("나만 빼기: 사용자 A가 뺀 카드가 B에게는 나오고, 취소하면 A에게 다시 나온다(4.3-4)", async () => {
  const a = await addUser();
  const b = await addUser();
  const fresh = await addCard("fresh");
  const learned = await addCard("learned", { review: { userId: a.id, due: at(T0, -day(1)) } });
  await excludeForUser(db, a.id, fresh);
  await excludeForUser(db, a.id, learned);
  assert.deepEqual(ids((await todayQueue(db, a, T0, limits)).ready), []);
  // B에게는 둘 다 새 카드로 나온다.
  assert.deepEqual(ids((await todayQueue(db, b, T0, limits)).ready), [fresh, learned].sort((x, y) => x - y));
  await restoreForUser(db, a.id, fresh);
  await restoreForUser(db, a.id, learned);
  assert.deepEqual(ids((await todayQueue(db, a, T0, limits)).ready), [fresh, learned].sort((x, y) => x - y));
  // 학습한 적 없는 카드는 상태 행이 사라져 다시 새 카드이고, 학습한 카드는 일정이 그대로다.
  const rows = await db.select().from(userCards);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reps, 3);
});

test("오류 신고는 설명(선택)과 함께 남고, 500자를 넘으면 거부한다(4.8-3)", async () => {
  const u = await addUser();
  const id = await addCard("w0");
  await reportCard(db, u.id, id, "  예문 번역이 어색합니다  ");
  await reportCard(db, u.id, id, "");
  await reportCard(db, u.id, id, "가".repeat(500));
  await assert.rejects(reportCard(db, u.id, id, "가".repeat(501)), /500자/);
  const rows = await db.select().from(reports).orderBy(reports.id);
  assert.deepEqual(
    rows.map((r) => r.note?.length ?? null),
    ["예문 번역이 어색합니다".length, null, 500],
  );
});
