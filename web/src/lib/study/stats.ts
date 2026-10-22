// 홈 화면의 학습 기록, 레벨별 학습 현황, 복습 예정. 모두 사용자 기준이다.
import { and, asc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { State } from "ts-fsrs";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, items, reviewLogs, userCards } from "@/db/schema";
import { addDays, dayKey, dayRange } from "@/lib/day";
import { LEVELS, type Level, type StudyUser } from "./schedule";

export { LEVELS };
/** 다음 복습까지 이 일수 이상 남은 카드를 "익숙함"으로 센다(Anki의 mature 기준). */
export const MATURE_DAYS = 21;

export interface LevelStat {
  level: Level;
  /** 전체 학습 항목(카드가 아직 없는 항목 포함) */
  items: number;
  /** 공용 카드 중 관리자가 뺀 카드와 이 사용자가 뺀 카드를 제외한 수 */
  cards: number;
  /** 한 번이라도 학습한 카드 */
  studied: number;
  /** 다음 복습까지 MATURE_DAYS일 이상 남은 카드 */
  mature: number;
  /** 아직 처음 학습하지 않은 뜻(전체 뜻 − 학습함 − 뺀 카드). 카드를 만들었지만 학습하지 않은 것과 카드가 아직 없는 것도 포함한다 */
  remaining: number;
  /** 이 사용자가 새 카드를 받지 않기로 한 레벨 */
  excluded: boolean;
}

export async function levelStats(db: Db, user: Pick<StudyUser, "id" | "excludedLevels">): Promise<LevelStat[]> {
  const live = sql`${cards.id} is not null and ${cards.excludedAt} is null and ${userCards.excludedAt} is null`;
  const rows = await db
    .select({
      level: items.cefr,
      items: sql<number>`count(*)::int`,
      cards: sql<number>`count(*) filter (where ${live})::int`,
      studied: sql<number>`count(*) filter (where ${live} and ${userCards.state} <> ${State.New})::int`,
      mature: sql<number>`count(*) filter (where ${live} and ${userCards.state} = ${State.Review} and ${userCards.scheduledDays} >= ${MATURE_DAYS})::int`,
      excluded: sql<number>`count(*) filter (where ${cards.excludedAt} is not null or ${userCards.excludedAt} is not null)::int`,
    })
    .from(items)
    .leftJoin(cards, eq(cards.itemId, items.id))
    .leftJoin(userCards, and(eq(userCards.cardId, cards.id), eq(userCards.userId, user.id)))
    .groupBy(items.cefr);
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  return LEVELS.map((level) => {
    const excluded = user.excludedLevels.includes(level);
    const r = byLevel.get(level);
    if (!r) return { level, items: 0, cards: 0, studied: 0, mature: 0, remaining: 0, excluded };
    return { level, items: r.items, cards: r.cards, studied: r.studied, mature: r.mature, remaining: r.items - r.studied - r.excluded, excluded };
  });
}

/**
 * n이 전체의 몇 %인지 소수점 한 자리까지(예: "1.7%", "0%", "100%").
 * 반올림으로 0%나 100%로 보여 오해하지 않게, 0이 아닌데 0.1% 미만이면 "<0.1%", 전체가 아닌데 99.9% 초과면 ">99.9%"로 보인다.
 */
export function percent(n: number, total: number): string {
  if (total <= 0 || n <= 0) return "0%";
  const p = (n / total) * 100;
  if (p < 0.1) return "<0.1%";
  if (p > 99.9 && n < total) return ">99.9%";
  return `${Number(p.toFixed(1))}%`;
}

/** 매일 perDay장씩 새로 학습할 때 남은 뜻을 처음 다 보는 데 걸리는 날 수 */
export function daysLeft(remaining: number, perDay: number): number {
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / Math.max(1, perDay));
}

/**
 * 남은 날 수를 읽기 쉽게(1개월 30일, 1년 12개월로 센다). 대략적인 값이어서 달력의 실제 날 수는 따지지 않는다.
 * 30일 미만 "25일", 12개월 미만 "3개월 25일", 그 이상은 일을 생략하고 개월을 올림해 "1년 11개월". 0이면 "완료".
 */
