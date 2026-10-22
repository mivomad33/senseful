// 홈 통계 테스트. 학습 기록, 레벨별 학습 현황(뺀 카드 제외, 학습함·익숙함 기준), 복습 예정을 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createEmptyCard, State } from "ts-fsrs";
import * as schema from "@/db/schema";
import { cards, items, reviewLogs } from "@/db/schema";
import { daysLeft, formatDays, levelStats, percent, reviewForecast, studyHistory } from "./stats";

test("레벨별로 전체 뜻·카드·학습함·익숙함·남은 뜻을 센다", () => {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const e = createEmptyCard(new Date(2026, 9, 1));
  // a1 뜻 5개 중 4개에 카드: 새 카드, 학습 중, 복습(간격 3일), 복습(간격 30일). b1 뜻 1개에 뺀 카드.
  const specs: { cefr: "a1" | "b1"; card?: { state: State; scheduledDays: number; excluded?: boolean } }[] = [
    { cefr: "a1", card: { state: State.New, scheduledDays: 0 } },
    { cefr: "a1", card: { state: State.Learning, scheduledDays: 0 } },
    { cefr: "a1", card: { state: State.Review, scheduledDays: 3 } },
    { cefr: "a1", card: { state: State.Review, scheduledDays: 30 } },
    { cefr: "a1" },
    { cefr: "b1", card: { state: State.Review, scheduledDays: 30, excluded: true } },
  ];
  for (const [i, s] of specs.entries()) {
    const it = db
      .insert(items)
      .values({ key: `word:${i}`, kind: "word", headword: `w${i}`, dictSenseId: `s${i}`, cefr: s.cefr, definition: `def ${i}`, sourceSlug: `w${i}`, collectedAt: new Date(0) })
      .returning()
      .get();
    if (!s.card) continue;
    const { id } = db
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
        scheduledDays: s.card.scheduledDays,
        learningSteps: e.learning_steps,
        reps: e.reps,
        lapses: e.lapses,
        state: s.card.state,
      })
      .returning()
      .get();
    if (s.card.excluded) db.update(cards).set({ excludedAt: new Date() }).where(eq(cards.id, id)).run();
  }

  assert.deepEqual(levelStats(db), [
    // a1 남은 뜻: 새 카드 1 + 카드 없는 뜻 1. b1은 뺀 카드뿐이라 남은 뜻이 없다.
    { level: "a1", items: 5, cards: 4, studied: 3, mature: 1, remaining: 2 },
    { level: "a2", items: 0, cards: 0, studied: 0, mature: 0, remaining: 0 },
    { level: "b1", items: 1, cards: 0, studied: 0, mature: 0, remaining: 0 },
    { level: "b2", items: 0, cards: 0, studied: 0, mature: 0, remaining: 0 },
    { level: "c1", items: 0, cards: 0, studied: 0, mature: 0, remaining: 0 },
  ]);
});

test("퍼센트는 소수점 한 자리까지, 반올림으로 0%·100%가 되는 값은 <0.1%·>99.9%로 보인다", () => {
  assert.equal(percent(40, 2319), "1.7%");
  assert.equal(percent(0, 2319), "0%");
  assert.equal(percent(0, 0), "0%");
  assert.equal(percent(1, 2319), "<0.1%");
  assert.equal(percent(2319, 2319), "100%");
  assert.equal(percent(1, 2), "50%");
  assert.equal(percent(2318, 2319), ">99.9%");
});

test("남은 날 수는 하루 상한으로 나눠 올림하고, 30일·12개월을 넘으면 개월·년으로 보인다", () => {
  assert.equal(daysLeft(2299, 20), 115);
  assert.equal(daysLeft(20, 20), 1);
  assert.equal(daysLeft(21, 20), 2);
  assert.equal(daysLeft(0, 20), 0);

  assert.equal(formatDays(0), "완료");
  assert.equal(formatDays(1), "1일");
  assert.equal(formatDays(29), "29일");
  assert.equal(formatDays(30), "1개월");
  assert.equal(formatDays(115), "3개월 25일");
  assert.equal(formatDays(359), "11개월 29일");
  // 12개월 이상은 일을 생략하고 개월을 올림한다.
  assert.equal(formatDays(360), "1년");
  assert.equal(formatDays(361), "1년 1개월");
  assert.equal(formatDays(678), "1년 11개월");
  assert.equal(formatDays(720), "2년");
});

