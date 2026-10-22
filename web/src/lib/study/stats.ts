// 홈 화면의 학습 기록, 레벨별 학습 현황, 복습 예정.
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { State } from "ts-fsrs";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, items, reviewLogs } from "@/db/schema";
import { dayKey, dayRange } from "./schedule";

export const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;
/** 다음 복습까지 이 일수 이상 남은 카드를 "익숙함"으로 센다(Anki의 mature 기준). */
export const MATURE_DAYS = 21;

export interface LevelStat {
  level: (typeof LEVELS)[number];
  /** 수집한 뜻(카드를 만들 수 있는 전체) */
  items: number;
  /** 만든 카드(뺀 카드 제외) */
  cards: number;
  /** 한 번이라도 학습한 카드 */
  studied: number;
  /** 다음 복습까지 MATURE_DAYS일 이상 남은 카드 */
  mature: number;
  /** 아직 처음 학습하지 않은 뜻(전체 뜻 − 학습함 − 뺀 카드). 카드를 만들었지만 학습하지 않은 것도 포함한다 */
  remaining: number;
}

export function levelStats(db: Db): LevelStat[] {
  const live = sql`${cards.id} is not null and ${cards.excludedAt} is null`;
  const rows = db
    .select({
      level: items.cefr,
      items: sql<number>`count(*)`,
      cards: sql<number>`coalesce(sum(${live}), 0)`,
      studied: sql<number>`coalesce(sum(${live} and ${cards.state} <> ${State.New}), 0)`,
      mature: sql<number>`coalesce(sum(${live} and ${cards.state} = ${State.Review} and ${cards.scheduledDays} >= ${MATURE_DAYS}), 0)`,
      excluded: sql<number>`coalesce(sum(${cards.excludedAt} is not null), 0)`,
    })
    .from(items)
    .leftJoin(cards, sql`${cards.itemId} = ${items.id}`)
    .groupBy(items.cefr)
    .all();
  const byLevel = new Map(rows.map((r) => [r.level, r]));
  return LEVELS.map((level) => {
    const r = byLevel.get(level);
    if (!r) return { level, items: 0, cards: 0, studied: 0, mature: 0, remaining: 0 };
    return { level, items: r.items, cards: r.cards, studied: r.studied, mature: r.mature, remaining: r.items - r.studied - r.excluded };
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
 * 한 번 이상 학습한 카드(뺀 카드 제외)의 다음 복습일을 레벨별·구간별로 센다. counts는 FORECAST_BUCKETS 순서다.
 * 날짜는 하루가 바뀌는 시각 기준이고, 하루 복습 상한은 따지지 않은 예정 수다.
 */
export function reviewForecast(db: Db, now = new Date(), dayStartHour = config.dayStartHour): { level: (typeof LEVELS)[number]; counts: number[] }[] {
  const { start } = dayRange(now, dayStartHour);
  const dayAfter = (n: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + n);
    return d.getTime();
  };
  const bounds = FORECAST_BUCKETS.map((b) => ({ from: dayAfter(b.from), to: b.to === null ? Infinity : dayAfter(b.to) }));
  const byLevel = new Map(LEVELS.map((level) => [level, FORECAST_BUCKETS.map(() => 0)]));
  const rows = db
    .select({ due: cards.due, level: items.cefr })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(ne(cards.state, State.New), isNull(cards.excludedAt)))
    .all();
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

/** 날짜별 학습 기록. 따로 기록하지 않고 review_logs로 계산한다. */
export function studyHistory(db: Db, now = new Date(), dayStartHour = config.dayStartHour, days = 7): StudyHistory {
  const rows = db
    .select({ at: reviewLogs.reviewedAt, cardId: reviewLogs.cardId, state: reviewLogs.state, isCorrect: reviewLogs.isCorrect })
    .from(reviewLogs)
    .orderBy(asc(reviewLogs.reviewedAt))
    .all();
  const empty = (date: Date): StudyDay => ({ day: dayKey(date, dayStartHour), date, answers: 0, newCards: 0, reviewCards: 0, correct: 0 });
  const byDay = new Map<string, StudyDay & { seen: Set<number>; fresh: Set<number> }>();
  for (const r of rows) {
    const key = dayKey(r.at, dayStartHour);
    let d = byDay.get(key);
    if (!d) byDay.set(key, (d = { ...empty(dayRange(r.at, dayStartHour).start), seen: new Set(), fresh: new Set() }));
    d.answers++;
    d.seen.add(r.cardId);
    if (r.state === State.New) {
      d.newCards++;
      d.fresh.add(r.cardId);
    }
    if (r.isCorrect) d.correct++;
  }

  const { start } = dayRange(now, dayStartHour);
  const dayAt = (i: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    return d;
  };
  const list = Array.from({ length: days }, (_, i): StudyDay => {
    const date = dayAt(i);
    const d = byDay.get(dayKey(date, dayStartHour));
    if (!d) return empty(date);
    const { seen, fresh, ...rest } = d;
    return { ...rest, reviewCards: [...seen].filter((id) => !fresh.has(id)).length };
  });
  let streak = 0;
  for (let i = byDay.has(dayKey(start, dayStartHour)) ? 0 : 1; byDay.has(dayKey(dayAt(i), dayStartHour)); i++) streak++;
  return { days: list, streak };
}
