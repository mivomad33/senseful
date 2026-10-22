// 홈 통계 통합 테스트. 학습 기록, 레벨별 학습 현황(뺀 카드 제외, 학습함·익숙함 기준), 복습 예정을 사용자별로 확인한다.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { createEmptyCard, State } from "ts-fsrs";
import { cards, reviewLogs, userCards } from "@/db/schema";
import { excludeForUser } from "@/lib/cards/edit";
import { addCard, addItem, addUser, db, reset, T0 } from "../../../test/helpers";
import { recordReview } from "./schedule";
import { levelStats, reviewForecast, studyHistory } from "./stats";

beforeEach(reset);

const kst = (s: string) => new Date(`${s}+09:00`);

async function setState(userId: number, cardId: number, state: State, scheduledDays: number, due = T0) {
  const e = createEmptyCard(T0);
  await db.insert(userCards).values({
    userId,
    cardId,
    due,
    stability: e.stability,
    difficulty: e.difficulty,
    elapsedDays: 0,
    scheduledDays,
    learningSteps: 0,
    reps: state === State.New ? 0 : 1,
    lapses: 0,
    state,
  });
}

test("레벨별로 전체 뜻·카드·학습함·익숙함·남은 뜻을 사용자 기준으로 센다", async () => {
  const u = await addUser({ excludedLevels: ["b2"] });
  // a1 뜻 6개 중 5개에 카드: 새 카드, 학습 중, 복습(간격 3일), 복습(간격 30일), 나만 뺀 카드. b1 뜻 1개에 관리자가 뺀 카드.
  await addCard("new");
  await setState(u.id, await addCard("learning"), State.Learning, 0);
  await setState(u.id, await addCard("r3"), State.Review, 3);
  await setState(u.id, await addCard("r30"), State.Review, 30);
  await excludeForUser(db, u.id, await addCard("mine"));
  await addItem("no-card");
  const b1 = await addCard("admin-out", { level: "b1" });
  await setState(u.id, b1, State.Review, 30);
  await db.update(cards).set({ excludedAt: T0 }).where(eq(cards.id, b1));
  await addItem("b2-item", "b2");

  assert.deepEqual(await levelStats(db, u), [
    // a1 남은 뜻: 새 카드 1 + 카드 없는 뜻 1. 나만 뺀 카드는 카드·남은 뜻에서 빠진다. b1은 뺀 카드뿐이라 남은 뜻이 없다.
    { level: "a1", items: 6, cards: 4, studied: 3, mature: 1, remaining: 2, excluded: false },
    { level: "a2", items: 0, cards: 0, studied: 0, mature: 0, remaining: 0, excluded: false },
    { level: "b1", items: 1, cards: 0, studied: 0, mature: 0, remaining: 0, excluded: false },
    { level: "b2", items: 1, cards: 0, studied: 0, mature: 0, remaining: 1, excluded: true },
    { level: "c1", items: 0, cards: 0, studied: 0, mature: 0, remaining: 0, excluded: false },
  ]);

  // 다른 사용자에게는 이 사용자의 학습·나만 빼기가 보이지 않는다.
  const other = await addUser();
  const [a1] = await levelStats(db, other);
  assert.deepEqual(a1, { level: "a1", items: 6, cards: 5, studied: 0, mature: 0, remaining: 6, excluded: false });
});

test("복습 예정은 학습한 카드(뺀 카드 제외)의 다음 복습일을 레벨별로 한국 시간 새벽 4시 기준 날짜 구간으로 센다", async () => {
  const u = await addUser();
  // 지금: 10월 17일 10시(한국). 오늘 학습일은 17일 4시 ~ 18일 4시.
  const now = kst("2026-10-17T10:00:00");
  const at = (d: number, h: number) => kst(`2026-10-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00`);
  const specs: { due: Date; state?: State; excluded?: "admin" | "mine"; cefr?: "a1" | "b2" }[] = [
    { due: at(17, 23) }, // 오늘(세지 않음)
    { due: at(18, 3) }, // 새벽 4시 전이라 아직 오늘
    { due: at(18, 4) }, // 내일
    { due: at(19, 3) }, // 내일(19일 4시 전)
    { due: at(19, 4) }, // 2~7일
    { due: at(24, 12) }, // 7일 뒤 → 2~7일
    { due: at(25, 4) }, // 8일 뒤 → 8~30일
    { due: kst("2026-11-17T12:00:00") }, // 31일 뒤 → 31일~1년
    { due: kst("2027-10-18T12:00:00") }, // 366일 뒤 → 1년 이후
    { due: at(20, 12), state: State.New }, // 새 카드는 세지 않는다
    { due: at(20, 12), excluded: "admin" }, // 관리자가 뺀 카드는 세지 않는다
    { due: at(20, 12), excluded: "mine" }, // 나만 뺀 카드는 세지 않는다
    { due: at(18, 12), cefr: "b2" }, // b2 내일
  ];
  for (const [i, sp] of specs.entries()) {
    const id = await addCard(`w${i}`, { level: sp.cefr ?? "a1" });
    await setState(u.id, id, sp.state ?? State.Review, 1, sp.due);
    if (sp.excluded === "admin") await db.update(cards).set({ excludedAt: now }).where(eq(cards.id, id));
    if (sp.excluded === "mine") await excludeForUser(db, u.id, id);
  }
  // 구간 순서: 내일, 2~7일, 8~30일, 31일~1년, 1년 이후
  assert.deepEqual(await reviewForecast(db, u.id, now, 4), [
    { level: "a1", counts: [2, 2, 1, 1, 1] },
    { level: "a2", counts: [0, 0, 0, 0, 0] },
    { level: "b1", counts: [0, 0, 0, 0, 0] },
    { level: "b2", counts: [1, 0, 0, 0, 0] },
    { level: "c1", counts: [0, 0, 0, 0, 0] },
  ]);
  assert.deepEqual((await reviewForecast(db, (await addUser()).id, now, 4))[0].counts, [0, 0, 0, 0, 0]);
});

