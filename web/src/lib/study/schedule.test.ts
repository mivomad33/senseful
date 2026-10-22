// 학습 일정 테스트. 메모리 DB에 카드를 직접 넣어 오늘의 학습 구성과 FSRS 적용·정정을 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createEmptyCard, State } from "ts-fsrs";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { cards, items, reviewLogs } from "@/db/schema";
import { addExtraNew, correctReview, dayRange, extraNewToday, nextCard, recordReview, todayCounts, todayQueue, type StudyLimits } from "./schedule";

const limits: StudyLimits = { newPerDay: 3, reviewsPerDay: 2, dayStartHour: 4 };
// 로컬 시간 2026-10-17 10:00
const T0 = new Date(2026, 9, 17, 10, 0);
const min = (n: number) => n * 60_000;
const day = (n: number) => n * 86_400_000;
const at = (base: Date, ms: number) => new Date(base.getTime() + ms);

function setup(): Db {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

let seq = 0;
/** 표제어 headword의 새 카드를 만든다. review를 주면 그 예정일의 복습 카드로 만든다. */
function addCard(db: Db, headword: string, review?: { due: Date }): number {
  const n = seq++;
  const item = db
    .insert(items)
    .values({ key: `word:${n}`, kind: "word", headword, dictSenseId: `s${n}`, cefr: "a1", definition: `def ${n}`, sourceSlug: headword, collectedAt: new Date(0) })
    .returning()
    .get();
  const e = createEmptyCard(at(T0, -day(30)));
  const card = db
    .insert(cards)
    .values({
      itemId: item.id,
      senseKo: "뜻",
      exampleEn: "Example.",
      exampleKo: "예문.",
      due: review ? review.due : e.due,
      stability: review ? 10 : e.stability,
      difficulty: review ? 5 : e.difficulty,
      elapsedDays: 0,
      scheduledDays: review ? 10 : 0,
      learningSteps: 0,
      reps: review ? 3 : 0,
      lapses: 0,
      state: review ? State.Review : State.New,
      lastReview: review ? at(review.due, -day(10)) : null,
    })
    .returning()
    .get();
  return card.id;
}

const ids = (q: { card: { id: number } }[]) => q.map((c) => c.card.id).sort((a, b) => a - b);
const answer = (db: Db, cardId: number, isCorrect: boolean, now: Date) =>
  recordReview(db, { cardId, userAnswer: "답", graderIsCorrect: isCorrect }, now);

test("학습일은 새벽 4시에 바뀐다", () => {
  const { start, end } = dayRange(new Date(2026, 9, 18, 2, 0), 4);
  assert.deepEqual(start, new Date(2026, 9, 17, 4, 0));
  assert.deepEqual(end, new Date(2026, 9, 18, 4, 0));
  assert.deepEqual(dayRange(new Date(2026, 9, 18, 4, 0), 4).start, new Date(2026, 9, 18, 4, 0));
});

test("복습은 오늘 끝까지 예정된 카드를 예정일 순으로 상한까지, 새 카드는 만든 순서로 상한까지 넣는다", () => {
  const db = setup();
  const r1 = addCard(db, "r1", { due: at(T0, -day(2)) });
  const r2 = addCard(db, "r2", { due: at(T0, -day(1)) });
  addCard(db, "r3", { due: at(T0, min(60)) }); // 오늘 안이지만 상한(2)을 넘는다
  addCard(db, "r4", { due: at(T0, day(1)) }); // 내일 예정
  const n = [addCard(db, "n1"), addCard(db, "n2"), addCard(db, "n3"), addCard(db, "n4")];
  db.update(cards).set({ excludedAt: T0 }).where(eq(cards.id, n[0])).run(); // 뺀 카드

  const q = todayQueue(db, T0, limits);
  assert.deepEqual(ids(q.ready), [r1, r2, n[1], n[2], n[3]]);
  const c = todayCounts(db, T0, limits);
  assert.deepEqual({ learning: c.learning, review: c.review, new: c.new, ready: c.ready }, { learning: 0, review: 2, new: 3, ready: 5 });
});

test("상한은 오늘 이미 한 학습 수만큼 줄어든다", () => {
  const db = setup();
  const r = [0, 1, 2].map((i) => addCard(db, `r${i}`, { due: at(T0, -day(i + 1)) }));
  const n = [0, 1, 2, 3].map((i) => addCard(db, `n${i}`));
  answer(db, r[2], true, T0);
  answer(db, n[0], true, T0);
  answer(db, n[1], true, at(T0, min(1)));

  const later = at(T0, min(2));
  const q = todayQueue(db, later, limits);
  // 복습 1개 남음(r[1]이 더 오래됨), 새 카드 1개 남음. 학습 중인 새 카드 n0·n1은 아직 시각이 안 됐다.
  assert.deepEqual(ids(q.ready), [r[1], n[2]]);
  assert.deepEqual(ids(q.waiting), [n[0], n[1]]);
  // 다음 날에는 상한이 다시 찬다.
  assert.equal(todayCounts(db, at(T0, day(1)), limits).new, 2);
});

test("같은 표제어의 형제 카드는 하루에 하나만 내고 나머지는 다음 날로 미룬다", () => {
  const db = setup();
  const rv = addCard(db, "run", { due: at(T0, -day(1)) });
  const n1 = addCard(db, "run");
  addCard(db, "run");
  const other = addCard(db, "walk");
  const n3 = addCard(db, "jump");
  const n4 = addCard(db, "swim");

  // 복습 카드가 먼저 자리를 잡아 run의 새 카드는 미뤄지고, 상한 3은 다른 표제어로 채워진다.
  assert.deepEqual(ids(todayQueue(db, T0, limits).ready), [rv, other, n3, n4]);

  // run 복습을 마치면 오늘은 run 카드가 더 나오지 않는다.
  answer(db, rv, true, T0);
  assert.deepEqual(ids(todayQueue(db, T0, limits).ready), [other, n3, n4]);

  // 다음 날에는 미룬 run 새 카드 중 하나만 나온다.
  const next = todayQueue(db, at(T0, day(1)), limits).ready.filter((c) => c.item.headword === "run");
  assert.deepEqual(ids(next), [n1]);
});

test("틀린 카드는 몇 분 뒤 같은 날 다시 나온다", () => {
  const db = setup();
  const rv = addCard(db, "r", { due: at(T0, -day(1)) });
  const res = answer(db, rv, false, T0);
  assert.equal(res.state, State.Relearning);
  assert.ok(res.due.getTime() - T0.getTime() <= min(10));

  assert.deepEqual(nextCard(db, at(T0, min(1)), limits), { status: "waiting", until: res.due });
  const back = nextCard(db, res.due, limits);
  assert.equal(back.status, "card");
  assert.equal(back.status === "card" && back.next.card.id, rv);
  assert.equal(back.status === "card" && back.next.kind, "learning");

  // 다시 맞히면 다음 날 이후로 넘어가 오늘 학습이 끝난다.
  answer(db, rv, true, res.due);
  assert.deepEqual(nextCard(db, at(res.due, min(1)), limits), { status: "done" });
});

test("틀린 카드는 복습 상한과 상관없이 다시 나온다", () => {
  const db = setup();
  const r = [0, 1].map((i) => addCard(db, `r${i}`, { due: at(T0, -day(1)) }));
  answer(db, r[0], false, T0);
  answer(db, r[1], false, T0);
  assert.equal(todayQueue(db, at(T0, min(30)), limits).ready.length, 2);
});

test("다음 카드는 학습 카드·복습·새 카드를 구분하지 않고 랜덤으로 고른다", () => {
  const db = setup();
  addCard(db, "r", { due: at(T0, -day(1)) });
  addCard(db, "n");
  const seen = new Set([0, 0.99].map((x) => {
    const c = nextCard(db, T0, limits, () => x);
    return c.status === "card" ? c.next.kind : c.status;
  }));
  assert.deepEqual(seen, new Set(["review", "new"]));
});

test("판정 결과가 카드 상태와 복습 기록(원래 판정·최종 판정)으로 남는다", () => {
  const db = setup();
  const id = addCard(db, "a");
  const res = recordReview(db, { cardId: id, userAnswer: "내 번역", graderIsCorrect: false, graderReason: "시제 틀림", isCorrect: true }, T0);
  const log = db.select().from(reviewLogs).where(eq(reviewLogs.id, res.logId)).get()!;
  assert.equal(log.userAnswer, "내 번역");
  assert.equal(log.graderIsCorrect, false);
  assert.equal(log.graderReason, "시제 틀림");
  assert.equal(log.isCorrect, true);
  assert.equal(log.rating, 3); // Good
  assert.equal(log.state, State.New);
  assert.deepEqual(log.reviewedAt, T0);
  const card = db.select().from(cards).where(eq(cards.id, id)).get()!;
  assert.equal(card.reps, 1);
  assert.deepEqual(card.due, res.due);
  assert.deepEqual(card.lastReview, T0);
});

const FSRS_KEYS = ["due", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "reps", "lapses", "state", "lastReview", "rating", "lastElapsedDays", "reviewedAt"];
const fsrsFields = (row: object) => Object.fromEntries(Object.entries(row).filter(([k]) => FSRS_KEYS.includes(k)));

test("정정하면 최종 판정으로 다시 계산한 일정이 된다", () => {
  for (const review of [undefined, { due: at(T0, -day(1)) }]) {
    for (const [graded, final] of [[false, true], [true, false]]) {
      const db = setup();
      const a = addCard(db, "a", review);
      const b = addCard(db, "b", review);
      // a는 판정 후 정정하고, b는 처음부터 최종 판정으로 기록한다.
      const first = answer(db, a, graded, T0);
      const fixed = correctReview(db, first.logId, final);
      const direct = answer(db, b, final, T0);
      assert.deepEqual(fixed.due, direct.due);
      assert.equal(fixed.state, direct.state);

      const [ca, cb] = [a, b].map((id) => fsrsFields(db.select().from(cards).where(eq(cards.id, id)).get()!));
      assert.deepEqual(ca, cb);

      const la = db.select().from(reviewLogs).where(eq(reviewLogs.id, first.logId)).get()!;
      const lb = db.select().from(reviewLogs).where(eq(reviewLogs.id, direct.logId)).get()!;
      assert.equal(la.isCorrect, final);
      assert.equal(la.graderIsCorrect, graded); // 원래 판정은 그대로 남는다
      assert.deepEqual({ ...fsrsFields(la), isCorrect: la.isCorrect }, { ...fsrsFields(lb), isCorrect: lb.isCorrect });
      assert.equal(db.select().from(reviewLogs).all().length, 2); // 정정은 기록을 늘리지 않는다
    }
  }
});

test("마지막 기록이 아니면 정정할 수 없다", () => {
  const db = setup();
  const id = addCard(db, "a");
  const first = answer(db, id, false, T0);
  answer(db, id, true, at(T0, min(2)));
  assert.throws(() => correctReview(db, first.logId, true), /정정할 수 없다/);
});

test("기다리지 않고 바로 보기면 가장 빨리 돌아올 다시 볼 카드를 바로 낸다", () => {
  const db = setup();
  const a = addCard(db, "a");
  const b = addCard(db, "b");
  const ra = answer(db, a, true, T0); // 맞힘: 10분 뒤
  const rb = answer(db, b, false, T0); // 틀림: 1분 뒤
  assert.ok(rb.due < ra.due);
  const now = at(T0, 30_000); // 둘 다 아직 시각이 안 됐다

  assert.deepEqual(nextCard(db, now, limits), { status: "waiting", until: rb.due });
  const ahead = nextCard(db, now, limits, Math.random, true);
  assert.equal(ahead.status === "card" && ahead.next.card.id, b);
  assert.equal(ahead.status === "card" && ahead.next.kind, "learning");
  // 지금 낼 카드가 있으면 바로 보기여도 그 카드를 먼저 낸다.
  const c = addCard(db, "c");
  const ready = nextCard(db, now, limits, Math.random, true);
  assert.equal(ready.status === "card" && ready.next.card.id, c);
});

test("새 카드 더 학습은 오늘 카드를 다 끝낸 뒤 형제 카드를 뺀 낼 수 있는 수만큼 상한을 늘리고, 다음 날에는 원래 상한으로 돌아간다", () => {
  const db = setup();
  const L: StudyLimits = { ...limits, extraNewStep: 1 };
  const [a, b, c] = ["a", "b", "c"].map((h) => addCard(db, h)); // 상한 3장
  const [d1, d2, , f] = [addCard(db, "d"), addCard(db, "d"), addCard(db, "e"), addCard(db, "a")];
  let t = T0;
  const tick = () => (t = at(t, min(1)));
  /** 낼 카드가 없을 때까지 바로 보기로 모두 맞힌다. */
  const finish = () => {
    for (let n = nextCard(db, tick(), L, () => 0, true); n.status === "card"; n = nextCard(db, tick(), L, () => 0, true)) answer(db, n.next.card.id, true, t);
  };

  // 오늘 카드가 남아 있으면(다시 볼 카드 대기 포함) 늘리지 않는다.
  for (const id of [a, b, c]) answer(db, id, true, tick());
  assert.equal(todayCounts(db, tick(), L).ready, 0);
  assert.notEqual(todayCounts(db, t, L).waitingUntil, null);
  assert.equal(addExtraNew(db, t, L), 0);
  finish();

  // d1·d2는 같은 표제어라 하나로 세고, f는 오늘 학습한 a의 형제라 세지 않는다. 한 번에 extraNewStep(1)장만 더한다.
  let cnt = todayCounts(db, tick(), L);
  assert.deepEqual({ ready: cnt.ready, waitingUntil: cnt.waitingUntil, moreNew: cnt.moreNew, restNew: cnt.restNew }, { ready: 0, waitingUntil: null, moreNew: 1, restNew: 4 });
  assert.equal(addExtraNew(db, t, L), 1);
  assert.equal(extraNewToday(db, t, L.dayStartHour), 1);
  const n = nextCard(db, t, L);
  assert.equal(n.status === "card" && n.next.card.id, d1);
  finish();
  assert.equal(addExtraNew(db, tick(), L), 1);
  assert.equal(todayCounts(db, t, L).new, 1);
  finish();

  // 남은 새 카드(d2, f)는 모두 오늘 학습한 표제어의 형제라 더할 수 없다.
  cnt = todayCounts(db, tick(), L);
  assert.deepEqual({ moreNew: cnt.moreNew, restNew: cnt.restNew }, { moreNew: 0, restNew: 2 });
  assert.equal(addExtraNew(db, t, L), 0);

  // 다음 날에는 더한 장수가 없고 원래 상한으로 남은 카드를 낸다.
  const tomorrow = at(T0, day(1));
  assert.equal(extraNewToday(db, tomorrow, L.dayStartHour), 0);
  assert.deepEqual(ids(todayQueue(db, tomorrow, L).ready.filter((x) => x.kind === "new")), [d2, f]);
});

