// 학습 기록 초기화 테스트. 복습 기록이 지워지고 카드가 새 카드로 돌아가며, 카드 내용과 빼기 표시는 그대로인지 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createEmptyCard, State } from "ts-fsrs";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { cards, items, reviewLogs, studyDays } from "@/db/schema";
import { excludeCard, updateCard } from "@/lib/cards/edit";
import { resetProgress } from "./reset";
import { nextCard, recordReview, todayCounts, type StudyLimits } from "./schedule";

const limits: StudyLimits = { newPerDay: 20, reviewsPerDay: 200, dayStartHour: 4 };
const T0 = new Date(2026, 9, 17, 10, 0);
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

function setup(n: number): { db: Db; cardIds: number[] } {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const e = createEmptyCard(new Date(2026, 9, 1));
  const cardIds = Array.from({ length: n }, (_, i) => {
    const it = db
      .insert(items)
      .values({ key: `word:${i}`, kind: "word", headword: `w${i}`, dictSenseId: `s${i}`, cefr: "a1", definition: `def ${i}`, sourceSlug: `w${i}`, collectedAt: new Date(0) })
      .returning()
      .get();
    return db
      .insert(cards)
      .values({
        itemId: it.id,
        senseKo: "뜻",
        exampleEn: "Example.",
        exampleKo: "예문.",
        due: e.due,
        stability: e.stability,
        difficulty: e.difficulty,
        elapsedDays: e.elapsed_days,
        scheduledDays: e.scheduled_days,
        learningSteps: e.learning_steps,
        reps: e.reps,
        lapses: e.lapses,
        state: e.state,
      })
      .returning()
      .get().id;
  });
  return { db, cardIds };
}

test("복습 기록을 지우고 카드를 새 카드로 되돌리며, 카드 내용과 빼기 표시는 그대로 둔다", () => {
  const { db, cardIds } = setup(3);
  const [a, b, c] = cardIds;
  recordReview(db, { cardId: a, userAnswer: "답", graderIsCorrect: true }, T0);
  recordReview(db, { cardId: b, userAnswer: "답", graderIsCorrect: false }, T0);
  recordReview(db, { cardId: b, userAnswer: "답", graderIsCorrect: true }, min(2));
  updateCard(db, a, { senseKo: "고친 뜻", exampleEn: "Fixed.", exampleKo: "고친 예문." }, min(3));
  excludeCard(db, c, min(4));
  const before = db.select().from(cards).orderBy(asc(cards.id)).all();

  const r = resetProgress(db, min(5));
  assert.deepEqual(r, { deletedLogs: 3, resetCards: 3 });
  assert.equal(db.select().from(reviewLogs).all().length, 0);

  const after = db.select().from(cards).orderBy(asc(cards.id)).all();
  for (const [i, row] of after.entries()) {
    assert.equal(row.state, State.New);
    assert.equal(row.reps, 0);
    assert.equal(row.lapses, 0);
    assert.equal(row.lastReview, null);
    assert.deepEqual(row.due, min(5));
    // 카드 내용, 수정 시각, 빼기 표시는 그대로다.
    const { senseKo, exampleEn, exampleKo, updatedAt, excludedAt } = before[i];
    assert.deepEqual({ senseKo: row.senseKo, exampleEn: row.exampleEn, exampleKo: row.exampleKo, updatedAt: row.updatedAt, excludedAt: row.excludedAt }, { senseKo, exampleEn, exampleKo, updatedAt, excludedAt });
  }
  assert.equal(after[0].senseKo, "고친 뜻");
  assert.notEqual(after[2].excludedAt, null);
});

test("초기화한 날에는 뺀 카드를 뺀 새 카드가 다시 상한 안에서 나온다", () => {
  const { db, cardIds } = setup(3);
  recordReview(db, { cardId: cardIds[0], userAnswer: "답", graderIsCorrect: true }, T0);
  excludeCard(db, cardIds[2], T0);
  db.insert(studyDays).values({ day: "2026-10-17", extraNew: 10 }).run();
  resetProgress(db, min(1));
  assert.equal(db.select().from(studyDays).all().length, 0);
  // 오늘 기록이 지워졌으므로 새 카드 상한을 다시 쓸 수 있고, 뺀 카드는 나오지 않는다.
  const c = todayCounts(db, min(1), limits);
  assert.deepEqual({ review: c.review, new: c.new, learning: c.learning }, { review: 0, new: 2, learning: 0 });
  const next = nextCard(db, min(1), limits, () => 0);
  assert.ok(next.status === "card" && next.next.card.id !== cardIds[2]);
});
