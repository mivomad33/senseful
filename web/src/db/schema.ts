// 데이터 모델(Postgres). 카드 내용은 모든 사용자가 같이 쓰고, 학습 상태는 사용자별이다.
// 원격 DB에는 표제어·종류·품사·레벨과 카드 내용만 둔다. 사전 고유 값과 뜻풀이는 로컬 수집 DB에만 있다.
import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;

/** 사용자. 구글 계정으로 처음 로그인하면 만들어진다. 관리자는 이메일이 ADMIN_EMAIL과 같은 계정이다. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** 구글 계정 고유 id(sub). 이전 때 미리 만든 관리자 계정은 처음 로그인할 때 채운다. */
  googleSub: text("google_sub").unique(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  /** 하루 새 카드 수(1~20) */
  newPerDay: integer("new_per_day").notNull().default(10),
  /** 새 카드를 받지 않을 레벨 */
  excludedLevels: text("excluded_levels", { enum: LEVELS }).array().notNull().default(sql`'{}'::text[]`),
});

/** 로그인 세션. 쿠키에는 무작위 토큰을 두고, DB에는 그 해시만 둔다. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** 학습 항목(뜻 하나). id는 로컬 수집 DB의 항목 id와 같다. */
export const items = pgTable(
  "items",
  {
    id: integer("id").primaryKey(),
    kind: text("kind", { enum: ["word", "idiom", "phrasal_verb", "phrase"] }).notNull(),
    /** 표제어. 구는 구 목록의 표기다. */
    headword: text("headword").notNull(),
    pos: text("pos"),
    cefr: text("cefr", { enum: LEVELS }).notNull(),
  },
  (t) => [index("items_cefr_idx").on(t.cefr)],
);

/** 공용 카드. 학습 항목 하나에 카드 하나다. 관리자만 고치거나 뺄 수 있다. */
export const cards = pgTable("cards", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id")
    .notNull()
    .unique()
    .references(() => items.id),
  senseKo: text("sense_ko").notNull(),
  exampleEn: text("example_en").notNull(),
  exampleKo: text("example_ko").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** 관리자가 뺀 시각. 뺀 카드는 아무에게도 나오지 않고, 그 항목은 다시 생성하지 않는다. */
  excludedAt: ts("excluded_at"),
});

/**
 * 사용자별 카드 상태. 처음 학습하거나 나만 빼기를 할 때 만든다. 행이 없으면 새 카드다.
 * FSRS 상태는 ts-fsrs의 Card 필드를 그대로 둔다.
 */
export const userCards = pgTable(
  "user_cards",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    /** 이 사용자가 뺀 시각(나만 빼기) */
    excludedAt: ts("excluded_at"),
    due: ts("due").notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning */
    state: integer("state").notNull(),
    lastReview: ts("last_review"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId] }),
    index("user_cards_due_idx").on(t.userId, t.due),
    check("user_cards_state_check", sql`${t.state} between 0 and 3`),
  ],
);

/** 복습 기록. 원래 판정과 최종 판정(정정 반영)을 둘 다 남겨 판정 프롬프트 개선에 쓴다. */
export const reviewLogs = pgTable(
  "review_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    userAnswer: text("user_answer").notNull(),
    /** 최종 판정 */
    isCorrect: boolean("is_correct").notNull(),
    /** 원래 판정 */
    graderIsCorrect: boolean("grader_is_correct").notNull(),
    graderReason: text("grader_reason"),
    /** 판정 방법. claude: API 판정, exact: 저장된 번역과 같아 API 없이 맞음, empty: 빈 답안이라 API 없이 틀림 */
    gradedBy: text("graded_by", { enum: ["claude", "exact", "empty"] })
      .notNull()
      .default("claude"),
    reviewedAt: ts("reviewed_at").notNull(),
    // FSRS 로그(ts-fsrs ReviewLog)
    rating: integer("rating").notNull(),
    state: integer("state").notNull(),
    due: ts("due").notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
  },
  (t) => [index("review_logs_user_time_idx").on(t.userId, t.reviewedAt), index("review_logs_card_idx").on(t.userId, t.cardId)],
);

/** 사용자별 학습일 기록. 하루 새 카드 상한을 넘겨 더 학습하기로 한 장수를 남긴다. */
export const studyDays = pgTable(
  "study_days",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 학습일(하루가 바뀌는 시각 기준) YYYY-MM-DD */
    day: text("day").notNull(),
    /** 하루 새 카드 상한에 더한 장수 */
    extraNew: integer("extra_new").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** 카드 오류 신고 */
export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    note: text("note"),
    createdAt: ts("created_at").notNull().defaultNow(),
    /** 관리자가 처리 완료로 표시한 시각 */
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("reports_created_idx").on(t.createdAt)],
);

/** 사용자별 하루 판정(API) 횟수. 탈퇴하면 같이 지운다. */
export const gradeUsage = pgTable(
  "grade_usage",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** 전체 하루 판정(API) 횟수. 사용자와 연결하지 않아 탈퇴해도 줄지 않는다. */
export const gradeUsageTotal = pgTable("grade_usage_total", {
  day: text("day").primaryKey(),
  count: integer("count").notNull().default(0),
});
