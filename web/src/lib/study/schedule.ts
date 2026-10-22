// 학습 일정(docs/project_overview.md 5.3·6장). 오늘의 학습 구성과 판정 결과의 FSRS 적용·기록을 맡는다. 화면은 다루지 않는다.
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { fsrs, Rating, State, type Card as FsrsCard, type ReviewLog } from "ts-fsrs";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, items, reviewLogs, studyDays } from "@/db/schema";

/** 목표 기억 유지율 0.9. 학습 단계는 ts-fsrs 기본값(학습 1분·10분, 재학습 10분)이다. */
export const scheduler = fsrs({ request_retention: 0.9 });

export interface StudyLimits {
  newPerDay: number;
  reviewsPerDay: number;
  /** 하루가 바뀌는 시각(로컬 시간). 자정을 넘겨 공부해도 같은 날로 센다. */
  dayStartHour: number;
  /** "새 카드 더 학습" 한 번에 더하는 장수. 생략하면 설정값 */
  extraNewStep?: number;
}

type CardRow = typeof cards.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type LogRow = typeof reviewLogs.$inferSelect;

export interface StudyCard {
  card: CardRow;
  item: ItemRow;
  /** learning: 오늘 틀려 다시 나오는 카드(학습·재학습), review: 복습 예정 카드, new: 새 카드 */
  kind: "learning" | "review" | "new";
}

export interface TodayQueue {
  /** 지금 낼 수 있는 카드 */
  ready: StudyCard[];
  /** 오늘 안에 다시 나오지만 아직 시각이 안 된 학습 카드(다시 볼 카드), 나올 시각 순 */
  waiting: StudyCard[];
  /** 새 카드 상한 때문에 오늘 넣지 못했지만 상한을 늘리면 낼 수 있는 새 카드 수(형제 카드 미루기 적용 후) */
  moreNew: number;
  /** 오늘 넣지 않은 새 카드 전체 수(형제 카드로 미룬 것 포함) */
  restNew: number;
}

