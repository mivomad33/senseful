// 학습 일정 통합 테스트. 실제 Postgres에 카드를 넣어 사용자별 오늘의 학습 구성과 FSRS 적용·정정을 확인한다.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { State } from "ts-fsrs";
import { cards, reviewLogs, userCards } from "@/db/schema";
import { addCard, addUser, at, day, db, ids, min, reset, T0 } from "../../../test/helpers";
import { addExtraNew, correctReview, extraNewToday, nextCard, recordReview, todayCounts, todayQueue, type StudyLimits, type StudyUser } from "./schedule";

const limits: StudyLimits = { reviewsPerDay: 2, dayStartHour: 4, extraNewStep: 10 };
let u: StudyUser;

beforeEach(async () => {
  await reset();
  u = await addUser({ newPerDay: 3 });
});

const answer = (cardId: number, isCorrect: boolean, now: Date, user = u) => recordReview(db, user.id, { cardId, userAnswer: "답", graderIsCorrect: isCorrect }, now);
const review = (due: Date) => ({ review: { userId: u.id, due } });
const state = async (cardId: number, userId = u.id) =>
  (await db.select().from(userCards).where(and(eq(userCards.userId, userId), eq(userCards.cardId, cardId))))[0];

test("복습은 오늘 끝까지 예정된 카드를 예정일 순으로 상한까지, 새 카드는 상한까지 넣는다", async () => {
  const r1 = await addCard("r1", review(at(T0, -day(2))));
  const r2 = await addCard("r2", review(at(T0, -day(1))));
  await addCard("r3", review(at(T0, min(60)))); // 오늘 안이지만 상한(2)을 넘는다
  await addCard("r4", review(at(T0, day(1)))); // 내일 예정
  const n = [await addCard("n1"), await addCard("n2"), await addCard("n3"), await addCard("n4")];
  await db.update(cards).set({ excludedAt: T0 }).where(eq(cards.id, n[0])); // 관리자가 뺀 카드

  const q = await todayQueue(db, u, T0, limits);
  assert.deepEqual(ids(q.ready), [r1, r2, n[1], n[2], n[3]]);
  const c = await todayCounts(db, u, T0, limits);
  assert.deepEqual({ learning: c.learning, review: c.review, new: c.new, ready: c.ready, newTotal: c.newTotal }, { learning: 0, review: 2, new: 3, ready: 5, newTotal: 3 });
});

test("상한은 오늘 이미 한 학습 수만큼 줄어든다", async () => {
  const r = [];
  for (const i of [0, 1, 2]) r.push(await addCard(`r${i}`, review(at(T0, -day(i + 1)))));
  const n = [];
  for (const i of [0, 1, 2, 3]) n.push(await addCard(`n${i}`));
  await answer(r[2], true, T0);
  await answer(n[0], true, T0);
  await answer(n[1], true, at(T0, min(1)));

  const later = at(T0, min(2));
  const q = await todayQueue(db, u, later, limits);
  // 복습 1개 남음(r[1]이 더 오래됨), 새 카드 1개 남음. 학습 중인 새 카드 n0·n1은 아직 시각이 안 됐다.
  assert.equal(q.ready.length, 2);
  assert.ok(ids(q.ready).includes(r[1]));
  assert.equal(q.ready.filter((c) => c.kind === "new").length, 1);
  assert.deepEqual(ids(q.waiting), [n[0], n[1]]);
  // 다음 날에는 상한이 다시 찬다.
  assert.equal((await todayCounts(db, u, at(T0, day(1)), limits)).new, 2);
});

test("하루 경계는 한국 시간 새벽 4시다", async () => {
  const n = [];
  for (const i of [0, 1, 2, 3]) n.push(await addCard(`n${i}`));
  for (const id of n.slice(0, 3)) await answer(id, true, new Date("2026-10-18T03:00:00+09:00"));
  // 03:59에는 같은 날이라 새 카드 상한(3)을 다 썼고, 04:00에는 새 날이라 남은 새 카드가 나온다.
  assert.equal((await todayCounts(db, u, new Date("2026-10-18T03:59:00+09:00"), limits)).new, 0);
  assert.equal((await todayCounts(db, u, new Date("2026-10-18T04:00:00+09:00"), limits)).new, 1);
});

