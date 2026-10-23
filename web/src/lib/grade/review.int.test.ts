// 판정·기록 통합 테스트. Claude API 대신 가짜 판정 함수를 넣어 기록, 실패 처리, API 없이 판정, 하루 한도를 확인한다.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { State } from "ts-fsrs";
import { eq } from "drizzle-orm";
import { cards, gradeUsage, gradeUsageTotal, reviewLogs, userCards } from "@/db/schema";
import { excludeForUser } from "@/lib/cards/edit";
import { todayQueue } from "@/lib/study/schedule";
import { addCard, addUser, at, day, db, min, reset, T0 } from "../../../test/helpers";
import type { Grader } from "./claude";
import type { GradeInput } from "./prompt";
import { gradeAndRecord, type GradeLimits } from "./review";

beforeEach(reset);

const limits: GradeLimits = { perUser: 50, total: 300, dayStartHour: 4 };
// 같은 카드를 여러 번 답하는 테스트가 있어 틀림으로 판정한다. 틀리면 그 카드는 다시 볼 카드로 오늘 대기열에 남는다(맞히면 두 번째에 복습 카드가 되어 대기열을 떠난다).
const counting = () => {
  const calls = { n: 0 };
  const grade: Grader = async () => (calls.n++, { is_correct: false, reason: "틀림" });
  return { calls, grade };
};

test("판정 결과를 원래 판정·최종 판정으로 기록하고 판정 입력에 카드 내용을 넣는다", async () => {
  const u = await addUser();
  const cardId = await addCard("run", { exampleKo: "나는 매일 아침 달린다." });
  let got: GradeInput | undefined;
  const grade: Grader = async (input) => ((got = input), { is_correct: true, reason: "모두 예" });
  const r = await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "  나는 아침마다 달린다.  ", T0, limits);
  assert.equal(r.status, "graded");
  assert.deepEqual(got, { headword: "run", senseKo: "뜻", exampleEn: "Example run.", exampleKo: "나는 매일 아침 달린다.", answer: "나는 아침마다 달린다." });
  const [log] = await db.select().from(reviewLogs);
  assert.equal(log.userAnswer, "나는 아침마다 달린다.");
  assert.equal(log.isCorrect, true);
  assert.equal(log.graderReason, "모두 예");
  assert.equal(log.gradedBy, "claude");
  assert.equal((await db.select().from(userCards))[0].state, State.Learning);
});

test("판정 호출이 실패하면 기록하지 않고 상태와 한도 횟수도 그대로 둔다", async () => {
  const u = await addUser();
  const cardId = await addCard("run");
  const fail: Grader = async () => {
    throw new Error("overloaded");
  };
  await assert.rejects(gradeAndRecord(db, fail, { user: u, isAdmin: false }, cardId, "답", T0, limits), /overloaded/);
  assert.equal((await db.select().from(reviewLogs)).length, 0);
  assert.equal((await db.select().from(userCards)).length, 0);
  assert.deepEqual((await db.select().from(gradeUsage)).map((r) => r.count), [0]);
  assert.deepEqual((await db.select().from(gradeUsageTotal)).map((r) => r.count), [0]);
});

test("빈 답안은 API를 부르지 않고 틀림으로 기록한다", async () => {
  const u = await addUser();
  const cardId = await addCard("run");
  const { calls, grade } = counting();
  const r = await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "   ", T0, limits);
  assert.equal(calls.n, 0);
  assert.equal(r.status === "graded" && r.isCorrect, false);
  const [log] = await db.select().from(reviewLogs);
  assert.equal(log.gradedBy, "empty");
  assert.equal(log.rating, 1); // Again
});

test("저장된 번역을 그대로 입력하면 API 호출 없이 맞음이 되고 한도에 넣지 않는다(4.4-2)", async () => {
  const u = await addUser({ newPerDay: 5 });
  const { calls, grade } = counting();
  // 맞힌 카드는 두 번째에 오늘 대기열을 떠나므로 답마다 카드를 따로 쓴다.
  const answers = ["나는 매일 아침 달린다.", "  나는  매일 아침   달린다 ", "나는 매일 아침 달린다!"];
  for (const [i, answer] of answers.entries()) {
    const id = await addCard(`run${i}`, { exampleKo: "나는 매일 아침 달린다." });
    const r = await gradeAndRecord(db, grade, { user: u, isAdmin: false }, id, answer, T0, limits);
    assert.equal(r.status === "graded" && r.isCorrect, true);
  }
  const cardId = await addCard("run9", { exampleKo: "나는 매일 아침 달린다." });
  assert.equal(calls.n, 0);
  const logs = await db.select().from(reviewLogs);
  assert.ok(logs.every((l) => l.gradedBy === "exact"));
  assert.equal((await db.select().from(gradeUsage)).length, 0);
  // 한 글자라도 다르면 API로 판정한다.
  await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "나는 매일 아침 뛴다.", T0, limits);
  assert.equal(calls.n, 1);
});