test("학습 기록은 한국 시간 새벽 4시 기준 날짜별로 답한 수·새 카드·정답을 세고, 연속 학습일을 센다", async () => {
  const u = await addUser();
  const other = await addUser();
  const cardId = await addCard("w");
  const log = (at: Date, state: State, isCorrect: boolean, userId = u.id) =>
    db.insert(reviewLogs).values({
      userId,
      cardId,
      userAnswer: "답",
      isCorrect,
      graderIsCorrect: isCorrect,
      reviewedAt: at,
      rating: 3,
      state,
      due: at,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      lastElapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
    });
  const at = (d: number, h: number, m = 0, s = 0) => kst(`2026-10-${String(d).padStart(2, "0")}T${[h, m, s].map((n) => String(n).padStart(2, "0")).join(":")}`);

  await log(at(10, 12), State.New, true); // 7일 밖
  await log(at(17, 16, 0), State.New, true);
  await log(at(17, 16, 1), State.Review, false);
  await log(at(17, 16, 10), State.Learning, true);
  await log(at(17, 16, 50), State.New, true);
  await log(at(17, 16, 52), State.Review, true);
  // 19일 새벽 4시 전은 18일 학습이다.
  await log(at(19, 3, 30), State.New, true);
  await log(at(19, 3, 31, 30), State.Review, false);
  // 다른 사용자의 기록은 섞이지 않는다.
  await log(at(19, 9), State.New, true, other.id);
  await log(at(16, 9), State.New, true, other.id);

  const now = at(19, 10);
  const h = await studyHistory(db, u.id, now, 4);
  assert.deepEqual(
    h.days.map((d) => d.day),
    ["2026-10-19", "2026-10-18", "2026-10-17", "2026-10-16", "2026-10-15", "2026-10-14", "2026-10-13"],
  );
  // 같은 카드를 그날 새 카드로 처음 학습했으므로 복습한 카드는 0이다.
  assert.deepEqual(h.days[2], { day: "2026-10-17", date: at(17, 4), answers: 5, newCards: 2, reviewCards: 0, correct: 4 });
  assert.deepEqual(h.days[1], { day: "2026-10-18", date: at(18, 4), answers: 2, newCards: 1, reviewCards: 0, correct: 1 });
  assert.equal(h.days[0].answers, 0);
  assert.equal(h.days[3].answers, 0);
  // 오늘은 아직 학습하지 않았으므로 어제(18일)부터 센다: 18, 17일.
  assert.equal(h.streak, 2);

  // 오늘은 그 카드를 다시 보므로 복습한 카드 1장이다(두 번 봐도 한 번으로 센다).
  await log(at(19, 5), State.Review, true);
  await log(at(19, 5, 10), State.Relearning, true);
  const h2 = await studyHistory(db, u.id, now, 4);
  assert.equal(h2.days[0].answers, 2);
  assert.equal(h2.days[0].reviewCards, 1);
  assert.equal(h2.days[0].newCards, 0);
  assert.equal(h2.streak, 3);
});

test("두 사용자가 같은 카드를 학습해도 FSRS 상태·학습 기록·홈 통계가 서로 영향을 주지 않는다(4.2-2)", async () => {
  const a = await addUser();
  const b = await addUser();
  const card = await addCard("shared");
  await recordReview(db, a.id, { cardId: card, userAnswer: "a", graderIsCorrect: false }, T0);
  await recordReview(db, a.id, { cardId: card, userAnswer: "a", graderIsCorrect: true }, new Date(T0.getTime() + 600_000));
  await recordReview(db, b.id, { cardId: card, userAnswer: "b", graderIsCorrect: true }, T0);

  const rows = await db.select().from(userCards);
  const sa = rows.find((r) => r.userId === a.id)!;
  const sb = rows.find((r) => r.userId === b.id)!;
  assert.equal(sa.reps, 2);
  assert.equal(sb.reps, 1);
  assert.notDeepEqual(sa.due, sb.due);
  const ha = await studyHistory(db, a.id, T0, 4);
  const hb = await studyHistory(db, b.id, T0, 4);
  assert.equal(ha.days[0].answers, 2);
  assert.equal(hb.days[0].answers, 1);
  assert.equal(hb.days[0].correct, 1);
  assert.equal((await levelStats(db, a))[0].studied, 1);
  assert.equal((await levelStats(db, b))[0].studied, 1);
  const c = await addUser();
  assert.equal((await levelStats(db, c))[0].studied, 0);
});