test("같은 표제어의 형제 카드는 하루에 하나만 내고 나머지는 다음 날로 미룬다", async () => {
  const rv = await addCard("run", review(at(T0, -day(1))));
  const runs = [await addCard("run"), await addCard("run")];
  const other = await addCard("walk");
  const n3 = await addCard("jump");
  const n4 = await addCard("swim");

  // 복습 카드가 먼저 자리를 잡아 run의 새 카드는 미뤄지고, 상한 3은 다른 표제어로 채워진다.
  assert.deepEqual(ids((await todayQueue(db, u, T0, limits)).ready), [rv, other, n3, n4]);

  // run 복습을 마치면 오늘은 run 카드가 더 나오지 않는다.
  await answer(rv, true, T0);
  assert.deepEqual(ids((await todayQueue(db, u, T0, limits)).ready), [other, n3, n4]);

  // 다음 날에는 미룬 run 새 카드 중 하나만 나온다.
  const next = (await todayQueue(db, u, at(T0, day(1)), limits)).ready.filter((c) => c.item.headword === "run");
  assert.equal(next.length, 1);
  assert.ok(runs.includes(next[0].card.id));
});

test("새 카드는 낮은 레벨부터 나오고, 같은 레벨 안의 순서는 사용자마다 다르다", async () => {
  const a2 = await addCard("upper", { level: "a2" });
  const a1 = [];
  for (let i = 0; i < 12; i++) a1.push(await addCard(`w${i}`));
  const big = { ...u, newPerDay: 20 };
  const q = (await todayQueue(db, big, T0, limits)).ready.map((c) => c.card.id);
  assert.equal(q.at(-1), a2); // A1을 다 넣은 뒤에야 A2

  const users = [];
  for (let i = 0; i < 4; i++) users.push(await addUser({ newPerDay: 12 }));
  const orders = [];
  for (const x of users) orders.push(JSON.stringify(await firstNewIds(x)));
  assert.ok(new Set(orders).size > 1, "사용자마다 순서가 달라야 합니다");
  // 같은 사용자는 다시 물어도 순서가 같다(요청마다 바뀌지 않는다).
  assert.equal(JSON.stringify(await firstNewIds(users[0])), orders[0]);
  assert.ok((await todayQueue(db, { ...u, newPerDay: 3 }, T0, limits)).ready.every((c) => c.item.cefr === "a1"));
});

/** 상한 1로 하나씩 넣어 본 순서(같은 레벨 안의 순서를 드러낸다) */
async function firstNewIds(user: StudyUser): Promise<number[]> {
  const out: number[] = [];
  const q = await todayQueue(db, user, T0, { ...limits, extraNewStep: 0 });
  // ready는 레벨·순서대로 쌓인다.
  for (const c of q.ready) out.push(c.card.id);
  return out;
}

test("레벨 제외: 제외한 레벨의 새 카드는 나오지 않고, 이미 학습한 카드의 복습은 나온다", async () => {
  const learned = await addCard("old", { level: "a1", review: { userId: u.id, due: at(T0, -day(1)) } });
  await addCard("fresh-a1", { level: "a1" });
  const b1 = await addCard("fresh-b1", { level: "b1" });
  const x = { ...u, excludedLevels: ["a1" as const] };
  const q = await todayQueue(db, x, T0, limits);
  assert.deepEqual(ids(q.ready), [learned, b1].sort((a, b) => a - b));
  assert.equal(q.newTotal, 1);
  // 모든 새 카드 레벨을 제외하면 남은 새 카드는 0이다.
  const none = await todayQueue(db, { ...u, excludedLevels: ["a1", "b1"] }, T0, limits);
  assert.equal(none.newTotal, 0);
});

test("틀린 카드는 몇 분 뒤 같은 날 다시 나온다", async () => {
  const rv = await addCard("r", review(at(T0, -day(1))));
  const res = await answer(rv, false, T0);
  assert.equal(res.state, State.Relearning);
  assert.ok(res.due.getTime() - T0.getTime() <= min(10));

  const wait = await nextCard(db, u, at(T0, min(1)), limits);
  assert.equal(wait.status, "waiting");
  assert.deepEqual(wait.status === "waiting" && wait.until, res.due);
  const back = await nextCard(db, u, res.due, limits);
  assert.equal(back.status === "card" && back.next.card.id, rv);
  assert.equal(back.status === "card" && back.next.kind, "learning");

  // 다시 맞히면 다음 날 이후로 넘어가 오늘 학습이 끝난다.
  await answer(rv, true, res.due);
  assert.equal((await nextCard(db, u, at(res.due, min(1)), limits)).status, "done");
});

test("틀린 카드는 복습 상한과 상관없이 다시 나온다", async () => {
  const r = [await addCard("r0", review(at(T0, -day(1)))), await addCard("r1", review(at(T0, -day(1))))];
  await answer(r[0], false, T0);
  await answer(r[1], false, T0);
  assert.equal((await todayQueue(db, u, at(T0, min(30)), limits)).ready.length, 2);
});