/** 학습일 키(YYYY-MM-DD). study_days에 쓴다. */
export function dayKey(now: Date, dayStartHour: number): string {
  const { start } = dayRange(now, dayStartHour);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`;
}

/** 오늘 하루 새 카드 상한에 더한 장수 */
export function extraNewToday(db: Db, now: Date, dayStartHour: number): number {
  return db.select().from(studyDays).where(eq(studyDays.day, dayKey(now, dayStartHour))).get()?.extraNew ?? 0;
}

/** now가 속한 학습일의 [시작, 끝). */
export function dayRange(now: Date, dayStartHour: number): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(dayStartHour, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * 오늘의 학습 구성.
 * - 학습 카드(오늘 틀린 카드)는 상한 없이 다시 나올 시각이 되면 낸다.
 * - 복습 카드는 오늘 끝까지 예정된 것을 예정일 순으로, 하루 복습 상한에서 오늘 한 복습 수를 뺀 만큼 넣는다.
 * - 새 카드는 만든 순서로, 하루 새 카드 상한(오늘 더한 장수 포함)에서 오늘 처음 학습한 수를 뺀 만큼 넣는다.
 * - 형제 카드 미루기: 한 표제어는 하루에 카드 하나만 낸다. 오늘 이미 학습한 표제어나 이미 넣은 표제어의 카드는 다음 날로 미룬다.
 *   미룬 카드는 상한을 쓰지 않으므로 그 자리는 다음 카드가 채운다.
 */
export function todayQueue(db: Db, now = new Date(), limits: StudyLimits = config): TodayQueue {
  const { start, end } = dayRange(now, limits.dayStartHour);

  const logs = db
    .select({ state: reviewLogs.state, headword: items.headword })
    .from(reviewLogs)
    .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end)))
    .all();
  const taken = new Set(logs.map((l) => l.headword));
  let newLeft = limits.newPerDay + extraNewToday(db, now, limits.dayStartHour) - logs.filter((l) => l.state === State.New).length;
  let reviewLeft = limits.reviewsPerDay - logs.filter((l) => l.state === State.Review).length;

  const rows = db
    .select({ card: cards, item: items })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(isNull(cards.excludedAt), lt(cards.due, end)))
    .orderBy(cards.due, cards.id)
    .all();

  const ready: StudyCard[] = [];
  const waiting: StudyCard[] = [];
  for (const r of rows) {
    if (r.card.state === State.Learning || r.card.state === State.Relearning) {
      (r.card.due <= now ? ready : waiting).push({ ...r, kind: "learning" });
    }
  }
  const add = (r: (typeof rows)[number], kind: StudyCard["kind"]) => {
    if (taken.has(r.item.headword)) return false;
    taken.add(r.item.headword);
    ready.push({ ...r, kind });
    return true;
  };
  for (const r of rows) {
    if (reviewLeft <= 0) break;
    if (r.card.state === State.Review && add(r, "review")) reviewLeft--;
  }
  const fresh = rows.filter((r) => r.card.state === State.New).sort((a, b) => a.card.id - b.card.id);
  let placed = 0;
  let moreNew = 0;
  for (const r of fresh) {
    if (newLeft > 0) {
      if (add(r, "new")) {
        newLeft--;
        placed++;
      }
    } else if (!taken.has(r.item.headword)) {
      // 상한을 늘리면 낼 수 있는 카드. 같은 표제어는 하나만 센다.
      taken.add(r.item.headword);
      moreNew++;
    }
  }
  return { ready, waiting, moreNew, restNew: fresh.length - placed };
}

export interface TodayCounts {
  /** 다시 볼 카드(지금 낼 수 있는 것과 기다리는 것 모두) */
  learning: number;
  review: number;
  new: number;
  /** 지금 낼 수 있는 카드 수 */
  ready: number;
  /** 가장 빨리 돌아올 다시 볼 카드의 시각(ms). 기다리는 카드가 없으면 null */
  waitingUntil: number | null;
  /** "새 카드 더 학습"으로 지금 더할 수 있는 장수(최대 extraNewStep) */
  moreNew: number;
  /** 오늘 넣지 않은 새 카드 전체 수. moreNew가 0일 때 이유를 알리는 데 쓴다 */
  restNew: number;
}

/** 홈·학습 화면에 보일 오늘 남은 수와 상태 */
export function todayCounts(db: Db, now = new Date(), limits: StudyLimits = config): TodayCounts {
  const { ready, waiting, moreNew, restNew } = todayQueue(db, now, limits);
  const count = (k: StudyCard["kind"]) => ready.filter((c) => c.kind === k).length;
  return {
    learning: count("learning") + waiting.length,
    review: count("review"),
    new: count("new"),
    ready: ready.length,
    waitingUntil: waiting.length ? waiting[0].card.due.getTime() : null,
    moreNew: Math.min(moreNew, limits.extraNewStep ?? config.extraNewStep),
    restNew,
  };
}

/**
 * 오늘 새 카드 상한을 최대 extraNewStep장 늘린다(새 카드 더 학습). 실제로 낼 수 있는 만큼만 늘리고 늘린 장수를 돌려준다.
 * 오늘 학습할 카드와 기다리는 다시 볼 카드가 모두 없을 때만 늘린다. 화면도 그때만 버튼을 보인다.
 */
export function addExtraNew(db: Db, now = new Date(), limits: StudyLimits = config): number {
  const { ready, waiting, moreNew } = todayQueue(db, now, limits);
  if (ready.length || waiting.length) return 0;
  const n = Math.min(moreNew, limits.extraNewStep ?? config.extraNewStep);
  if (n <= 0) return 0;
  db.insert(studyDays)
    .values({ day: dayKey(now, limits.dayStartHour), extraNew: n })
    .onConflictDoUpdate({ target: studyDays.day, set: { extraNew: sql`${studyDays.extraNew} + ${n}` } })
    .run();
  return n;
}

export type NextCard = { status: "card"; next: StudyCard } | { status: "waiting"; until: Date } | { status: "done" };

/**
 * 다음에 낼 카드. 복습·새·학습 카드를 구분하지 않고 랜덤으로 고른다. 남은 것이 아직 시각이 안 된 학습 카드뿐이면 기다린다.
 * ahead(기다리지 않고 바로 보기)면 기다리지 않고 가장 빨리 돌아올 카드를 낸다.
 */
export function nextCard(db: Db, now = new Date(), limits: StudyLimits = config, rand = Math.random, ahead = false): NextCard {
  const { ready, waiting } = todayQueue(db, now, limits);
  if (ready.length) return { status: "card", next: ready[Math.floor(rand() * ready.length)] };
  if (waiting.length && ahead) return { status: "card", next: waiting[0] };
  if (waiting.length) return { status: "waiting", until: waiting[0].card.due };
  return { status: "done" };
}

const toFsrs = (c: CardRow): FsrsCard => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsedDays,
  scheduled_days: c.scheduledDays,
  learning_steps: c.learningSteps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.lastReview ?? undefined,
});

const fromFsrs = (c: FsrsCard) => ({
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: c.elapsed_days,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ?? null,
});

const fromFsrsLog = (l: ReviewLog) => ({
  rating: l.rating,
  state: l.state,
  due: l.due,
  stability: l.stability,
  difficulty: l.difficulty,
  elapsedDays: l.elapsed_days,
  lastElapsedDays: l.last_elapsed_days,
  scheduledDays: l.scheduled_days,
  learningSteps: l.learning_steps,
  reviewedAt: l.review,
});

const toFsrsLog = (l: LogRow): ReviewLog => ({
  rating: l.rating,
  state: l.state,
  due: l.due,
  stability: l.stability,
  difficulty: l.difficulty,
  elapsed_days: l.elapsedDays,
  last_elapsed_days: l.lastElapsedDays,
  scheduled_days: l.scheduledDays,
  learning_steps: l.learningSteps,
  review: l.reviewedAt,
});

/** 맞음 → Good, 틀림 → Again(6장) */
const toRating = (isCorrect: boolean) => (isCorrect ? Rating.Good : Rating.Again);

export interface ReviewInput {
  cardId: number;
  userAnswer: string;
  /** Claude 원래 판정 */
  graderIsCorrect: boolean;
  graderReason?: string | null;
  /** 최종 판정. 판정 전에 정정을 받는 화면이면 원래 판정과 다를 수 있다. 생략하면 원래 판정이다. */
  isCorrect?: boolean;
}

export interface ReviewResult {
  logId: number;
  due: Date;
  state: State;
}

/** 판정 결과를 FSRS에 적용하고 카드 상태와 복습 기록을 저장한다. */
export function recordReview(db: Db, input: ReviewInput, now = new Date()): ReviewResult {
  return db.transaction((tx) => {
    const row = tx.select().from(cards).where(eq(cards.id, input.cardId)).get();
    if (!row) throw new Error(`카드 ${input.cardId}가 없다`);
    if (row.excludedAt) throw new Error(`카드 ${input.cardId}는 뺀 카드다`);
    const isCorrect = input.isCorrect ?? input.graderIsCorrect;
    const { card, log } = scheduler.next(toFsrs(row), now, toRating(isCorrect));
    tx.update(cards).set(fromFsrs(card)).where(eq(cards.id, row.id)).run();
    const { id } = tx
      .insert(reviewLogs)
      .values({
        cardId: row.id,
        userAnswer: input.userAnswer,
        isCorrect,
        graderIsCorrect: input.graderIsCorrect,
        graderReason: input.graderReason ?? null,
        ...fromFsrsLog(log),
      })
      .returning({ id: reviewLogs.id })
      .get();
    return { logId: id, due: card.due, state: card.state };
  });
}

/**
 * 판정 정정. 그 기록 직전 상태로 되돌린 뒤 최종 판정으로 같은 시각에 다시 적용한다.
 * 그 카드의 마지막 기록만 정정할 수 있다(뒤에 기록이 있으면 그 기록들이 이 판정을 전제로 계산됐기 때문이다).
 */
export function correctReview(db: Db, logId: number, isCorrect: boolean): ReviewResult {
  return db.transaction((tx) => {
    const log = tx.select().from(reviewLogs).where(eq(reviewLogs.id, logId)).get();
    if (!log) throw new Error(`복습 기록 ${logId}가 없다`);
    const last = tx.select({ id: reviewLogs.id }).from(reviewLogs).where(eq(reviewLogs.cardId, log.cardId)).orderBy(desc(reviewLogs.id)).limit(1).get();
    if (last?.id !== logId) throw new Error(`복습 기록 ${logId} 뒤에 기록이 있어 정정할 수 없다`);
    const row = tx.select().from(cards).where(eq(cards.id, log.cardId)).get()!;
    if (log.isCorrect === isCorrect) return { logId, due: row.due, state: row.state };

    const prev = scheduler.rollback(toFsrs(row), toFsrsLog(log));
    const { card, log: redone } = scheduler.next(prev, log.reviewedAt, toRating(isCorrect));
    tx.update(cards).set(fromFsrs(card)).where(eq(cards.id, row.id)).run();
    tx.update(reviewLogs).set({ isCorrect, ...fromFsrsLog(redone) }).where(eq(reviewLogs.id, logId)).run();
    return { logId, due: card.due, state: card.state };
  });
}
