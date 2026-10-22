// 카드 한 장 학습의 판정(개요 문서 5.4). 답안을 판정하고 결과를 학습 일정에 기록한다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cards, items } from "@/db/schema";
import { recordReview, type ReviewResult } from "@/lib/study/schedule";
import type { Grader } from "./claude";

export type GradeResult = ReviewResult & { isCorrect: boolean; reason: string; answer: string; headword: string; senseKo: string; exampleEn: string; exampleKo: string };

/**
 * 답안을 판정하고 기록한다. 판정 호출이 실패하면 기록하지 않고 예외를 그대로 던진다(카드는 그대로 남아 다시 풀 수 있다).
 * 빈 답안은 판정 기준상 항상 틀림이므로 API를 부르지 않는다.
 */
export async function gradeAndRecord(db: Db, grade: Grader, cardId: number, answer: string, now = new Date()): Promise<GradeResult> {
  const row = db.select({ card: cards, item: items }).from(cards).innerJoin(items, eq(items.id, cards.itemId)).where(eq(cards.id, cardId)).get();
  if (!row) throw new Error(`카드 ${cardId}가 없다`);
  const trimmed = answer.trim();
  const g = trimmed
    ? await grade({ headword: row.item.headword, senseKo: row.card.senseKo, exampleEn: row.card.exampleEn, exampleKo: row.card.exampleKo, answer: trimmed })
    : { is_correct: false, reason: "답안이 비었다." };
  const r = recordReview(db, { cardId, userAnswer: trimmed, graderIsCorrect: g.is_correct, graderReason: g.reason }, now);
  return { ...r, isCorrect: g.is_correct, reason: g.reason, answer: trimmed, headword: row.item.headword, senseKo: row.card.senseKo, exampleEn: row.card.exampleEn, exampleKo: row.card.exampleKo };
}
