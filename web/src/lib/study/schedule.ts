// 학습 일정(docs/project_overview.md 5.3·6장). 사용자별 오늘의 학습 구성과 판정 결과의 FSRS 적용·기록을 맡는다. 화면은 다루지 않는다.
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, notExists, notInArray, sql } from "drizzle-orm";
import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type ReviewLog } from "ts-fsrs";
import { config } from "@/config";
import type { Db } from "@/db";
import { cards, items, reviewLogs, studyDays, userCards } from "@/db/schema";
import { dayKey, dayRange } from "@/lib/day";

/** 목표 기억 유지율 0.9. 학습 단계는 ts-fsrs 기본값(학습 1분·10분, 재학습 10분)이다. */
export const scheduler = fsrs({ request_retention: 0.9 });

export const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;
export type Level = (typeof LEVELS)[number];

/** 학습하는 사용자와 그 사용자의 설정 */
export interface StudyUser {
  id: number;
  /** 하루 새 카드 수 */
  newPerDay: number;
  /** 새 카드를 받지 않을 레벨 */
  excludedLevels: Level[];
}

/** 모든 사용자에게 같은 설정값 */
export interface StudyLimits {
  reviewsPerDay: number;
  /** 하루가 바뀌는 시각(한국 시간). 자정을 넘겨 공부해도 같은 날로 센다. */
  dayStartHour: number;
  /** "새 카드 더 학습" 한 번에 더하는 장수 */
  extraNewStep: number;
}

type CardRow = typeof cards.$inferSelect;
type ItemRow = typeof items.$inferSelect;
type UserCardRow = typeof userCards.$inferSelect;
type LogRow = typeof reviewLogs.$inferSelect;

export interface StudyCard {
  card: CardRow;
  item: ItemRow;
  /** 그 사용자의 카드 상태. 새 카드는 null */
  state: UserCardRow | null;
  /** learning: 오늘 틀려 다시 나오는 카드(학습·재학습), review: 복습 예정 카드, new: 새 카드 */
  kind: "learning" | "review" | "new";
}

export interface TodayQueue {
  /** 지금 낼 수 있는 카드 */
  ready: StudyCard[];
  /** 오늘 안에 다시 나오지만 아직 시각이 안 된 학습 카드(다시 볼 카드), 나올 시각 순 */
  waiting: StudyCard[];
  /** 새 카드 상한 때문에 오늘 넣지 못했지만 상한을 늘리면 낼 수 있는 새 카드 수(형제 카드 미루기 적용 후, 최대 extraNewStep) */
  moreNew: number;
  /** 오늘 넣지 않은 새 카드 전체 수(형제 카드로 미룬 것 포함) */
  restNew: number;
  /** 이 사용자가 아직 학습하지 않은 새 카드 전체 수(제외한 레벨 빼고). 0이면 새 카드 소진 안내를 보인다 */
  newTotal: number;
}

/** 오늘 하루 새 카드 상한에 더한 장수 */
export async function extraNewToday(db: Db, userId: number, now: Date, dayStartHour: number): Promise<number> {
  const [r] = await db
    .select({ n: studyDays.extraNew })
    .from(studyDays)
    .where(and(eq(studyDays.userId, userId), eq(studyDays.day, dayKey(now, dayStartHour))));
  return r?.n ?? 0;
}

/** 이 사용자의 새 카드 조건: 관리자가 빼지 않았고, 제외한 레벨이 아니고, 아직 상태 행(학습·나만 빼기)이 없다. */
function newCardWhere(user: StudyUser) {
  return and(
    isNull(cards.excludedAt),
    user.excludedLevels.length ? notInArray(items.cefr, user.excludedLevels) : undefined,
    notExists(sql`(select 1 from ${userCards} where ${userCards.userId} = ${user.id} and ${userCards.cardId} = ${cards.id})`),
  );
}

