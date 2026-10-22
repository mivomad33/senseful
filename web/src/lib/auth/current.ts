// 요청을 보낸 사용자. 화면과 서버 동작은 여기서 로그인과 권한을 확인한다.
// 요청마다 한 번만 DB를 보도록 React cache로 묶는다.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { StudyUser } from "@/lib/study/schedule";
import { SESSION_COOKIE, validateSession, type User } from "./session";
import { isAdmin } from "./users";

export type CurrentUser = User & { isAdmin: boolean };

export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await validateSession(db, token);
  return s ? { ...s.user, isAdmin: isAdmin(s.user) } : null;
});

/** 화면용. 로그인하지 않았으면 소개 화면으로 보낸다. 쿠키는 있는데 세션이 없으면 쿠키를 지우고 보낸다. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (u) return u;
  const stale = (await cookies()).has(SESSION_COOKIE);
  redirect(stale ? "/api/auth/clear" : "/");
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.isAdmin) redirect("/home");
  return u;
}

export class AuthError extends Error {}

/** 서버 동작용. 로그인하지 않았으면 예외를 던진다(서버 동작은 주소로 직접 부를 수 있어 동작마다 확인한다). */
export async function actionUser(): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new AuthError("로그인이 필요합니다.");
  return u;
}

export async function actionAdmin(): Promise<CurrentUser> {
  const u = await actionUser();
  if (!u.isAdmin) throw new AuthError("관리자만 할 수 있습니다.");
  return u;
}

export const studyUser = (u: CurrentUser): StudyUser => ({ id: u.id, newPerDay: u.newPerDay, excludedLevels: u.excludedLevels });
