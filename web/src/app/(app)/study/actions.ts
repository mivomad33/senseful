"use server";

import { and, count, eq, gte, lt } from "drizzle-orm";
import { config } from "@/config";
import { db } from "@/db";
import { reviewLogs } from "@/db/schema";
import { actionAdmin, actionUser, studyUser } from "@/lib/auth/current";
import { excludeCard, excludeForUser, reportCard, restoreCard, restoreForUser, updateCard, type CardContent } from "@/lib/cards/edit";
import { dayRange } from "@/lib/day";
import { appGrader } from "@/lib/grade/grader";
import { gradeAndRecord } from "@/lib/grade/review";
import { addExtraNew, correctReview, countsOf, nextCard, StudyError, type TodayCounts } from "@/lib/study/schedule";

/** 오늘 남은 수와, 진행 표시에 쓸 오늘 답한 수(같은 카드를 다시 본 것도 센다) */
export type Counts = TodayCounts & { done: number };

/** 학습 화면에 보낼 다음 카드. 답하기 전에는 예문만 보낸다. */
export type StudyView =
  | { status: "card"; cardId: number; exampleEn: string; kind: "learning" | "review" | "new"; level: string; counts: Counts }
  | { status: "waiting"; until: number; counts: Counts }
  | { status: "done"; counts: Counts };

/** 사용자에게 보여 줄 수 있는 오류(입력 확인 등)는 그 문구를, 그 밖에는 일반 안내를 돌려준다. 로그에는 종류만 남긴다. */
function userError(e: unknown, where: string): string {
  if (e instanceof StudyError) return e.message;
  console.error(`[${where}] ${(e as Error)?.name ?? "오류"}`);
  return "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

/** ahead: 기다리지 않고 바로 보기(다시 볼 카드를 시각 전에 낸다) */
export async function getNext(ahead = false): Promise<StudyView> {
  const u = await actionUser();
  const now = new Date();
  const { start, end } = dayRange(now, config.dayStartHour);
  const [n, [{ done }]] = await Promise.all([
    nextCard(db, studyUser(u), now, config, Math.random, ahead),
    db
      .select({ done: count() })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, u.id), gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end))),
  ]);
  const counts = { ...countsOf(n.queue), done };
  if (n.status === "done") return { status: "done", counts };
  if (n.status === "waiting") return { status: "waiting", until: n.until.getTime(), counts };
  return { status: "card", cardId: n.next.card.id, exampleEn: n.next.card.exampleEn, kind: n.next.kind, level: n.next.item.cefr, counts };
}

/** 새 카드 더 학습: 오늘 새 카드 상한을 늘린다. 늘린 장수를 돌려준다. */
export async function studyMoreNew(): Promise<number> {
  const u = await actionUser();
  return addExtraNew(db, studyUser(u));
}

export interface Graded {
  cardId: number;
  logId: number;
  isCorrect: boolean;
  /** 원래 판정. 정정해도 바뀌지 않는다. */
  graderIsCorrect: boolean;
  reason: string;
  answer: string;
  headword: string;
  senseKo: string;
  exampleEn: string;
  exampleKo: string;
  due: number;
}

export type SubmitState =
  | { ok: true; graded: Graded }
  | { ok: false; error: string }
  | { ok: false; limit: "user" | "total"; perUser: number; dayStartHour: number };

export async function submitAnswer(cardId: number, answer: string): Promise<SubmitState> {
  const u = await actionUser();
  const grade = appGrader();
  if (!grade) return { ok: false, error: "판정 설정이 없어 판정할 수 없습니다(ANTHROPIC_API_KEY)." };
  try {
    const r = await gradeAndRecord(db, grade, { userId: u.id, isAdmin: u.isAdmin }, cardId, String(answer));
    if (r.status === "limit") return { ok: false, limit: r.scope, perUser: config.gradeLimitPerUser, dayStartHour: config.dayStartHour };
    return {
      ok: true,
      graded: { cardId, logId: r.logId, isCorrect: r.isCorrect, graderIsCorrect: r.isCorrect, reason: r.reason, answer: r.answer, headword: r.headword, senseKo: r.senseKo, exampleEn: r.exampleEn, exampleKo: r.exampleKo, due: r.due.getTime() },
    };
  } catch (e) {
    return { ok: false, error: `판정하지 못했습니다. ${userError(e, "판정")}` };
  }
}

export async function correctGrade(logId: number, isCorrect: boolean): Promise<{ isCorrect: boolean; due: number }> {
  const u = await actionUser();
  const r = await correctReview(db, u.id, logId, isCorrect);
  return { isCorrect, due: r.due.getTime() };
}

export type EditState = { ok: true; content: CardContent } | { ok: false; error: string };

/** 공용 카드 수정(관리자만). 판정 후 화면과 관리자 화면에서 연다. */
export async function editCard(cardId: number, content: CardContent): Promise<EditState> {
  await actionAdmin();
  try {
    return { ok: true, content: await updateCard(db, cardId, content) };
  } catch (e) {
    return { ok: false, error: userError(e, "카드 수정") };
  }
}

/** 공용 카드 빼기(관리자만). 모두에게서 빠진다. */
export async function removeCard(cardId: number): Promise<void> {
  await actionAdmin();
  await excludeCard(db, cardId);
}

/** 관리자 빼기 취소 */
export async function unremoveCard(cardId: number): Promise<void> {
  await actionAdmin();
  await restoreCard(db, cardId);
}

/** 나만 빼기. 그 사용자에게만 다시 나오지 않는다. */
export async function hideCard(cardId: number): Promise<void> {
  const u = await actionUser();
  await excludeForUser(db, u.id, cardId);
}

/** 나만 빼기 취소. 뺀 직후 판정 후 화면에서만 연다. */
export async function unhideCard(cardId: number): Promise<void> {
  const u = await actionUser();
  await restoreForUser(db, u.id, cardId);
}

export type ReportState = { ok: true } | { ok: false; error: string };

/** 오류 신고. 설명은 선택이다. */
export async function sendReport(cardId: number, note: string): Promise<ReportState> {
  const u = await actionUser();
  try {
    await reportCard(db, u.id, cardId, String(note ?? ""));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: userError(e, "신고") };
  }
}
