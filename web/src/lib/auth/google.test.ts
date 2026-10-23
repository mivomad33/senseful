// 구글 로그인 직접 구현 단위 테스트(문서 4.1-2, 4.1-3): 인증 주소, PKCE, 토큰 교환, id_token 확인.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, mock, test } from "node:test";
import { authorizationUrl, codeChallenge, exchangeCode, generateCodeVerifier, generateState, GoogleAuthError, readIdToken } from "./google";

// 클라이언트 값은 부를 때 읽으므로 import 뒤에 정해도 된다.
process.env.GOOGLE_CLIENT_ID = "client-123";
process.env.GOOGLE_CLIENT_SECRET = "secret-456";

const NOW = new Date("2026-10-23T12:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (claims: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
const good = { iss: "https://accounts.google.com", aud: "client-123", exp: sec(NOW) + 3600, sub: "g-1", email: "a@test.local", email_verified: true };

afterEach(() => mock.restoreAll());

test("인증 주소에 필요한 값이 모두 있고 code_challenge는 검증값의 S256이다", () => {
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = authorizationUrl(state, verifier);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const p = url.searchParams;
  assert.equal(p.get("client_id"), "client-123");
  assert.equal(p.get("redirect_uri"), "https://senseful.vercel.app/api/auth/callback/google");
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("scope"), "openid email profile");
  assert.equal(p.get("state"), state);
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(codeChallenge(verifier), p.get("code_challenge"));
});

test("state와 검증값은 매번 다른 43자 base64url이다", () => {
  const a = generateState();
  const b = generateState();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.match(generateCodeVerifier(), /^[A-Za-z0-9_-]{43}$/);
});

test("토큰 교환은 Basic 인증과 PKCE 검증값을 보내고 id_token을 돌려준다", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ id_token: "x.y.z", access_token: "at" }));
  assert.equal(await exchangeCode("code-1", "ver-1"), "x.y.z");
  const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal((init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("client-123:secret-456").toString("base64")}`);
  const body = new URLSearchParams(String(init.body));
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code-1");
  assert.equal(body.get("code_verifier"), "ver-1");
  assert.equal(body.get("redirect_uri"), "https://senseful.vercel.app/api/auth/callback/google");
});

test("토큰 요청이 실패하거나 id_token이 없으면 오류다", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
  await assert.rejects(exchangeCode("c", "v"), GoogleAuthError);
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => Response.json({ access_token: "at" }));
  await assert.rejects(exchangeCode("c", "v"), GoogleAuthError);
});

test("id_token: 두 형태의 Google 발급자를 받고 계정 정보를 돌려준다", () => {
  assert.equal(readIdToken(token(good), NOW).sub, "g-1");
  assert.equal(readIdToken(token({ ...good, iss: "accounts.google.com" }), NOW).email, "a@test.local");
  assert.equal(readIdToken(token({ ...good, aud: ["other", "client-123"] }), NOW).sub, "g-1");
});

test("id_token: 발급자·대상이 다르거나 만료됐거나 형식이 틀리면 거절한다", () => {
  const bad = [
    token({ ...good, iss: "https://evil.example" }),
    token({ ...good, aud: "other-client" }),
    token({ ...good, exp: sec(NOW) - 1 }),
    token({ ...good, exp: undefined }),
    token({ ...good, sub: undefined }),
    "not-a-jwt",
    "a.%%%.c",
  ];
  for (const t of bad) assert.throws(() => readIdToken(t, NOW), GoogleAuthError, t);
});
