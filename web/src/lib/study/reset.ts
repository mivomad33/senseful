// 학습 기록 초기화(npm run db:reset-progress). 한 사용자의 복습 기록과 새 카드 더 학습 기록을 지우고 카드를 새 카드 상태로 되돌린다.
// 공용 카드 내용과 빼기 표시(관리자 빼기, 나만 빼기)는 그대로 둔다. 빼기는 학습 기록이 아니라 카드 내용에 대한 판단이어서다.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { createEmptyCard } from "ts-fsrs";
import type { Db } from "@/db";
import { reviewLogs, studyDays, userCards } from "@/db/schema";
import { fromFsrs } from "./schedule";

export interface ResetResult {
  deletedLogs: number;
  resetCards: number;
}

export async function resetProgress(db: Db, userId: number, now = new Date()): Promise<ResetResult> {
  return db.transaction(async (tx) => {
    const logs = await tx.delete(reviewLogs).where(eq(reviewLogs.userId, userId)).returning({ id: reviewLogs.id });
    await tx.delete(studyDays).where(eq(studyDays.userId, userId));
    // 상태 행이 없으면 새 카드다. 나만 빼기 표시가 있는 행만 남기고 새 카드 상태로 되돌린다.
    const removed = await tx
      .delete(userCards)
      .where(and(eq(userCards.userId, userId), isNull(userCards.excludedAt)))
      .returning({ cardId: userCards.cardId });
    const kept = await tx
      .update(userCards)
      .set(fromFsrs(createEmptyCard(now)))
      .where(and(eq(userCards.userId, userId), isNotNull(userCards.excludedAt)))
      .returning({ cardId: userCards.cardId });
    return { deletedLogs: logs.length, resetCards: removed.length + kept.length };
  });
}
