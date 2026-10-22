// 통합 테스트 도우미. 실제 Postgres(Neon 테스트 브랜치, test/setup-db.ts가 준비)에서 돈다.
// 테스트마다 reset()으로 모든 테이블을 비우고 필요한 데이터만 넣는다.
import { after } from "node:test";
import { sql } from "drizzle-orm";
import { createEmptyCard, State } from "ts-fsrs";
import { openDb, type Db } from "@/db";
import { cards, items, userCards, users } from "@/db/schema";
import type { Level, StudyUser } from "@/lib/study/schedule";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL이 없습니다. npm run test:integration으로 실행합니다");
const opened = openDb(url, 10);
export const db: Db = opened.db;
export const pool = opened.pool;
after(() => pool.end());

const TABLES = ["sessions", "reports", "grade_usage", "grade_usage_total", "review_logs", "study_days", "user_cards", "cards", "items", "users"];

export async function reset(): Promise<void> {
  await db.execute(sql.raw(`truncate ${TABLES.join(", ")} restart identity cascade`));
  seq = 0;
}

export const min = (n: number) => n * 60_000;
export const day = (n: number) => n * 86_400_000;
export const at = (base: Date, ms: number) => new Date(base.getTime() + ms);
/** 한국 시간 2026-10-17 10:00 */
export const T0 = new Date("2026-10-17T10:00:00+09:00");

let seq = 0;

export async function addUser(opts: Partial<{ email: string; newPerDay: number; excludedLevels: Level[] }> = {}): Promise<StudyUser & { email: string }> {
  const n = ++seq;
  const [u] = await db
    .insert(users)
    .values({ email: opts.email ?? `user${n}@test.local`, newPerDay: opts.newPerDay ?? 3, excludedLevels: opts.excludedLevels ?? [] })
    .returning();
  return { id: u.id, email: u.email, newPerDay: u.newPerDay, excludedLevels: u.excludedLevels };
}

let itemSeq = 0;

/** 학습 항목만(카드 없이) 만든다. */
export async function addItem(headword: string, level: Level = "a1"): Promise<number> {
  const id = 1000 + ++itemSeq;
  await db.insert(items).values({ id, kind: "word", headword, cefr: level });
  return id;
}

/**
 * 표제어 headword의 공용 카드를 만든다. review를 주면 그 사용자의 그 예정일 복습 카드로 만든다.
 */
export async function addCard(headword: string, opts: { level?: Level; review?: { userId: number; due: Date }; exampleKo?: string } = {}): Promise<number> {
  const itemId = await addItem(headword, opts.level);
  const [card] = await db
    .insert(cards)
    .values({ itemId, senseKo: "뜻", exampleEn: `Example ${headword}.`, exampleKo: opts.exampleKo ?? "예문." })
    .returning();
  if (opts.review) {
    const e = createEmptyCard(at(opts.review.due, -day(10)));
    await db.insert(userCards).values({
      userId: opts.review.userId,
      cardId: card.id,
      due: opts.review.due,
      stability: 10,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 10,
      learningSteps: 0,
      reps: 3,
      lapses: e.lapses,
      state: State.Review,
      lastReview: at(opts.review.due, -day(10)),
    });
  }
  return card.id;
}

export const ids = (q: { card: { id: number } }[]) => q.map((c) => c.card.id).sort((a, b) => a - b);