test("답안이 300자를 넘으면 서버에서 거부한다(4.8-3)", async () => {
  const u = await addUser();
  const cardId = await addCard("run");
  const { calls, grade } = counting();
  await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "가".repeat(300), T0, limits);
  await assert.rejects(gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "가".repeat(301), T0, limits), /300자/);
  assert.equal(calls.n, 1);
});

test("사용자별 51번째 요청은 판정하지 않고 상태를 바꾸지 않는다(4.4-1)", async () => {
  const u = await addUser();
  const other = await addUser();
  const cardId = await addCard("run");
  const { calls, grade } = counting();
  const L = { ...limits, perUser: 50 };
  // 앞의 45번은 횟수만 미리 넣고(같은 날), 46~50번째를 실제로 요청한다.
  await db.insert(gradeUsage).values({ userId: u.id, day: "2026-10-17", count: 45 });
  await db.insert(gradeUsageTotal).values({ day: "2026-10-17", count: 45 });
  for (let i = 46; i <= 50; i++) assert.equal((await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, `답 ${i}`, T0, L)).status, "graded");
  const before = (await db.select().from(userCards))[0];
  const r = await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "답 51", T0, L);
  assert.deepEqual(r, { status: "limit", scope: "user" });
  assert.equal(calls.n, 5);
  assert.equal((await db.select().from(reviewLogs)).length, 5);
  assert.deepEqual((await db.select().from(userCards))[0], before);
  assert.equal((await db.select().from(gradeUsage))[0].count, 50);
  // 다른 사용자는 판정할 수 있고, 다음 날(새벽 4시)에는 다시 판정할 수 있다.
  assert.equal((await gradeAndRecord(db, grade, { user: other, isAdmin: false }, cardId, "답", T0, L)).status, "graded");
  assert.equal((await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "답", new Date("2026-10-18T04:00:00+09:00"), L)).status, "graded");
});

test("전체 301번째 요청은 거부되고, 관리자는 두 한도와 전체 횟수에서 빠진다(4.4-1)", async () => {
  const cardId = await addCard("run");
  const { calls, grade } = counting();
  const users: Awaited<ReturnType<typeof addUser>>[] = [];
  for (let i = 0; i < 7; i++) users.push(await addUser());
  const L = { ...limits, total: 300 };
  // 6명이 50번씩 쓴 것 중 296번은 횟수만 미리 넣고, 마지막 4번(297~300번째)을 실제로 요청한다.
  await db.insert(gradeUsage).values(users.slice(0, 6).map((u, i) => ({ userId: u.id, day: "2026-10-17", count: i < 2 ? 48 : 50 })));
  await db.insert(gradeUsageTotal).values({ day: "2026-10-17", count: 296 });
  for (const u of users.slice(0, 2)) {
    for (let i = 0; i < 2; i++) assert.equal((await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, `답 ${i}`, T0, L)).status, "graded");
  }
  assert.equal((await db.select().from(gradeUsageTotal))[0].count, 300);
  const r = await gradeAndRecord(db, grade, { user: users[6], isAdmin: false }, cardId, "답", T0, L);
  assert.deepEqual(r, { status: "limit", scope: "total" });
  // 전체 한도에 걸린 요청은 사용자 횟수도 올리지 않는다.
  assert.equal((await db.select().from(gradeUsage)).find((x) => x.userId === users[6].id)?.count ?? 0, 0);
  const admin = await addUser();
  for (let i = 0; i < 3; i++) assert.equal((await gradeAndRecord(db, grade, { user: admin, isAdmin: true }, cardId, `답 ${i}`, T0, L)).status, "graded");
  assert.equal((await db.select().from(gradeUsageTotal))[0].count, 300);
  assert.equal((await db.select().from(gradeUsage)).find((x) => x.userId === admin.id), undefined);
  assert.equal(calls.n, 7);
});

test("동시에 요청해도 사용자 한도와 전체 한도를 넘지 않는다(4.4-1)", async () => {
  const cardIds: number[] = [];
  for (let i = 0; i < 4; i++) cardIds.push(await addCard(`w${i}`));
  const { calls, grade } = counting();
  const slow: Grader = async (x) => (await new Promise((r) => setTimeout(r, 20)), grade(x));
  // 새 카드 4장이 모두 오늘 대기열에 들어가게 하루 새 카드 수를 4로 둔다.
  const u = await addUser({ newPerDay: 4 });
  // 사용자 한도 5에 20개를 동시에 보낸다(카드가 달라 기록 잠금이 겹치지 않는다).
  const L = { ...limits, perUser: 5, total: 300 };
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => gradeAndRecord(db, slow, { user: u, isAdmin: false }, cardIds[i % 4], `답 ${i}`, T0, L).catch((e) => e)));
  assert.equal(rs.filter((r) => r.status === "graded").length, 5);
  assert.equal(rs.filter((r) => r.status === "limit" && r.scope === "user").length, 15);
  assert.equal((await db.select().from(gradeUsage))[0].count, 5);

  // 전체 한도 8에 사용자 4명이 4개씩 16개를 동시에 보낸다.
  await reset();
  const cs: number[] = [];
  for (let i = 0; i < 4; i++) cs.push(await addCard(`v${i}`));
  const us: Awaited<ReturnType<typeof addUser>>[] = [];
  for (let i = 0; i < 4; i++) us.push(await addUser({ newPerDay: 4 }));
  calls.n = 0;
  const L2 = { ...limits, perUser: 50, total: 8 };
  const rs2 = await Promise.all(us.flatMap((u) => cs.map((c, i) => gradeAndRecord(db, slow, { user: u, isAdmin: false }, c, `답 ${i}`, T0, L2).catch((e) => e))));
  assert.equal(rs2.filter((r) => r.status === "graded").length, 8);
  assert.equal(calls.n, 8);
  assert.equal((await db.select().from(gradeUsageTotal))[0].count, 8);
  const perUser = (await db.select().from(gradeUsage)).reduce((s, r) => s + r.count, 0);
  assert.equal(perUser, 8);
});

