// 구글 로그인(OAuth 2.0 + PKCE). 콜백 경로는 Google에 등록한 /api/auth/callback/google이다.
import { Google } from "arctic";
import { isDev, SITE_URL } from "@/config";

/** 개발 서버는 Google에 등록한 http://localhost:3000, 그 밖에는 운영 주소로 돌아온다. */
export const ORIGIN = isDev ? "http://localhost:3000" : SITE_URL;
export const STATE_COOKIE = "senseful_oauth_state";
export const VERIFIER_COOKIE = "senseful_oauth_verifier";

export function google(): Google {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET이 없습니다");
  return new Google(id, secret, `${ORIGIN}/api/auth/callback/google`);
}