/** 새 카드 순서: 레벨이 낮은 것부터, 레벨 안에서는 사용자마다 다른 무작위 순서(사용자·카드로 정해져 날마다 바뀌지 않는다). */
const newOrder = (userId: number) => sql`md5(${userId}::text || ':' || ${cards.id}::text)`;

/**
 * 오늘의 학습 구성.
 * - 학습 카드(오늘 틀린 카드)는 상한 없이 다시 나올 시각이 되면 낸다.
 * - 복습 카드는 오늘 끝까지 예정된 것을 예정일 순으로, 하루 복습 상한에서 오늘 한 복습 수를 뺀 만큼 넣는다.
 * - 새 카드는 레벨이 낮은 것부터(레벨 안에서는 무작위), 하루 새 카드 상한(오늘 더한 장수 포함)에서 오늘 처음 학습한 수를 뺀 만큼 넣는다.
 * - 형제 카드 미루기: 한 표제어는 하루에 카드 하나만 낸다. 오늘 이미 학습한 표제어나 이미 넣은 표제어의 카드는 다음 날로 미룬다.
 *   미룬 카드는 상한을 쓰지 않으므로 그 자리는 다음 카드가 채운다.
 */
export async function todayQueue(db: Db, user: StudyUser, now = new Date(), limits: StudyLimits = config): Promise<TodayQueue> {
  const { start, end } = dayRange(now, limits.dayStartHour);

  const [logs, extra, rows, [{ newTotal }]] = await Promise.all([
    db
      .select({ state: reviewLogs.state, headword: items.headword })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
      .innerJoin(items, eq(items.id, cards.itemId))
      .where(and(eq(reviewLogs.userId, user.id), gte(reviewLogs.reviewedAt, start), lt(reviewLogs.reviewedAt, end))),
    extraNewToday(db, user.id, now, limits.dayStartHour),
    db
      .select({ card: cards, item: items, state: userCards })
      .from(userCards)
      .innerJoin(cards, eq(cards.id, userCards.cardId))
      .innerJoin(items, eq(items.id, cards.itemId))
      .where(
        and(
          eq(userCards.userId, user.id),
          isNull(userCards.excludedAt),
          isNull(cards.excludedAt),
          inArray(userCards.state, [State.Learning, State.Review, State.Relearning]),
          lt(userCards.due, end),
        ),
      )
      .orderBy(asc(userCards.due), asc(userCards.cardId)),
    db
      .select({ newTotal: count() })
      .from(cards)
      .innerJoin(items, eq(items.id, cards.itemId))
      .where(newCardWhere(user)),
  ]);

  const taken = new Set(logs.map((l) => l.headword));
  let newLeft = user.newPerDay + extra - logs.filter((l) => l.state === State.New).length;
  let reviewLeft = limits.reviewsPerDay - logs.filter((l) => l.state === State.Review).length;

  const ready: StudyCard[] = [];
  const waiting: StudyCard[] = [];
  for (const r of rows) {
    if (r.state.state === State.Learning || r.state.state === State.Relearning) {
      (r.state.due <= now ? ready : waiting).push({ ...r, kind: "learning" });
    }
  }
  const add = (r: Omit<StudyCard, "kind">, kind: StudyCard["kind"]) => {
    if (taken.has(r.item.headword)) return false;
    taken.add(r.item.headword);
    ready.push({ ...r, kind });
    return true;
  };
  for (const r of rows) {
    if (reviewLeft <= 0) break;
    if (r.state.state === State.Review && add(r, "review")) reviewLeft--;
  }

  // 표제어마다 순서가 가장 앞선 새 카드 하나만 후보로 두고(형제 카드 미루기), 상한과 "더 학습"에 필요한 만큼만 가져온다.
  const want = Math.max(0, newLeft) + limits.extraNewStep;
  const takenList = [...taken];
  const perHeadword = db
    .selectDistinctOn([items.headword], {
      cardId: sql<number>`${cards.id}`.as("new_card_id"),
      level: sql<string>`${items.cefr}`.as("new_level"),
      rank: newOrder(user.id).as("new_rank"),
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(newCardWhere(user), takenList.length ? notInArray(items.headword, takenList) : undefined))
    .orderBy(items.headword, items.cefr, newOrder(user.id))
    .as("per_headword");
  const fresh = want
    ? await db
        .select({ card: cards, item: items })
        .from(perHeadword)
        .innerJoin(cards, eq(cards.id, perHeadword.cardId))
        .innerJoin(items, eq(items.id, cards.itemId))
        .orderBy(perHeadword.level, perHeadword.rank)
        .limit(want)
    : [];

  let placed = 0;
  for (const r of fresh) {
    if (newLeft <= 0) break;
    add({ ...r, state: null }, "new");
    newLeft--;
    placed++;
  }
  const moreNew = Math.min(fresh.length - placed, limits.extraNewStep);
  return { ready, waiting, moreNew, restNew: newTotal - placed, newTotal };
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
  /** 아직 학습하지 않은 새 카드 전체 수. 0이면 새 카드 소진 안내를 보인다 */
  newTotal: number;
}

export function countsOf(q: TodayQueue): TodayCounts {
  const n = (k: StudyCard["kind"]) => q.ready.filter((c) => c.kind === k).length;
  return {
    learning: n("learning") + q.waiting.length,
    review: n("review"),
    new: n("new"),
    ready: q.ready.length,
    waitingUntil: q.waiting.length ? q.waiting[0].state!.due.getTime() : null,
    moreNew: q.moreNew,
    restNew: q.restNew,
    newTotal: q.newTotal,
  };
}

/** 홈·학습 화면에 보일 오늘 남은 수와 상태 */
export async function todayCounts(db: Db, user: StudyUser, now = new Date(), limits: StudyLimits = config): Promise<TodayCounts> {
  return countsOf(await todayQueue(db, user, now, limits));
}

/**
 * 오늘 새 카드 상한을 최대 extraNewStep장 늘린다(새 카드 더 학습). 실제로 낼 수 있는 만큼만 늘리고 늘린 장수를 돌려준다.
 * 오늘 학습할 카드와 기다리는 다시 볼 카드가 모두 없을 때만 늘린다. 화면도 그때만 버튼을 보인다.
 */
export async function addExtraNew(db: Db, user: StudyUser, now = new Date(), limits: StudyLimits = config): Promise<number> {
  const { ready, waiting, moreNew } = await todayQueue(db, user, now, limits);
  if (ready.length || waiting.length || moreNew <= 0) return 0;
  await db
    .insert(studyDays)
    .values({ userId: user.id, day: dayKey(now, limits.dayStartHour), extraNew: moreNew })
    .onConflictDoUpdate({ target: [studyDays.userId, studyDays.day], set: { extraNew: sql`${studyDays.extraNew} + ${moreNew}` } });
  return moreNew;
}

export type NextCard = { status: "card"; next: StudyCard; queue: TodayQueue } | { status: "waiting"; until: Date; queue: TodayQueue } | { status: "done"; queue: TodayQueue };

/**
 * 다음에 낼 카드. 복습·새·학습 카드를 구분하지 않고 랜덤으로 고른다. 남은 것이 아직 시각이 안 된 학습 카드뿐이면 기다린다.
 * ahead(기다리지 않고 바로 보기)면 기다리지 않고 가장 빨리 돌아올 카드를 낸다.
 */
export async function nextCard(db: Db, user: StudyUser, now = new Date(), limits: StudyLimits = config, rand = Math.random, ahead = false): Promise<NextCard> {
  const queue = await todayQueue(db, user, now, limits);
  const { ready, waiting } = queue;
  if (ready.length) return { status: "card", next: ready[Math.floor(rand() * ready.length)], queue };
  if (waiting.length && ahead) return { status: "card", next: waiting[0], queue };
  if (waiting.length) return { status: "waiting", until: waiting[0].state!.due, queue };
  return { status: "done", queue };
}

type FsrsFields = Omit<UserCardRow, "userId" | "cardId" | "excludedAt">;

const toFsrs = (c: FsrsFields): FsrsCard => ({
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

export const fromFsrs = (c: FsrsCard): FsrsFields => ({
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
  /** 원래 판정 */
  graderIsCorrect: boolean;
  graderReason?: string | null;
  /** 판정 방법 */
  gradedBy?: LogRow["gradedBy"];
  /** 최종 판정. 생략하면 원래 판정이다. */
  isCorrect?: boolean;
}

export interface ReviewResult {
  logId: number;
  due: Date;
  state: State;
}

export class StudyError extends Error {}

/** 판정 결과를 FSRS에 적용하고 그 사용자의 카드 상태와 복습 기록을 저장한다. */
export async function recordReview(db: Db, userId: number, input: ReviewInput, now = new Date()): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const [card] = await tx.select({ excludedAt: cards.excludedAt }).from(cards).where(eq(cards.id, input.cardId));
    if (!card) throw new StudyError("카드가 없습니다.");
    if (card.excludedAt) throw new StudyError("뺀 카드입니다.");
    const [row] = await tx
      .select()
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, input.cardId)))
      .for("update");
    if (row?.excludedAt) throw new StudyError("뺀 카드입니다.");
    const isCorrect = input.isCorrect ?? input.graderIsCorrect;
    const { card: next, log } = scheduler.next(row ? toFsrs(row) : createEmptyCard(now), now, toRating(isCorrect));
    await tx
      .insert(userCards)
      .values({ userId, cardId: input.cardId, ...fromFsrs(next) })
      .onConflictDoUpdate({ target: [userCards.userId, userCards.cardId], set: fromFsrs(next) });
    const [{ id }] = await tx
      .insert(reviewLogs)
      .values({
        userId,
        cardId: input.cardId,
        userAnswer: input.userAnswer,
        isCorrect,
        graderIsCorrect: input.graderIsCorrect,
        graderReason: input.graderReason ?? null,
        gradedBy: input.gradedBy ?? "claude",
        ...fromFsrsLog(log),
      })
      .returning({ id: reviewLogs.id });
    return { logId: id, due: next.due, state: next.state };
  });
}

