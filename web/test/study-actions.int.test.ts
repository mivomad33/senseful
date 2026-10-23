// 학습 서버 동작이 거절을 예외가 아니라 화면이 안내로 보여 줄 결과로 돌려주는지(문서 4.2-1~4.2-3). 쿠키는 가짜로 바꿔 끼운다.
// 판정 함수는 부르지 않는 경우만 본다(키는 가짜 값이라 부르면 실패한다). 판정이 접수되는 경우는 src/lib/grade/review.int.test.ts가 본다.
import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import { gradeUsage, reviewLogs } from "@/db/schema";
import { recordReview } from "@/lib/study/schedule";
import { addCard, addUser, db, reset } from "./helpers";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ANTHROPIC_API_KEY = "not-a-real-key";

let token: string | undefined;
const jar = {
  get: (name: string) => (name === "senseful_session" && token ? { name, value: token } : undefined),
  has: (name: string) => name === "senseful_session" && !!token,
  set: () => {},
  delete: () => {},
};
mock.module("next/headers", { exports: { cookies: async () => jar, headers: async () => new Headers() } });
mock.module("next/navigation", {
  namedExports: {
    redirect: (to: string) => {
      throw new Error(`REDIRECT ${to}`);
    },
  },
});
mock.module("next/cache", { exports: { refresh: () => {} } });
mock.module("next/server", { exports: { connection: async () => {} } });

let study: typeof import("../src/app/(app)/study/actions");

before(async () => {
  study = await import("../src/app/(app)/study/actions");
});

beforeEach(async () => {
  await reset();
  token = undefined;
});

async function login() {
  const { createSession } = await import("../src/lib/auth/session");
  const u = await addUser({ email: "learner@test.local" });
  token = (await createSession(db, u.id)).token;
  return u;
}

test("오늘 대기열 밖 카드 제출은 outside 결과로 돌아오고 아무것도 남기지 않는다", async () => {
  const u = await login();
  const later = await addCard("later", { review: { userId: u.id, due: new Date(Date.now() + 3 * 86_400_000) } });
  assert.deepEqual(await study.submitAnswer(later, "답"), { ok: false, outside: true });
  assert.deepEqual(await study.submitAnswer(999_999, "답"), { ok: false, outside: true });
  assert.equal((await db.select().from(reviewLogs)).length, 0);
  assert.equal((await db.select().from(gradeUsage)).length, 0);
});

test("지난 기록의 정정은 예외 대신 안내할 오류 결과로 돌아오고, 오늘 기록은 정정된다", async () => {
  const u = await login();
  const old = await addCard("old");
  const past = await recordReview(db, u.id, { cardId: old, userAnswer: "답", graderIsCorrect: false }, new Date(Date.now() - 2 * 86_400_000));
  const r = await study.correctGrade(past.logId, true);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /정정할 수 없습니다/);

  const today = await addCard("today");
  const now = await recordReview(db, u.id, { cardId: today, userAnswer: "답", graderIsCorrect: false });
  const fixed = await study.correctGrade(now.logId, true);
  assert.equal(fixed.ok, true);
  assert.equal((fixed as { isCorrect: boolean }).isCorrect, true);
});
