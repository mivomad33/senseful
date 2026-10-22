"use server";

import { and, count, gte, lt } from "drizzle-orm";
import { config } from "@/config";
import { db } from "@/db";
import { reviewLogs } from "@/db/schema";
import { claudeGrade } from "@/lib/grade/claude";
import { excludeCard, restoreCard, updateCard, type CardContent } from "@/lib/cards/edit";
import { gradeAndRecord } from "@/lib/grade/review";
import { addExtraNew, correctReview, dayRange, nextCard, todayCounts, type TodayCounts } from "@/lib/study/schedule";

/** 오늘 남은 수와, 진행 표시에 쓸 오늘 답한 수(같은 카드를 다시 본 것도 센다) */
export type Counts = TodayCounts & { done: number };

/** 학습 화면에 보낼 다음 카드. 답하기 전에는 예문만 보낸다. */
export type StudyView =
  | { status: "card"; cardId: number; exampleEn: string; kind: "learning" | "review" | "new"; level: string; counts: Counts }
  | { status: "waiting"; until: number; counts: Counts }
  | { status: "done"; counts: Counts };

/** ahead: 기다리지 않고 바로 보기(다시 볼 카드를 시각 전에 낸다) */
export async function getNext(ahead = false): Promise<StudyView> {
  const now = new Date();
  const n = nextCard(db, now, config, Math.random, ahead);
  const { start, end } = dayRange(now, config.dayStartHour);
  const [{ done }] = db
    .select({ done: count() })
    .from(reviewLogs)
    .where(and(gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end)))
    .all();
  const counts = { ...todayCounts(db, now), done };
  if (n.status === "done") return { status: "done", counts };
  if (n.status === "waiting") return { status: "waiting", until: n.until.getTime(), counts };
  return { status: "card", cardId: n.next.card.id, exampleEn: n.next.card.exampleEn, kind: n.next.kind, level: n.next.item.cefr, counts };
}

/** 새 카드 더 학습: 오늘 새 카드 상한을 늘린다. 늘린 장수를 돌려준다. */
export async function studyMoreNew(): Promise<number> {
  return addExtraNew(db);
}

export interface Graded {
  cardId: number;
  logId: number;
  isCorrect: boolean;
  /** Claude 원래 판정. 정정해도 바뀌지 않는다. */
  graderIsCorrect: boolean;
  reason: string;
  answer: string;
  headword: string;
  senseKo: string;
  exampleEn: string;
  exampleKo: string;
  due: number;
}

export type SubmitState = { ok: true; graded: Graded } | { ok: false; error: string };

export async function submitAnswer(cardId: number, answer: string): Promise<SubmitState> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY가 없다(web/.env.local)" };
  try {
    const r = await gradeAndRecord(db, claudeGrade, cardId, answer);
    return { ok: true, graded: { ...r, cardId, graderIsCorrect: r.isCorrect, due: r.due.getTime() } };
  } catch (e) {
    console.error(`[판정] 카드 ${cardId} 실패:`, e);
    return { ok: false, error: `판정 실패: ${(e as Error).message}` };
  }
}

export async function correctGrade(logId: number, isCorrect: boolean): Promise<{ isCorrect: boolean; due: number }> {
  const r = correctReview(db, logId, isCorrect);
  return { isCorrect, due: r.due.getTime() };
}

export type EditState = { ok: true; content: CardContent } | { ok: false; error: string };

/** 카드 수정(개요 문서 5.5). 판정 후 화면에서 연다. */
export async function editCard(cardId: number, content: CardContent): Promise<EditState> {
  try {
    return { ok: true, content: updateCard(db, cardId, content) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 카드 빼기(개요 문서 5.5). 지우지 않고 표시만 한다. */
export async function removeCard(cardId: number): Promise<void> {
  excludeCard(db, cardId);
}

/** 빼기 취소. 뺀 직후 판정 후 화면에서만 연다. */
export async function unremoveCard(cardId: number): Promise<void> {
  restoreCard(db, cardId);
}
