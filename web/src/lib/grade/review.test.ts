// 판정·기록 테스트. Claude API 대신 가짜 판정 함수를 넣어 기록과 실패 처리를 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createEmptyCard, State } from "ts-fsrs";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { cards, items, reviewLogs } from "@/db/schema";
import type { Grader } from "./claude";
import type { GradeInput } from "./prompt";
import { gradeAndRecord } from "./review";

const T0 = new Date(2026, 9, 17, 10, 0);

function setup(): { db: Db; cardId: number } {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const item = db
    .insert(items)
    .values({ key: "word:x", kind: "word", headword: "run", dictSenseId: "s", cefr: "a1", definition: "def", sourceSlug: "run", collectedAt: new Date(0) })
    .returning()
    .get();
  const e = createEmptyCard(T0);
  const card = db
    .insert(cards)
    .values({
      itemId: item.id,
      senseKo: "달리다",
      exampleEn: "I run every morning.",
      exampleKo: "나는 매일 아침 달린다.",
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
    .get();
  return { db, cardId: card.id };
}

test("판정 결과를 원래 판정·최종 판정으로 기록하고 판정 입력에 카드 내용을 넣는다", async () => {
  const { db, cardId } = setup();
  let got: GradeInput | undefined;
  const grade: Grader = async (input) => ((got = input), { is_correct: true, reason: "모두 예" });
  const r = await gradeAndRecord(db, grade, cardId, "  나는 아침마다 달린다.  ", T0);
  assert.deepEqual(got, { headword: "run", senseKo: "달리다", exampleEn: "I run every morning.", exampleKo: "나는 매일 아침 달린다.", answer: "나는 아침마다 달린다." });
  assert.equal(r.isCorrect, true);
  assert.equal(r.senseKo, "달리다");
  const [log] = db.select().from(reviewLogs).all();
  assert.equal(log.userAnswer, "나는 아침마다 달린다.");
  assert.equal(log.isCorrect, true);
  assert.equal(log.graderIsCorrect, true);
  assert.equal(log.graderReason, "모두 예");
  assert.equal(db.select().from(cards).get()!.state, State.Learning);
});

test("판정 호출이 실패하면 기록하지 않고 카드 상태도 그대로 둔다", async () => {
  const { db, cardId } = setup();
  const fail: Grader = async () => {
    throw new Error("overloaded");
  };
  await assert.rejects(gradeAndRecord(db, fail, cardId, "답", T0), /overloaded/);
  assert.equal(db.select().from(reviewLogs).all().length, 0);
  const c = db.select().from(cards).get()!;
  assert.equal(c.state, State.New);
  assert.equal(c.reps, 0);
});

test("빈 답안은 판정을 부르지 않고 틀림으로 기록한다", async () => {
  const { db, cardId } = setup();
  let called = false;
  const grade: Grader = async () => ((called = true), { is_correct: true, reason: "" });
  const r = await gradeAndRecord(db, grade, cardId, "   ", T0);
  assert.equal(called, false);
  assert.equal(r.isCorrect, false);
  const [log] = db.select().from(reviewLogs).all();
  assert.equal(log.isCorrect, false);
  assert.equal(log.graderIsCorrect, false);
  assert.equal(log.rating, 1); // Again
});