/**
 * 판정 정정. 그 기록 직전 상태로 되돌린 뒤 최종 판정으로 같은 시각에 다시 적용한다.
 * 그 사용자의 그 카드 마지막 기록만 정정할 수 있다(뒤에 기록이 있으면 그 기록들이 이 판정을 전제로 계산됐기 때문이다).
 */
export async function correctReview(db: Db, userId: number, logId: number, isCorrect: boolean): Promise<ReviewResult> {
  return db.transaction(async (tx) => {
    const [log] = await tx
      .select()
      .from(reviewLogs)
      .where(and(eq(reviewLogs.id, logId), eq(reviewLogs.userId, userId)));
    if (!log) throw new StudyError("복습 기록이 없습니다.");
    const [row] = await tx
      .select()
      .from(userCards)
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, log.cardId)))
      .for("update");
    const [last] = await tx
      .select({ id: reviewLogs.id })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.cardId, log.cardId)))
      .orderBy(desc(reviewLogs.id))
      .limit(1);
    if (last?.id !== logId) throw new StudyError("뒤에 기록이 있어 정정할 수 없습니다.");
    if (log.isCorrect === isCorrect) return { logId, due: row.due, state: row.state };

    const prev = scheduler.rollback(toFsrs(row), toFsrsLog(log));
    const { card, log: redone } = scheduler.next(prev, log.reviewedAt, toRating(isCorrect));
    await tx
      .update(userCards)
      .set(fromFsrs(card))
      .where(and(eq(userCards.userId, userId), eq(userCards.cardId, log.cardId)));
    await tx
      .update(reviewLogs)
      .set({ isCorrect, ...fromFsrsLog(redone) })
      .where(eq(reviewLogs.id, logId));
    return { logId, due: card.due, state: card.state };
  });
}
