// 구글 계정으로 사용자를 찾거나 만든다(문서 4.1-1, 4.6-3).
import { and, eq, isNull } from "drizzle-orm";
import { adminEmail, config } from "@/config";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import type { User } from "./session";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  picture?: string | null;
}

export class LoginError extends Error {}

export function isAdmin(user: Pick<User, "email">): boolean {
  const admin = adminEmail();
  return admin !== null && user.email.toLowerCase() === admin;
}

/**
 * 구글 계정 id(sub)로 사용자를 찾고, 없으면 처음 로그인한 것으로 보고 계정을 만든다.
 * 이전 때 관리자 이메일로 미리 만든 계정(구글 id 없음)은 같은 이메일로 처음 로그인하면 새로 만들지 않고 그 계정에 연결한다.
 * 같은 이메일 계정 연결은 관리자 이메일에만 허용한다.
 */
export async function findOrCreateGoogleUser(db: Db, p: GoogleProfile): Promise<User> {
  if (!p.emailVerified) throw new LoginError("이메일이 확인되지 않은 구글 계정입니다.");
  const email = p.email.trim().toLowerCase();
  const profile = { name: p.name ?? null, image: p.picture ?? null };
  const [bySub] = await db.update(users).set(profile).where(eq(users.googleSub, p.sub)).returning();
  if (bySub) return bySub;

  if (isAdmin({ email })) {
    const [linked] = await db
      .update(users)
      .set({ googleSub: p.sub, ...profile })
      .where(and(eq(users.email, email), isNull(users.googleSub)))
      .returning();
    if (linked) return linked;
  }

  const [created] = await db
    .insert(users)
    .values({ googleSub: p.sub, email, ...profile, newPerDay: config.newPerDayDefault })
    .onConflictDoNothing()
    .returning();
  if (!created) throw new LoginError("이미 다른 구글 계정과 연결된 이메일입니다.");
  return created;
}