test("다음 카드는 학습 카드·복습·새 카드를 구분하지 않고 랜덤으로 고른다", async () => {
  await addCard("r", review(at(T0, -day(1))));
  await addCard("n");
  const seen = new Set<string>();
  for (const x of [0, 0.99]) {
    const c = await nextCard(db, u, T0, limits, () => x);
    seen.add(c.status === "card" ? c.next.kind : c.status);
  }
  assert.deepEqual(seen, new Set(["review", "new"]));
});

test("판정 결과가 그 사용자의 카드 상태와 복습 기록(원래 판정·최종 판정)으로 남는다", async () => {
  const id = await addCard("a");
  const res = await recordReview(db, u.id, { cardId: id, userAnswer: "내 번역", graderIsCorrect: false, graderReason: "시제 틀림", isCorrect: true }, T0);
  const [log] = await db.select().from(reviewLogs).where(eq(reviewLogs.id, res.logId));
  assert.equal(log.userId, u.id);
  assert.equal(log.userAnswer, "내 번역");
  assert.equal(log.graderIsCorrect, false);
  assert.equal(log.graderReason, "시제 틀림");
  assert.equal(log.isCorrect, true);
  assert.equal(log.gradedBy, "claude");
  assert.equal(log.rating, 3); // Good
  assert.equal(log.state, State.New);
  assert.deepEqual(log.reviewedAt, T0);
  const s = await state(id);
  assert.equal(s.reps, 1);
  assert.deepEqual(s.due, res.due);
  assert.deepEqual(s.lastReview, T0);
});

const FSRS_KEYS = ["due", "stability", "difficulty", "elapsedDays", "scheduledDays", "learningSteps", "reps", "lapses", "state", "lastReview", "rating", "lastElapsedDays", "reviewedAt"];
const fsrsFields = (row: object) => Object.fromEntries(Object.entries(row).filter(([k]) => FSRS_KEYS.includes(k)));

test("정정하면 최종 판정으로 다시 계산한 일정이 된다", async () => {
  for (const withReview of [false, true]) {
    for (const [graded, final] of [
      [false, true],
      [true, false],
    ]) {
      await reset();
      u = await addUser();
      const opts = withReview ? review(at(T0, -day(1))) : {};
      const a = await addCard("a", opts);
      const b = await addCard("b", opts);
      // a는 판정 후 정정하고, b는 처음부터 최종 판정으로 기록한다.
      const first = await answer(a, graded, T0);
      const fixed = await correctReview(db, u.id, first.logId, final, at(T0, min(1)));
      const direct = await answer(b, final, T0);
      assert.deepEqual(fixed.due, direct.due);
      assert.equal(fixed.state, direct.state);
      assert.deepEqual(fsrsFields(await state(a)), fsrsFields(await state(b)));

      const [la] = await db.select().from(reviewLogs).where(eq(reviewLogs.id, first.logId));
      const [lb] = await db.select().from(reviewLogs).where(eq(reviewLogs.id, direct.logId));
      assert.equal(la.isCorrect, final);
      assert.equal(la.graderIsCorrect, graded); // 원래 판정은 그대로 남는다
      assert.deepEqual({ ...fsrsFields(la), isCorrect: la.isCorrect }, { ...fsrsFields(lb), isCorrect: lb.isCorrect });
      assert.equal((await db.select().from(reviewLogs)).length, 2); // 정정은 기록을 늘리지 않는다
    }
  }
});

test("마지막 기록이 아니거나 다른 사용자의 기록이면 정정할 수 없다", async () => {
  const id = await addCard("a");
  const first = await answer(id, false, T0);
  const other = await addUser();
  await assert.rejects(correctReview(db, other.id, first.logId, true, at(T0, min(1))), /복습 기록이 없습니다/);
  await answer(id, true, at(T0, min(2)));
  await assert.rejects(correctReview(db, u.id, first.logId, true, at(T0, min(3))), /뒤에 기록이 있어/);
});

test("정정은 오늘(새벽 4시 기준) 한 기록만 되고, 지난 기록은 거절하며 상태와 기록을 그대로 둔다(문서 4.2-3)", async () => {
  // 오늘 한 마지막 기록은 정정된다.
  const a = await addCard("a");
  const fa = await answer(a, false, T0);
  assert.equal((await correctReview(db, u.id, fa.logId, true, at(T0, min(30)))).logId, fa.logId);

  // 어제 한 마지막 기록, 새벽 4시 직전 기록을 4시 뒤에 정정하는 경우는 거절된다.
  const cases: [Date, Date][] = [
    [T0, new Date("2026-10-18T12:00:00+09:00")],
    [new Date("2026-10-18T03:50:00+09:00"), new Date("2026-10-18T04:10:00+09:00")],
  ];
  for (const [i, [when, now]] of cases.entries()) {
    const id = await addCard(`old${i}`);
    const log = await answer(id, false, when);
    const before = { card: await state(id), logs: await db.select().from(reviewLogs).where(eq(reviewLogs.id, log.logId)) };
    await assert.rejects(correctReview(db, u.id, log.logId, true, now, 4), /지난 기록이라 정정할 수 없습니다/);
    assert.deepEqual(await state(id), before.card);
    assert.deepEqual(await db.select().from(reviewLogs).where(eq(reviewLogs.id, log.logId)), before.logs);
  }
});

