// 관리자 화면 집계 통합 테스트: 신고 목록, 오늘 판정 횟수, 레벨별 카드 재고와 경고.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { cards, gradeUsage, gradeUsageTotal } from "@/db/schema";
import { excludeForUser, reportCard, resolveReport } from "@/lib/cards/edit";
import { recordReview } from "@/lib/study/schedule";
import { addCard, addItem, addUser, db, reset, T0 } from "../../test/helpers";
import { cardStock, reportList, todayGradeCounts, userCount } from "./admin";

beforeEach(reset);

test("신고가 관리자 화면 목록에 처리하지 않은 것부터 보인다(4.3-4)", async () => {
  const u = await addUser({ email: "reporter@test.local" });
  const a = await addCard("alpha");
  const b = await addCard("beta");
  await reportCard(db, u.id, a, "뜻이 틀렸습니다");
  await reportCard(db, u.id, b, "");
  const [first] = await reportList(db);
  await resolveReport(db, first.id);
  const list = await reportList(db);
  assert.equal(list.length, 2);
  assert.equal(list[0].resolvedAt, null);
  assert.ok(list[1].resolvedAt);
  const alpha = list.find((r) => r.card.headword === "alpha")!;
  assert.equal(alpha.note, "뜻이 틀렸습니다");
  assert.equal(alpha.reporter, "reporter@test.local");
  assert.equal(alpha.card.exampleKo, "예문.");
  assert.equal(await userCount(db), 1);
});

test("오늘 판정 횟수를 전체와 사용자별로 센다", async () => {
  const u = await addUser({ email: "x@test.local" });
  await db.insert(gradeUsageTotal).values({ day: "2026-10-17", count: 7 });
  await db.insert(gradeUsage).values({ userId: u.id, day: "2026-10-17", count: 7 });
  await db.insert(gradeUsage).values({ userId: u.id, day: "2026-10-16", count: 3 });
  const c = await todayGradeCounts(db, T0);
  assert.equal(c.total, 7);
  assert.deepEqual(c.byUser.map((x) => [x.email, x.count]), [["x@test.local", 7]]);
});

test("카드 재고: 레벨마다 그 레벨을 제외하지 않은 사용자 중 새 카드가 가장 적게 남은 수로 경고한다", async () => {
  const a1 = [];
  for (let i = 0; i < 3; i++) a1.push(await addCard(`a${i}`));
  await addItem("a1-no-card");
  const b1 = await addCard("b0", { level: "b1" });
  await db.update(cards).set({ excludedAt: T0 }).where(eq(cards.id, b1));
  const keen = await addUser();
  const lazy = await addUser();
  await addUser({ excludedLevels: ["a1"] }); // A1을 제외해 A1 계산에서 빠진다
  await recordReview(db, keen.id, { cardId: a1[0], userAnswer: "x", graderIsCorrect: true }, T0);
  await excludeForUser(db, keen.id, a1[1]);
  void lazy;
  const s = await cardStock(db);
  const a = s.find((r) => r.level === "a1")!;
  assert.deepEqual({ items: a.items, cards: a.cards, excluded: a.excluded, minRemaining: a.minRemaining, warn: a.warn }, { items: 4, cards: 3, excluded: 0, minRemaining: 1, warn: true });
  const b = s.find((r) => r.level === "b1")!;
  assert.deepEqual({ cards: b.cards, excluded: b.excluded, minRemaining: b.minRemaining }, { cards: 1, excluded: 1, minRemaining: 0 });

  // 그 레벨을 학습 대상에 둔 사용자가 없으면 경고하지 않는다.
  await reset();
  await addCard("c", { level: "c1" });
  await addUser({ excludedLevels: ["c1"] });
  const c1 = (await cardStock(db)).find((r) => r.level === "c1")!;
  assert.equal(c1.minRemaining, null);
  assert.equal(c1.warn, false);
});
