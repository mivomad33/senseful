// 카드 한 장 학습의 판정(개요 문서 5.4). 답안을 판정하고 결과를 그 사용자의 학습 일정에 기록한다.
import { eq } from "drizzle-orm";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, items } from "@/db/schema";
import { dayKey } from "@/lib/day";
import { recordReview, StudyError, type ReviewResult } from "@/lib/study/schedule";
import type { Grader } from "./claude";
import { sameAsModel } from "./normalize";
import { releaseGrade, reserveGrade } from "./quota";

export type GradeResult = ReviewResult & { isCorrect: boolean; reason: string; answer: string; headword: string; senseKo: string; exampleEn: string; exampleKo: string };
export type GradeOutcome = ({ status: "graded" } & GradeResult) | { status: "limit"; scope: "user" | "total" };

export interface Grading {
  userId: number;
  /** 관리자는 판정 한도에서 빠지고 전체 횟수에도 넣지 않는다 */
  isAdmin: boolean;
}

export interface GradeLimits {
  perUser: number;
  total: number;
  dayStartHour: number;
}

const defaultLimits: GradeLimits = { perUser: config.gradeLimitPerUser, total: config.gradeLimitTotal, dayStartHour: config.dayStartHour };

/**
 * 답안을 판정하고 기록한다. 판정 호출이 실패하면 기록하지 않고 예외를 그대로 던진다(카드는 그대로 남아 다시 풀 수 있다).
 * - 빈 답안은 판정 기준상 항상 틀림이므로 API를 부르지 않는다.
 * - 저장된 예문 번역과 같은 답은 API를 부르지 않고 맞음이다. 한도 횟수에 넣지 않는다.
 * - 그 밖에는 한도를 확인하고 API로 판정한다. 한도에 걸리면 판정하지 않고 상태도 바꾸지 않는다.
 */
export async function gradeAndRecord(
  db: Db,
  grade: Grader,
  who: Grading,
  cardId: number,
  answer: string,
  now = new Date(),
  limits: GradeLimits = defaultLimits,
): Promise<GradeOutcome> {
  if (answer.length > config.answerMaxLength) throw new StudyError(`답안은 ${config.answerMaxLength}자까지 쓸 수 있습니다.`);
  const [row] = await db.select({ card: cards, item: items }).from(cards).innerJoin(items, eq(items.id, cards.itemId)).where(eq(cards.id, cardId));
  if (!row) throw new StudyError("카드가 없습니다.");
  if (row.card.excludedAt) throw new StudyError("뺀 카드입니다.");
  const trimmed = answer.trim();
  const content = { headword: row.item.headword, senseKo: row.card.senseKo, exampleEn: row.card.exampleEn, exampleKo: row.card.exampleKo };

  let g: { is_correct: boolean; reason: string };
  let gradedBy: "claude" | "exact" | "empty";
  if (!trimmed) {
    g = { is_correct: false, reason: "답안이 비어 있습니다." };
    gradedBy = "empty";
  } else if (sameAsModel(trimmed, row.card.exampleKo)) {
    g = { is_correct: true, reason: "정답 번역과 같습니다." };
    gradedBy = "exact";
  } else {
    const day = dayKey(now, limits.dayStartHour);
    if (!who.isAdmin) {
      const q = await reserveGrade(db, who.userId, day, limits);
      if (q !== "ok") return { status: "limit", scope: q };
    }
    try {
      g = await grade({ ...content, answer: trimmed });
    } catch (e) {
      if (!who.isAdmin) await releaseGrade(db, who.userId, day);
      throw e;
    }
    gradedBy = "claude";
  }
  const r = await recordReview(db, who.userId, { cardId, userAnswer: trimmed, graderIsCorrect: g.is_correct, graderReason: g.reason, gradedBy }, now);
  return { status: "graded", ...r, isCorrect: g.is_correct, reason: g.reason, answer: trimmed, ...content };
}
