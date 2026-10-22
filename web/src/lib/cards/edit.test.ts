// 카드 수정·빼기 테스트. 고친 내용이 다음 학습에 나오는지, 뺀 카드가 학습과 새 카드 후보에서 빠지는지 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createEmptyCard } from "ts-fsrs";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { cards, items } from "@/db/schema";
import { pickItems } from "@/lib/card-gen/create";
import { nextCard, todayQueue, type StudyLimits } from "@/lib/study/schedule";
import { excludeCard, restoreCard, updateCard } from "./edit";

const limits: StudyLimits = { newPerDay: 20, reviewsPerDay: 200, dayStartHour: 4 };
const T0 = new Date(2026, 9, 17, 10, 0);

/** 항목 n개를 넣고 앞의 cardCount개에 새 카드를 만든다. */
function setup(n: number, cardCount: number): { db: Db; cardIds: number[] } {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const its = Array.from({ length: n }, (_, i) =>
    db
      .insert(items)
      .values({ key: `word:${i}`, kind: "word", headword: `w${i}`, dictSenseId: `s${i}`, cefr: "a1", definition: `def ${i}`, sourceSlug: `w${i}`, collectedAt: new Date(0) })
      .returning()
      .get(),
  );
  const e = createEmptyCard(new Date(2026, 9, 1));
  const cardIds = its.slice(0, cardCount).map(
    (it) =>
      db
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
        .get().id,
  );
  return { db, cardIds };
}

test("고친 내용이 다음 학습에 나오고 FSRS 상태는 그대로다", () => {
  const { db, cardIds } = setup(1, 1);
  const before = db.select().from(cards).where(eq(cards.id, cardIds[0])).get()!;
  const r = updateCard(db, cardIds[0], { senseKo: " 고친 뜻 ", exampleEn: "Fixed example.", exampleKo: "고친 예문." }, T0);
  assert.deepEqual(r, { senseKo: "고친 뜻", exampleEn: "Fixed example.", exampleKo: "고친 예문." });

  const n = nextCard(db, T0, limits);
  assert.equal(n.status, "card");
  const c = n.status === "card" ? n.next.card : before;
  assert.deepEqual([c.senseKo, c.exampleEn, c.exampleKo], ["고친 뜻", "Fixed example.", "고친 예문."]);
  assert.deepEqual(c.updatedAt, T0);
  assert.deepEqual([c.due, c.state, c.stability, c.reps], [before.due, before.state, before.stability, before.reps]);
});

test("빈 칸이 있거나 없는 카드면 고치지 않는다", () => {
  const { db, cardIds } = setup(1, 1);
  assert.throws(() => updateCard(db, cardIds[0], { senseKo: "뜻", exampleEn: "  ", exampleKo: "예문." }), /비울 수 없다/);
  assert.equal(db.select().from(cards).get()!.exampleEn, "Example.");
  assert.throws(() => updateCard(db, 999, { senseKo: "뜻", exampleEn: "E.", exampleKo: "예." }), /없다/);
  assert.throws(() => excludeCard(db, 999), /없다/);
  assert.throws(() => restoreCard(db, 999), /없다/);
});

test("뺀 카드는 오늘의 학습에 나오지 않고, 그 항목은 새 카드 후보가 되지 않는다", () => {
  const { db, cardIds } = setup(3, 2);
  excludeCard(db, cardIds[0], T0);

  assert.deepEqual(
    todayQueue(db, T0, limits).ready.map((c) => c.card.id),
    [cardIds[1]],
  );
  assert.deepEqual(db.select().from(cards).where(eq(cards.id, cardIds[0])).get()!.excludedAt, T0);
  // 카드가 없는 항목은 세 번째 하나뿐이다. 뺀 카드의 항목은 후보가 아니다.
  assert.deepEqual(
    pickItems(db, 10).map((it) => it.key),
    ["word:2"],
  );
});

test("빼기를 취소하면 오늘의 학습에 다시 나오고 일정은 그대로다", () => {
  const { db, cardIds } = setup(1, 1);
  const before = db.select().from(cards).get()!;
  excludeCard(db, cardIds[0], T0);
  restoreCard(db, cardIds[0], T0);

  const after = db.select().from(cards).get()!;
  assert.equal(after.excludedAt, null);
  assert.deepEqual([after.due, after.state], [before.due, before.state]);
  assert.deepEqual(
    todayQueue(db, T0, limits).ready.map((c) => c.card.id),
    [cardIds[0]],
  );
});