export function formatDays(days: number): string {
  if (days <= 0) return "완료";
  if (days < 30) return `${days}일`;
  if (days < 360) {
    const m = Math.floor(days / 30);
    const d = days % 30;
    return d ? `${m}개월 ${d}일` : `${m}개월`;
  }
  const months = Math.ceil(days / 30);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y}년 ${m}개월` : `${y}년`;
}

/** 복습 예정 구간. 오늘 몫은 홈 위쪽의 "오늘 남은 복습"에 있으므로 내일부터 센다. from·to는 오늘 기준 며칠 뒤인지(to 미포함, null은 끝 없음). */
export const FORECAST_BUCKETS = [
  { label: "내일", from: 1, to: 2 },
  { label: "2~7일", from: 2, to: 8 },
  { label: "8~30일", from: 8, to: 31 },
  { label: "31일~1년", from: 31, to: 366 },
  { label: "1년 이후", from: 366, to: null },
] as const;

/**
 * 이 사용자가 한 번 이상 학습한 카드(뺀 카드 제외)의 다음 복습일을 레벨별·구간별로 센다. counts는 FORECAST_BUCKETS 순서다.
 * 날짜는 하루가 바뀌는 시각 기준이고, 하루 복습 상한은 따지지 않은 예정 수다.
 */
export async function reviewForecast(db: Db, userId: number, now = new Date(), dayStartHour = config.dayStartHour): Promise<{ level: Level; counts: number[] }[]> {
  const { start } = dayRange(now, dayStartHour);
  const bounds = FORECAST_BUCKETS.map((b) => ({ from: addDays(start, b.from).getTime(), to: b.to === null ? Infinity : addDays(start, b.to).getTime() }));
  const byLevel = new Map(LEVELS.map((level) => [level, FORECAST_BUCKETS.map(() => 0)]));
  const rows = await db
    .select({ due: userCards.due, level: items.cefr })
    .from(userCards)
    .innerJoin(cards, eq(cards.id, userCards.cardId))
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(eq(userCards.userId, userId), ne(userCards.state, State.New), isNull(userCards.excludedAt), isNull(cards.excludedAt)));
  for (const { due, level } of rows) {
    const t = due.getTime();
    const i = bounds.findIndex((b) => t >= b.from && t < b.to);
    if (i >= 0) byLevel.get(level)![i]++;
  }
  return LEVELS.map((level) => ({ level, counts: byLevel.get(level)! }));
}

export interface StudyDay {
  /** 학습일 키 YYYY-MM-DD(하루가 바뀌는 시각 기준) */
  day: string;
  /** 학습일이 시작하는 시각 */
  date: Date;
  /** 답한 수(같은 카드를 다시 본 것도 센다) */
  answers: number;
  /** 처음 학습한 새 카드 수 */
  newCards: number;
  /** 복습한 카드 수. 그날 처음 학습한 새 카드는 빼고, 같은 카드를 여러 번 본 것은 한 번으로 센다 */
  reviewCards: number;
  /** 최종 판정(정정 반영)이 맞음인 답 수 */
  correct: number;
}

export interface StudyHistory {
  /** 오늘부터 거슬러 올라간 days일. 학습하지 않은 날도 빈 기록으로 넣는다 */
  days: StudyDay[];
  /** 연속 학습일. 오늘 아직 학습하지 않았으면 어제까지로 센다 */
  streak: number;
}

/** 학습일 키를 SQL로(한국 시간에서 dayStartHour를 뺀 날짜). lib/day.ts의 dayKey와 같은 값이다. */
const sqlDayKey = (dayStartHour: number) =>
  sql<string>`to_char((${reviewLogs.reviewedAt} at time zone 'Asia/Seoul') - make_interval(hours => ${dayStartHour}), 'YYYY-MM-DD')`;

/** 날짜별 학습 기록. 따로 기록하지 않고 review_logs로 계산한다. */
export async function studyHistory(db: Db, userId: number, now = new Date(), dayStartHour = config.dayStartHour, days = 7): Promise<StudyHistory> {
  const { start, end } = dayRange(now, dayStartHour);
  const from = addDays(start, -(days - 1));
  const key = sqlDayKey(dayStartHour);
  const [rows, studied] = await Promise.all([
    db
      .select({ at: reviewLogs.reviewedAt, cardId: reviewLogs.cardId, state: reviewLogs.state, isCorrect: reviewLogs.isCorrect })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.reviewedAt, from), lt(reviewLogs.reviewedAt, end)))
      .orderBy(asc(reviewLogs.reviewedAt)),
    db
      .selectDistinct({ day: key })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, userId))
      .orderBy(sql`1 desc`),
  ]);
  const empty = (date: Date): StudyDay => ({ day: dayKey(date, dayStartHour), date, answers: 0, newCards: 0, reviewCards: 0, correct: 0 });
  const byDay = new Map<string, StudyDay & { seen: Set<number>; fresh: Set<number> }>();
  for (const r of rows) {
    const k = dayKey(r.at, dayStartHour);
    let d = byDay.get(k);
    if (!d) byDay.set(k, (d = { ...empty(dayRange(r.at, dayStartHour).start), seen: new Set(), fresh: new Set() }));
    d.answers++;
    d.seen.add(r.cardId);
    if (r.state === State.New) {
      d.newCards++;
      d.fresh.add(r.cardId);
    }
    if (r.isCorrect) d.correct++;
  }

  const list = Array.from({ length: days }, (_, i): StudyDay => {
    const date = addDays(start, -i);
    const d = byDay.get(dayKey(date, dayStartHour));
    if (!d) return empty(date);
    const { seen, fresh, ...rest } = d;
    return { ...rest, reviewCards: [...seen].filter((id) => !fresh.has(id)).length };
  });
  const studiedDays = new Set(studied.map((r) => r.day));
  let streak = 0;
  for (let i = studiedDays.has(dayKey(start, dayStartHour)) ? 0 : 1; studiedDays.has(dayKey(addDays(start, -i), dayStartHour)); i++) streak++;
  return { days: list, streak };
}
