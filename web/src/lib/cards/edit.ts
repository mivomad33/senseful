// 카드 수정·빼기(docs/project_overview.md 5.5)와 사용자의 오류 신고·나만 빼기.
// 공용 카드 내용을 고치거나 모두에게서 빼는 것은 관리자만 한다(권한 확인은 서버 동작에서 한다).
import { and, eq, sql } from "drizzle-orm";
import { createEmptyCard } from "ts-fsrs";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, reports, userCards } from "@/db/schema";
import { fromFsrs, StudyError } from "@/lib/study/schedule";

export interface CardContent {
  senseKo: string;
  exampleEn: string;
  exampleKo: string;
}

/** 카드 내용을 고친다. 앞뒤 공백을 지우고, 빈 칸이 있으면 고치지 않는다. 학습 상태는 그대로 둔다. */
export async function updateCard(db: Db, cardId: number, input: CardContent, now = new Date()): Promise<CardContent> {
  const content = { senseKo: input.senseKo.trim(), exampleEn: input.exampleEn.trim(), exampleKo: input.exampleKo.trim() };
  if (!content.senseKo || !content.exampleEn || !content.exampleKo) throw new StudyError("뜻, 예문, 예문 번역은 비울 수 없습니다.");
  const r = await db
    .update(cards)
    .set({ ...content, updatedAt: now })
    .where(eq(cards.id, cardId))
    .returning({ id: cards.id });
  if (r.length === 0) throw new StudyError("카드가 없습니다.");
  return content;
}

/** 공용 카드를 모두에게서 뺀다(관리자). 지우지 않고 표시만 해, 아무에게도 나오지 않고 그 항목이 다시 생성 대상이 되지 않게 한다. */
export async function excludeCard(db: Db, cardId: number, now = new Date()): Promise<void> {
  const r = await db.update(cards).set({ excludedAt: now, updatedAt: now }).where(eq(cards.id, cardId)).returning({ id: cards.id });
  if (r.length === 0) throw new StudyError("카드가 없습니다.");
}

/** 관리자 빼기를 취소한다. 학습 상태는 뺄 때 그대로 두었으므로 이어서 학습한다. */
export async function restoreCard(db: Db, cardId: number, now = new Date()): Promise<void> {
  const r = await db.update(cards).set({ excludedAt: null, updatedAt: now }).where(eq(cards.id, cardId)).returning({ id: cards.id });
  if (r.length === 0) throw new StudyError("카드가 없습니다.");
}

/** 나만 빼기. 그 사용자에게만 다시 나오지 않는다. 학습한 적이 없으면 새 카드 상태로 행을 만든다. */
export async function excludeForUser(db: Db, userId: number, cardId: number, now = new Date()): Promise<void> {
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId));
  if (!card) throw new StudyError("카드가 없습니다.");
  await db
    .insert(userCards)
    .values({ userId, cardId, excludedAt: now, ...fromFsrs(createEmptyCard(now)) })
    .onConflictDoUpdate({ target: [userCards.userId, userCards.cardId], set: { excludedAt: now } });
}

/** 나만 빼기 취소. 학습한 적이 없던 카드는 다시 새 카드가 되도록 행을 지운다. */
export async function restoreForUser(db: Db, userId: number, cardId: number): Promise<void> {
  const where = and(eq(userCards.userId, userId), eq(userCards.cardId, cardId));
  await db.delete(userCards).where(and(where, eq(userCards.reps, 0), sql`${userCards.lastReview} is null`));
  await db.update(userCards).set({ excludedAt: null }).where(where);
}

/** 오류 신고. 설명은 선택이고 reportMaxLength자까지 받는다. */
export async function reportCard(db: Db, userId: number, cardId: number, note: string): Promise<void> {
  const text = note.trim();
  if (text.length > config.reportMaxLength) throw new StudyError(`신고 내용은 ${config.reportMaxLength}자까지 쓸 수 있습니다.`);
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId));
  if (!card) throw new StudyError("카드가 없습니다.");
  await db.insert(reports).values({ userId, cardId, note: text || null });
}

/** 신고 처리 완료 표시(관리자) */
export async function resolveReport(db: Db, reportId: number, now = new Date()): Promise<void> {
  await db.update(reports).set({ resolvedAt: now }).where(eq(reports.id, reportId));
}
