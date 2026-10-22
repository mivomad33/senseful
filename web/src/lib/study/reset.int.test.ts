// 학습 기록 초기화 통합 테스트. 지정한 사용자 한 명만 초기화한다(4.6-6).
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { State } from "ts-fsrs";
import { cards, reviewLogs, studyDays, userCards } from "@/db/schema";
import { excludeForUser } from "@/lib/cards/edit";
import { addCard, addUser, db, reset, T0 } from "../../../test/helpers";
import { recordReview, todayCounts } from "./schedule";
import { resetProgress } from "./reset";

beforeEach(reset);

test("지정한 사용자의 복습 기록과 새 카드 더 학습 기록만 지우고 카드를 새 카드로 되돌리며, 빼기 표시와 다른 사용자는 그대로 둔다", async () => {
  const a = await addUser();
  const b = await addUser();
  const [c1, c2, c3] = [await addCard("x"), await addCard("y"), await addCard("z")];
  for (const u of [a, b]) {
    await recordReview(db, u.id, { cardId: c1, userAnswer: "답", graderIsCorrect: true }, T0);
    await recordReview(db, u.id, { cardId: c2, userAnswer: "답", graderIsCorrect: false }, T0);
    await db.insert(studyDays).values({ userId: u.id, day: "2026-10-17", extraNew: 10 });
  }
  await excludeForUser(db, a.id, c2);
  await db.update(cards).set({ senseKo: "고친 뜻" }).where(eq(cards.id, c3));

  const r = await resetProgress(db, a.id, T0);
  assert.deepEqual(r, { deletedLogs: 2, resetCards: 2 });
  const logs = await db.select().from(reviewLogs);
  assert.ok(logs.every((l) => l.userId === b.id));
  assert.equal(logs.length, 2);
  assert.deepEqual((await db.select().from(studyDays)).map((d) => d.userId), [b.id]);
  const rows = await db.select().from(userCards);
  const mine = rows.filter((x) => x.userId === a.id);
  assert.equal(mine.length, 1); // 나만 빼기 표시가 있는 행만 남는다
  assert.equal(mine[0].cardId, c2);
  assert.equal(mine[0].state, State.New);
  assert.ok(mine[0].excludedAt);
  assert.equal(rows.filter((x) => x.userId === b.id).length, 2);
  assert.equal((await db.select().from(cards).where(eq(cards.id, c3)))[0].senseKo, "고친 뜻");
  // 초기화한 사용자에게는 뺀 카드를 뺀 새 카드가 다시 나온다.
  assert.equal((await todayCounts(db, a, T0)).new, 2);
});
