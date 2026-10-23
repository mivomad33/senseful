// 구글 로그인 경로 통합 테스트(문서 4.1-2, 4.1-3, 4.1-4). 시작 경로가 만든 쿠키로 콜백을 부르고, 구글 토큰 요청은 가짜로 바꾼다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, before, beforeEach, mock, test } from "node:test";
import { sessions, users } from "@/db/schema";
import { db, reset } from "./helpers";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.GOOGLE_CLIENT_ID = "client-123";
process.env.GOOGLE_CLIENT_SECRET = "secret-456";

let store = new Map<string, string>();
const jar = {
  get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
  set: (name: string, value: string) => void store.set(name, value),
  delete: (name: string) => void store.delete(name),
};
mock.module("next/headers", { exports: { cookies: async () => jar, headers: async () => new Headers() } });

type Route = { GET: (r?: Request) => Promise<Response> };
let login: Route;
let callback: Route;

before(async () => {
  login = (await import("../src/app/api/auth/login/route")) as Route;
  callback = (await import("../src/app/api/auth/callback/google/route")) as Route;
});

beforeEach(async () => {
  await reset();
  store = new Map();
});
afterEach(() => mock.restoreAll());

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "client-123",
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: "google-sub-1",
  email: "learner@test.local",
  email_verified: true,
  name: "학습자",
  ...over,
});

/** 구글 토큰 엔드포인트를 가짜로 바꾼다. 받은 요청은 돌려준 mock의 calls로 본다. */
function fakeToken(res: () => Response) {
  return mock.method(globalThis, "fetch", async () => res());
}

/** 로그인 시작 → 구글이 돌려보낸 것처럼 콜백을 부른다 */
async function roundTrip(opts: { state?: string } = {}) {
  const start = await login.GET();
  const to = new URL(start.headers.get("location")!);
  const state = opts.state ?? to.searchParams.get("state")!;
  const res = await callback.GET(new Request(`https://senseful.vercel.app/api/auth/callback/google?code=code-1&state=${state}`));
  return { start, to, res };
}

const sessionCount = async () => (await db.select().from(sessions)).length;

test("시작 경로는 구글로 보내고 state·검증값 쿠키를 둔다. 주소의 code_challenge는 쿠키 검증값의 S256이다", async () => {
  const start = await login.GET();
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get("location")!);
  assert.equal(to.host, "accounts.google.com");
  for (const k of ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method"]) assert.ok(to.searchParams.get(k), k);
  assert.equal(to.searchParams.get("state"), store.get("senseful_oauth_state"));
  const verifier = store.get("senseful_oauth_verifier")!;
  assert.equal(to.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
});

test("성공하면 세션 쿠키를 두고 /home으로 간다. 토큰 요청에는 쿠키의 검증값을 보낸다", async () => {
  const f = fakeToken(() => Response.json({ id_token: idToken(claims()) }));
  const start = await login.GET();
  const verifier = store.get("senseful_oauth_verifier");
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const res = await callback.GET(new Request(`https://senseful.vercel.app/api/auth/callback/google?code=code-1&state=${state}`));
  assert.equal(res.headers.get("location"), "https://senseful.vercel.app/home");
  assert.ok(store.get("senseful_session"));
  assert.equal(store.has("senseful_oauth_state"), false);
  assert.equal(await sessionCount(), 1);
  const body = new URLSearchParams(String((f.mock.calls[0].arguments[1] as RequestInit).body));
  assert.equal(body.get("code_verifier"), verifier);
});

test("같은 구글 계정(sub)은 같은 사용자로 로그인된다", async () => {
  fakeToken(() => Response.json({ id_token: idToken(claims()) }));
  await roundTrip();
  store = new Map();
  await roundTrip();
  assert.equal((await db.select().from(users)).length, 1);
  assert.equal(await sessionCount(), 2);
});

const failures: [string, () => Promise<Response>][] = [
  [
    "state가 다르면",
    async () => {
      fakeToken(() => Response.json({ id_token: idToken(claims()) }));
      return (await roundTrip({ state: "other" })).res;
    },
  ],
  [
    "쿠키가 없으면",
    async () => {
      fakeToken(() => Response.json({ id_token: idToken(claims()) }));
      await login.GET();
      store = new Map();
      return callback.GET(new Request("https://senseful.vercel.app/api/auth/callback/google?code=c&state=s"));
    },
  ],
  ["토큰 요청이 실패하면", async () => (fakeToken(() => Response.json({ error: "invalid_grant" }, { status: 400 })), (await roundTrip()).res)],
  ["발급자가 다르면", async () => (fakeToken(() => Response.json({ id_token: idToken(claims({ iss: "https://evil.example" })) })), (await roundTrip()).res)],
  ["대상이 다르면", async () => (fakeToken(() => Response.json({ id_token: idToken(claims({ aud: "other" })) })), (await roundTrip()).res)],
  ["만료됐으면", async () => (fakeToken(() => Response.json({ id_token: idToken(claims({ exp: 1 })) })), (await roundTrip()).res)],
];

for (const [name, run] of failures) {
  test(`${name} /?error=login으로 가고 세션이 생기지 않는다`, async () => {
    const res = await run();
    assert.equal(res.headers.get("location"), "https://senseful.vercel.app/?error=login");
    assert.equal(store.has("senseful_session"), false);
    assert.equal(await sessionCount(), 0);
  });
}
