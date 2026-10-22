// 학습 기록 초기화(npm run db:reset-progress). 복습 기록과 새 카드 더 학습 기록을 모두 지우고 카드를 새 카드 상태로 되돌린다.
// 카드 내용(고친 것 포함)과 빼기 표시는 그대로 둔다. 빼기는 학습 기록이 아니라 카드 내용에 대한 판단이어서다.
import { createEmptyCard } from "ts-fsrs";
import type { Db } from "@/db";
import { cards, reviewLogs, studyDays } from "@/db/schema";

export interface ResetResult {
  deletedLogs: number;
  resetCards: number;
}

export function resetProgress(db: Db, now = new Date()): ResetResult {
  const e = createEmptyCard(now);
  return db.transaction((tx) => {
    const deletedLogs = tx.delete(reviewLogs).run().changes;
    tx.delete(studyDays).run();
    const resetCards = tx
      .update(cards)
      .set({
        due: e.due,
        stability: e.stability,
        difficulty: e.difficulty,
        elapsedDays: e.elapsed_days,
        scheduledDays: e.scheduled_days,
        learningSteps: e.learning_steps,
        reps: e.reps,
        lapses: e.lapses,
        state: e.state,
        lastReview: null,
      })
      .run().changes;
    return { deletedLogs, resetCards };
  });
}