// 오늘 대기열 밖 제출(문서 4.2-1). 판정 함수·한도 횟수·카드 상태·복습 기록을 모두 건드리지 않는다.
const snapshot = async () => ({
  cards: await db.select().from(userCards).orderBy(userCards.cardId),
  logs: (await db.select().from(reviewLogs)).length,
  usage: await db.select().from(gradeUsage),
  total: await db.select().from(gradeUsageTotal),
});

test("오늘 대기열 밖 카드는 어떤 판정도 하지 않고 횟수·상태·기록을 그대로 둔다(4.2-1)", async () => {
  const u = await addUser({ newPerDay: 2, excludedLevels: ["a2"] });
  const { calls, grade } = counting();
  const seen = await addCard("seen"); // 오늘 이미 답한 새 카드(형제·상한 확인용)
  await gradeAndRecord(db, grade, { user: u, isAdmin: false }, seen, "답", T0, limits);
  calls.n = 0;

  const notDue = await addCard("later", { review: { userId: u.id, due: at(T0, day(3)) }, exampleKo: "정답." });
  const hidden = await addCard("hidden");
  await excludeForUser(db, u.id, hidden);
  const removed = await addCard("removed");
  await db.update(cards).set({ excludedAt: T0 }).where(eq(cards.id, removed));
  const otherLevel = await addCard("upper", { level: "a2" });
  const sibling = await addCard("seen"); // 같은 표제어: 오늘 이미 학습해 내일로 미룬다
  const fill = await addCard("fill"); // 하루 새 카드 상한(2)의 남은 한 자리를 채운다
  const overLimit = await addCard("zzz-over");
  // 남은 한 자리는 무작위 순서로 정해지므로 실제로 오늘 대기열에 들어가지 않은 쪽을 상한 초과 카드로 쓴다.
  const readyIds = (await todayQueue(db, u, T0)).ready.map((c) => c.card.id);
  const beyond = readyIds.includes(fill) ? overLimit : fill;

  const cases: [string, number, string][] = [
    ["예정일 전 복습 카드", notDue, "정답."],
    ["나만 뺀 카드", hidden, "답"],
    ["관리자가 뺀 카드", removed, "답"],
    ["제외한 레벨의 새 카드", otherLevel, "답"],
    ["형제 카드로 미룬 카드", sibling, "답"],
    ["하루 새 카드 상한을 넘은 카드", beyond, "답"],
    ["없는 카드", 999_999, "답"],
    ["빈 답안이어도", notDue, "   "],
  ];
  for (const [name, cardId, answer] of cases) {
    const before = await snapshot();
    for (const isAdmin of [false, true]) {
      const r = await gradeAndRecord(db, grade, { user: u, isAdmin }, cardId, answer, T0, limits);
      assert.deepEqual(r, { status: "outside" }, `${name}(관리자 ${isAdmin})`);
    }
    assert.equal(calls.n, 0, name);
    assert.deepEqual(await snapshot(), before, name);
  }
});

test("지금 낼 새 카드·복습 카드·다시 볼 카드와 시각 전 대기 카드는 접수한다(4.2-1)", async () => {
  const u = await addUser({ newPerDay: 3 });
  const { grade } = counting();
  const fresh = await addCard("fresh");
  const due = await addCard("due", { review: { userId: u.id, due: at(T0, -day(1)) } });
  const again = await addCard("again");
  const ok = async (cardId: number, now: Date) => assert.equal((await gradeAndRecord(db, grade, { user: u, isAdmin: false }, cardId, "답", now, limits)).status, "graded");
  await ok(fresh, T0);
  await ok(due, T0);
  await ok(again, T0); // 틀림: 1분 뒤 다시 볼 카드
  await ok(again, at(T0, min(0.5))); // 시각 전 대기 카드(기다리지 않고 바로 보기)
  await ok(again, at(T0, min(5))); // 시각이 된 다시 볼 카드
});
