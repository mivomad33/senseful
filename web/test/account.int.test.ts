// 계정 통합 테스트: 구글 로그인으로 계정 만들기·관리자 계정 연결(4.1-1, 4.6-3), 세션, 탈퇴(4.1-6).
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { cards, gradeUsage, gradeUsageTotal, reports, reviewLogs, sessions, studyDays, userCards, users } from "@/db/schema";
import { createSession, validateSession } from "@/lib/auth/session";
import { findOrCreateGoogleUser } from "@/lib/auth/users";
import { excludeForUser, reportCard } from "@/lib/cards/edit";
import { reserveGrade } from "@/lib/grade/quota";
import { deleteAccount } from "@/lib/settings";
import { recordReview } from "@/lib/study/schedule";
import { addCard, addUser, db, reset, T0 } from "./helpers";

process.env.ADMIN_EMAIL = "Admin@Test.local";
beforeEach(reset);

const profile = (sub: string, email: string) => ({ sub, email, emailVerified: true, name: "이름", picture: "https://example.com/p.png" });

test("처음 구글 로그인하면 계정이 만들어지고, 다음 로그인은 같은 계정이다", async () => {
  const a = await findOrCreateGoogleUser(db, profile("g-1", "New@Example.com"));
  assert.equal(a.email, "new@example.com");
  assert.equal(a.newPerDay, 10);
  const again = await findOrCreateGoogleUser(db, { ...profile("g-1", "new@example.com"), name: "바뀐 이름" });
  assert.equal(again.id, a.id);
  assert.equal(again.name, "바뀐 이름");
  assert.equal((await db.select().from(users)).length, 1);
  await assert.rejects(findOrCreateGoogleUser(db, { ...profile("g-2", "x@example.com"), emailVerified: false }), /확인되지 않은/);
});

test("미리 만든 관리자 계정에 같은 이메일의 구글 프로필로 처음 로그인하면 새 계정이 생기지 않고 연결된다(4.6-3)", async () => {
  const [pre] = await db.insert(users).values({ email: "admin@test.local", newPerDay: 20 }).returning();
  const u = await findOrCreateGoogleUser(db, profile("g-admin", "admin@test.local"));
  assert.equal(u.id, pre.id);
  assert.equal(u.googleSub, "g-admin");
  assert.equal(u.newPerDay, 20);
  assert.equal((await db.select().from(users)).length, 1);
  // 관리자가 아닌 이메일은 미리 만든 계정에 연결하지 않는다.
  await db.insert(users).values({ email: "someone@test.local" });
  await assert.rejects(findOrCreateGoogleUser(db, profile("g-x", "someone@test.local")), /이미 다른 구글 계정/);
});

test("세션은 토큰으로 확인되고, 지우거나 만료되면 확인되지 않는다", async () => {
  const u = await addUser();
  const s = await createSession(db, u.id, T0);
  assert.equal((await validateSession(db, s.token, T0))?.user.id, u.id);
  assert.equal(await validateSession(db, "wrong", T0), null);
  assert.equal(await validateSession(db, s.token, new Date(T0.getTime() + 31 * 86_400_000)), null);
  // DB에는 토큰이 아니라 해시만 있다.
  assert.ok((await db.select().from(sessions)).every((r) => r.id !== s.token));
});

test("탈퇴하면 그 사용자 id로 남은 행이 없고, 공용 카드와 전체 판정 횟수는 그대로다(4.1-6)", async () => {
  const u = await addUser();
  const other = await addUser();
  const c1 = await addCard("a");
  const c2 = await addCard("b");
  await recordReview(db, u.id, { cardId: c1, userAnswer: "답", graderIsCorrect: true }, T0);
  await recordReview(db, other.id, { cardId: c1, userAnswer: "답", graderIsCorrect: true }, T0);
  await excludeForUser(db, u.id, c2);
  await reportCard(db, u.id, c1, "신고");
  await db.insert(studyDays).values({ userId: u.id, day: "2026-10-17", extraNew: 10 });
  await reserveGrade(db, u.id, "2026-10-17", { perUser: 50, total: 300 });
  await createSession(db, u.id);

  await deleteAccount(db, u.id);
  for (const [name, t] of Object.entries({ sessions, userCards, reviewLogs, studyDays, reports, gradeUsage })) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.userId, u.id));
    assert.equal(n, 0, name);
  }
  assert.equal((await db.select().from(users).where(eq(users.id, u.id))).length, 0);
  assert.equal((await db.select().from(cards)).length, 2);
  assert.equal((await db.select().from(gradeUsageTotal))[0].count, 1);
  assert.equal((await db.select().from(reviewLogs)).length, 1); // 다른 사용자의 기록은 남는다
});
