// 판정(API) 하루 한도(문서 4.4-1). 사용자별 한도와 전체 한도를 한 트랜잭션에서 하나씩 올린다.
// 행 잠금과 조건부 증가로 동시에 요청해도 한도를 넘지 않는다. 관리자는 부르지 않는다(호출하는 쪽에서 뺀다).
import { and, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { gradeUsage, gradeUsageTotal } from "@/db/schema";

export type QuotaResult = "ok" | "user" | "total";

class TotalFull extends Error {}

/** 판정 1회를 예약한다. 한도에 걸리면 아무것도 올리지 않고 어느 한도인지 돌려준다. */
export async function reserveGrade(db: Db, userId: number, day: string, limits: { perUser: number; total: number }): Promise<QuotaResult> {
  if (limits.perUser <= 0) return "user";
  if (limits.total <= 0) return "total";
  try {
    return await db.transaction(async (tx) => {
      const user = await tx
        .insert(gradeUsage)
        .values({ userId, day, count: 1 })
        .onConflictDoUpdate({
          target: [gradeUsage.userId, gradeUsage.day],
          set: { count: sql`${gradeUsage.count} + 1` },
          setWhere: sql`${gradeUsage.count} < ${limits.perUser}`,
        })
        .returning({ count: gradeUsage.count });
      if (user.length === 0) return "user";
      const total = await tx
        .insert(gradeUsageTotal)
        .values({ day, count: 1 })
        .onConflictDoUpdate({
          target: gradeUsageTotal.day,
          set: { count: sql`${gradeUsageTotal.count} + 1` },
          setWhere: sql`${gradeUsageTotal.count} < ${limits.total}`,
        })
        .returning({ count: gradeUsageTotal.count });
      if (total.length === 0) throw new TotalFull(); // 사용자 횟수를 올린 것도 되돌린다
      return "ok";
    });
  } catch (e) {
    if (e instanceof TotalFull) return "total";
    throw e;
  }
}

/** 예약한 판정이 API 실패로 끝나면 돌려놓는다. */
export async function releaseGrade(db: Db, userId: number, day: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(gradeUsage)
      .set({ count: sql`${gradeUsage.count} - 1` })
      .where(and(eq(gradeUsage.userId, userId), eq(gradeUsage.day, day), gt(gradeUsage.count, 0)));
    await tx
      .update(gradeUsageTotal)
      .set({ count: sql`${gradeUsageTotal.count} - 1` })
      .where(and(eq(gradeUsageTotal.day, day), gt(gradeUsageTotal.count, 0)));
  });
}