test("기다리지 않고 바로 보기면 가장 빨리 돌아올 다시 볼 카드를 바로 낸다", async () => {
  const a = await addCard("a");
  const b = await addCard("b");
  const ra = await answer(a, true, T0); // 맞힘: 10분 뒤
  const rb = await answer(b, false, T0); // 틀림: 1분 뒤
  assert.ok(rb.due < ra.due);
  const now = at(T0, 30_000); // 둘 다 아직 시각이 안 됐다

  const w = await nextCard(db, u, now, limits);
  assert.deepEqual(w.status === "waiting" && w.until, rb.due);
  const ahead = await nextCard(db, u, now, limits, Math.random, true);
  assert.equal(ahead.status === "card" && ahead.next.card.id, b);
  assert.equal(ahead.status === "card" && ahead.next.kind, "learning");
  // 지금 낼 카드가 있으면 바로 보기여도 그 카드를 먼저 낸다.
  const c = await addCard("c");
  const ready = await nextCard(db, u, now, limits, Math.random, true);
  assert.equal(ready.status === "card" && ready.next.card.id, c);
});

test("새 카드 더 학습은 오늘 카드를 다 끝낸 뒤 형제 카드를 뺀 낼 수 있는 수만큼 상한을 늘리고, 다음 날에는 원래 상한으로 돌아간다", async () => {
  const L: StudyLimits = { ...limits, extraNewStep: 1 };
  const [a, b, c] = [await addCard("a"), await addCard("b"), await addCard("c")]; // 상한 3장
  const [d1, d2, e, f] = [await addCard("d"), await addCard("d"), await addCard("e"), await addCard("a")];
  // a·b·c를 먼저 학습한다(다른 카드보다 순서가 앞서지 않을 수 있으므로 직접 답한다).
  let t = T0;
  const tick = () => (t = at(t, min(1)));
  const finish = async () => {
    for (let n = await nextCard(db, u, tick(), L, () => 0, true); n.status === "card"; n = await nextCard(db, u, tick(), L, () => 0, true)) await answer(n.next.card.id, true, t);
  };

  for (const id of [a, b, c]) await answer(id, true, tick());
  // 오늘 카드가 남아 있으면(다시 볼 카드 대기 포함) 늘리지 않는다.
  assert.equal((await todayCounts(db, u, tick(), L)).ready, 0);
  assert.notEqual((await todayCounts(db, u, t, L)).waitingUntil, null);
  assert.equal(await addExtraNew(db, u, t, L), 0);
  await finish();

  // d1·d2는 같은 표제어라 하나로 세고, f는 오늘 학습한 a의 형제라 세지 않는다. 한 번에 extraNewStep(1)장만 더한다.
  let cnt = await todayCounts(db, u, tick(), L);
  assert.deepEqual({ ready: cnt.ready, waitingUntil: cnt.waitingUntil, moreNew: cnt.moreNew, restNew: cnt.restNew }, { ready: 0, waitingUntil: null, moreNew: 1, restNew: 4 });
  assert.equal(await addExtraNew(db, u, t, L), 1);
  assert.equal(await extraNewToday(db, u.id, t, L.dayStartHour), 1);
  const n = await nextCard(db, u, t, L);
  assert.ok(n.status === "card" && [d1, d2, e].includes(n.next.card.id));
  await finish();
  assert.equal(await addExtraNew(db, u, tick(), L), 1);
  assert.equal((await todayCounts(db, u, t, L)).new, 1);
  await finish();

  // 남은 새 카드(d 하나, f)는 모두 오늘 학습한 표제어의 형제라 더할 수 없다.
  cnt = await todayCounts(db, u, tick(), L);
  assert.deepEqual({ moreNew: cnt.moreNew, restNew: cnt.restNew }, { moreNew: 0, restNew: 2 });
  assert.equal(await addExtraNew(db, u, t, L), 0);

  // 다음 날에는 더한 장수가 없고 원래 상한으로 남은 카드를 낸다.
  const tomorrow = at(T0, day(1));
  assert.equal(await extraNewToday(db, u.id, tomorrow, L.dayStartHour), 0);
  const fresh = (await todayQueue(db, u, tomorrow, L)).ready.filter((x) => x.kind === "new");
  assert.equal(fresh.length, 2);
  assert.ok(fresh.some((x) => x.card.id === f));
});