test("복습 예정은 학습한 카드(뺀 카드 제외)의 다음 복습일을 레벨별로 새벽 4시 기준 날짜 구간으로 센다", () => {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const e = createEmptyCard(new Date(2026, 9, 1));
  // 지금: 10월 17일 10시. 오늘 학습일은 17일 4시 ~ 18일 4시.
  const now = new Date(2026, 9, 17, 10, 0);
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
  const specs: { due: Date; state?: State; excluded?: boolean; cefr?: "a1" | "b2" }[] = [
    { due: at(17, 23) }, // 오늘(세지 않음)
    { due: at(18, 3) }, // 새벽 4시 전이라 아직 오늘
    { due: at(18, 4) }, // 내일
    { due: at(19, 3) }, // 내일(19일 4시 전)
    { due: at(19, 4) }, // 2~7일
    { due: at(24, 12) }, // 7일 뒤 → 2~7일
    { due: at(25, 4) }, // 8일 뒤 → 8~30일
    { due: new Date(2026, 10, 17, 12) }, // 31일 뒤 → 31일~1년
    { due: new Date(2027, 9, 18, 12) }, // 366일 뒤 → 1년 이후
    { due: at(20, 12), state: State.New }, // 새 카드는 세지 않는다
    { due: at(20, 12), excluded: true }, // 뺀 카드는 세지 않는다
    { due: at(18, 12), cefr: "b2" }, // b2 내일
  ];
  for (const [i, sp] of specs.entries()) {
    const it = db
      .insert(items)
      .values({ key: `word:${i}`, kind: "word", headword: `w${i}`, dictSenseId: `s${i}`, cefr: sp.cefr ?? "a1", definition: `def ${i}`, sourceSlug: `w${i}`, collectedAt: new Date(0) })
      .returning()
      .get();
    db.insert(cards)
      .values({
        itemId: it.id,
        senseKo: "뜻",
        exampleEn: "Example.",
        exampleKo: "예문.",
        due: sp.due,
        stability: e.stability,
        difficulty: e.difficulty,
        elapsedDays: 0,
        scheduledDays: 1,
        learningSteps: 0,
        reps: 1,
        lapses: 0,
        state: sp.state ?? State.Review,
        excludedAt: sp.excluded ? now : null,
      })
      .run();
  }
  // 구간 순서: 내일, 2~7일, 8~30일, 31일~1년, 1년 이후
  assert.deepEqual(reviewForecast(db, now, 4), [
    { level: "a1", counts: [2, 2, 1, 1, 1] },
    { level: "a2", counts: [0, 0, 0, 0, 0] },
    { level: "b1", counts: [0, 0, 0, 0, 0] },
    { level: "b2", counts: [1, 0, 0, 0, 0] },
    { level: "c1", counts: [0, 0, 0, 0, 0] },
  ]);
});


test("학습 기록은 새벽 4시 기준 날짜별로 답한 수·새 카드·정답을 세고, 연속 학습일을 센다", () => {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const e = createEmptyCard(new Date(2026, 9, 1));
  const it = db
    .insert(items)
    .values({ key: "word:0", kind: "word", headword: "w", dictSenseId: "s", cefr: "a1", definition: "def", sourceSlug: "w", collectedAt: new Date(0) })
    .returning()
    .get();
  const card = db
    .insert(cards)
    .values({ itemId: it.id, senseKo: "뜻", exampleEn: "Example.", exampleKo: "예문.", due: e.due, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, state: State.New })
    .returning()
    .get();
  const log = (at: Date, state: State, isCorrect: boolean) =>
    db
      .insert(reviewLogs)
      .values({ cardId: card.id, userAnswer: "답", isCorrect, graderIsCorrect: isCorrect, reviewedAt: at, rating: 3, state, due: at, stability: 0, difficulty: 0, elapsedDays: 0, lastElapsedDays: 0, scheduledDays: 0, learningSteps: 0 })
      .run();
  const at = (day: number, hour: number, min = 0, sec = 0) => new Date(2026, 9, day, hour, min, sec);

  log(at(10, 12), State.New, true); // 7일 밖
  log(at(17, 16, 0), State.New, true);
  log(at(17, 16, 1), State.Review, false);
  log(at(17, 16, 10), State.Learning, true);
  log(at(17, 16, 50), State.New, true);
  log(at(17, 16, 52), State.Review, true);
  // 19일 새벽 4시 전은 18일 학습이다.
  log(at(19, 3, 30), State.New, true);
  log(at(19, 3, 31, 30), State.Review, false);

  const now = at(19, 10);
  const h = studyHistory(db, now, 4);
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
  log(at(19, 5), State.Review, true);
  log(at(19, 5, 10), State.Relearning, true);
  const h2 = studyHistory(db, now, 4);
  assert.equal(h2.days[0].answers, 2);
  assert.equal(h2.days[0].reviewCards, 1);
  assert.equal(h2.days[0].newCards, 0);
  assert.equal(h2.streak, 3);
});
