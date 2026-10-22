// 카드 수정·빼기(docs/project_overview.md 5.5). 학습 화면과 떨어진 기능이고, MVP에서는 판정 후 화면에서만 연다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cards } from "@/db/schema";

export interface CardContent {
  senseKo: string;
  exampleEn: string;
  exampleKo: string;
}

/** 카드 내용을 고친다. 앞뒤 공백을 지우고, 빈 칸이 있으면 고치지 않는다. FSRS 상태는 그대로 둔다. */
export function updateCard(db: Db, cardId: number, input: CardContent, now = new Date()): CardContent {
  const content = { senseKo: input.senseKo.trim(), exampleEn: input.exampleEn.trim(), exampleKo: input.exampleKo.trim() };
  if (!content.senseKo || !content.exampleEn || !content.exampleKo) throw new Error("뜻, 예문, 예문 번역은 비울 수 없다");
  const r = db.update(cards).set({ ...content, updatedAt: now }).where(eq(cards.id, cardId)).run();
  if (r.changes === 0) throw new Error(`카드 ${cardId}가 없다`);
  return content;
}

/** 카드를 뺀다. 지우지 않고 표시만 해, 오늘의 학습에서 빠지고 그 항목이 다시 생성 대상이 되지 않게 한다. */
export function excludeCard(db: Db, cardId: number, now = new Date()): void {
  const r = db.update(cards).set({ excludedAt: now, updatedAt: now }).where(eq(cards.id, cardId)).run();
  if (r.changes === 0) throw new Error(`카드 ${cardId}가 없다`);
}

/** 빼기를 취소한다. 뺀 직후 판정 후 화면에서만 연다. 학습 일정은 뺄 때 그대로 두었으므로 이어서 학습한다. */
export function restoreCard(db: Db, cardId: number, now = new Date()): void {
  const r = db.update(cards).set({ excludedAt: null, updatedAt: now }).where(eq(cards.id, cardId)).run();
  if (r.changes === 0) throw new Error(`카드 ${cardId}가 없다`);
}
