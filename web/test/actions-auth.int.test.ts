// 서버 동작 권한 테스트(문서 4.1-2, 4.1-4). 서버 동작은 주소로 직접 부를 수 있으므로, 화면을 거치지 않고 모든 서버 동작을 직접 불러
// 로그인하지 않으면 거부되고, 관리자 동작은 일반 사용자에게 거부되는지 본다. next/headers의 쿠키는 가짜로 바꿔 끼운다.
import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import { addCard, addUser, db, reset } from "./helpers";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.SENSEFUL_FAKE_GRADER = "1";

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

type Actions = Record<string, (...a: unknown[]) => Promise<unknown>>;
let modules: { name: string; mod: Actions; admin: string[] }[];

before(async () => {
  modules = [
    { name: "app", mod: (await import("../src/app/(app)/actions")) as unknown as Actions, admin: [] },
    { name: "study", mod: (await import("../src/app/(app)/study/actions")) as unknown as Actions, admin: ["editCard", "removeCard", "unremoveCard"] },
    { name: "admin", mod: (await import("../src/app/(app)/admin/actions")) as unknown as Actions, admin: ["markResolved"] },
  ];
});

beforeEach(async () => {
  await reset();
  token = undefined;
});

const ARGS: Record<string, unknown[]> = {
  submitAnswer: [1, "답"],
  correctGrade: [1, true],
  editCard: [1, { senseKo: "a", exampleEn: "b", exampleKo: "c" }],
  updateSettings: [{ newPerDay: 5, excludedLevels: [] }],
  sendReport: [1, "x"],
};

async function login(email: string) {
  const { createSession } = await import("../src/lib/auth/session");
  const u = await addUser({ email });
  token = (await createSession(db, u.id)).token;
  return u;
}

test("로그인하지 않으면 모든 서버 동작이 거부된다(로그아웃은 소개 화면으로 보낼 뿐이다)", async () => {
  const card = await addCard("w");
  let checked = 0;
  for (const { mod } of modules) {
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function") continue;
      const args = (ARGS[name] ?? [card]).map((a) => (a === 1 ? card : a));
      if (name === "logout") {
        await assert.rejects(fn(...args), /REDIRECT \//);
        continue;
      }
      await assert.rejects(fn(...args), /로그인이 필요합니다/, name);
      checked++;
    }
  }
  assert.ok(checked >= 14, `서버 동작 ${checked}개만 확인했습니다`);
});

test("관리자 서버 동작은 일반 사용자에게 거부되고, 관리자에게는 된다", async () => {
  const card = await addCard("w");
  await login("user@test.local");
  for (const { mod, admin } of modules) {
    for (const name of admin) {
      const args = (ARGS[name] ?? [card]).map((a) => (a === 1 ? card : a));
      await assert.rejects(mod[name](...args), /관리자만/, name);
    }
  }
  // 일반 사용자 동작은 된다.
  const study = modules[1].mod;
  const view = (await study.getNext()) as { status: string };
  assert.equal(view.status, "card");

  await reset();
  const c2 = await addCard("w2");
  await login("admin@test.local");
  const r = (await study.editCard(c2, { senseKo: "고친 뜻", exampleEn: "Fixed.", exampleKo: "고친 번역." })) as { ok: boolean };
  assert.equal(r.ok, true);
  await study.removeCard(c2);
  await study.unremoveCard(c2);
});
