// 관리자 화면(문서 4.5-4)의 집계: 가입자 수, 오늘 판정 횟수, 신고 목록, 레벨별 카드 재고.
// 쿼리 수가 사용자 수에 따라 늘지 않게 묶어서 센다.
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, gradeUsage, gradeUsageTotal, items, reports, userCards, users } from "@/db/schema";
import { dayKey } from "@/lib/day";
import { LEVELS, type Level } from "@/lib/study/schedule";

export async function userCount(db: Db): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return n;
}

export interface GradeCounts {
  total: number;
  byUser: { email: string; name: string | null; count: number }[];
}

/** 오늘 판정(API) 횟수. 관리자의 판정은 한도와 횟수에 넣지 않으므로 여기에도 없다. */
export async function todayGradeCounts(db: Db, now = new Date()): Promise<GradeCounts> {
  const day = dayKey(now, config.dayStartHour);
  const [total, byUser] = await Promise.all([
    db.select({ n: gradeUsageTotal.count }).from(gradeUsageTotal).where(eq(gradeUsageTotal.day, day)),
    db
      .select({ email: users.email, name: users.name, count: gradeUsage.count })
      .from(gradeUsage)
      .innerJoin(users, eq(users.id, gradeUsage.userId))
      .where(and(eq(gradeUsage.day, day), sql`${gradeUsage.count} > 0`))
      .orderBy(desc(gradeUsage.count)),
  ]);
  return { total: total[0]?.n ?? 0, byUser };
}

export interface ReportRow {
  id: number;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  reporter: string;
  card: { id: number; headword: string; level: string; senseKo: string; exampleEn: string; exampleKo: string; excluded: boolean };
}

/** 신고 목록. 처리하지 않은 것부터, 최근 것부터 */
export async function reportList(db: Db, limit = 100): Promise<ReportRow[]> {
  const rows = await db
    .select({ r: reports, email: users.email, card: cards, headword: items.headword, level: items.cefr })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.userId))
    .innerJoin(cards, eq(cards.id, reports.cardId))
    .innerJoin(items, eq(items.id, cards.itemId))
    .orderBy(sql`${reports.resolvedAt} is not null`, desc(reports.createdAt))
    .limit(limit);
  return rows.map(({ r, email, card, headword, level }) => ({
    id: r.id,
    note: r.note,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    reporter: email,
    card: { id: card.id, headword, level, senseKo: card.senseKo, exampleEn: card.exampleEn, exampleKo: card.exampleKo, excluded: card.excludedAt !== null },
  }));
}

export interface StockRow {
  level: Level;
  /** 전체 학습 항목 */
  items: number;
  /** 만든 카드(관리자가 뺀 카드 포함) */
  cards: number;
  /** 관리자가 뺀 카드 */
  excluded: number;
  /** 이 레벨을 제외하지 않은 사용자 중 이 레벨의 새 카드가 가장 적게 남은 사용자의 남은 수. 그런 사용자가 없으면 null */
  minRemaining: number | null;
  /** minRemaining이 경고 기준보다 적다 */
  warn: boolean;
}

export async function cardStock(db: Db): Promise<StockRow[]> {
  const [perLevel, consumed, people] = await Promise.all([
    db
      .select({
        level: items.cefr,
        items: sql<number>`count(*)::int`,
        cards: sql<number>`count(${cards.id})::int`,
        excluded: sql<number>`count(${cards.excludedAt})::int`,
      })
      .from(items)
      .leftJoin(cards, eq(cards.itemId, items.id))
      .groupBy(items.cefr),
    // 사용자·레벨마다 더는 새 카드가 아닌 카드(학습했거나 나만 뺀 카드) 수. 관리자가 뺀 카드는 셀 필요가 없다.
    db
      .select({ userId: userCards.userId, level: items.cefr, n: sql<number>`count(*)::int` })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .innerJoin(items, eq(items.id, cards.itemId))
      .where(isNull(cards.excludedAt))
      .groupBy(userCards.userId, items.cefr),
    db.select({ id: users.id, excludedLevels: users.excludedLevels }).from(users),
  ]);
  const used = new Map(consumed.map((c) => [`${c.userId}:${c.level}`, c.n]));
  return LEVELS.map((level) => {
    const p = perLevel.find((r) => r.level === level) ?? { items: 0, cards: 0, excluded: 0 };
    const live = p.cards - p.excluded;
    const remains = people.filter((u) => !u.excludedLevels.includes(level)).map((u) => live - (used.get(`${u.id}:${level}`) ?? 0));
    const minRemaining = remains.length ? Math.min(...remains) : null;
    return { level, items: p.items, cards: p.cards, excluded: p.excluded, minRemaining, warn: minRemaining !== null && minRemaining < config.stockWarnBelow };
  });
}

/** 재고가 모자란 레벨에 보여 줄 로컬 생성 명령 */
export const generateCommand = (level: Level, n = 200) => `npm run cards:generate -- ${n} --level ${level}`;
