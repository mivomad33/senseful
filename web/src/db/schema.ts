// 데이터 모델. docs/project_overview.md 8장.
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch('subsec') * 1000)`;

/** 학습 항목. 사전 수집 결과(5.1)를 그대로 옮긴다. 사전 예문은 저장하지 않는다. */
export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** 수집 결과의 고유 키(예: word:<사전 뜻 ID>, phrase:a few). 다시 가져올 때 같은 항목을 찾는 데 쓴다. */
    key: text("key").notNull().unique(),
    kind: text("kind", { enum: ["word", "idiom", "phrasal_verb", "phrase"] }).notNull(),
    /** 표제어. 구는 구 목록의 표기다. */
    headword: text("headword").notNull(),
    /** 사전 뜻 ID. 구 여러 개가 같은 뜻에 링크되므로 고유하지 않다. */
    dictSenseId: text("dict_sense_id").notNull(),
    pos: text("pos"),
    cefr: text("cefr", { enum: ["a1", "a2", "b1", "b2", "c1"] }).notNull(),
    /** 구분 표시(shortcut), 문법 표시, 사용역 표시 */
    shortcut: text("shortcut"),
    grammar: text("grammar"),
    labels: text("labels"),
    definition: text("definition").notNull(),
    /** 뜻이 실린 사전 페이지 이름 */
    sourceSlug: text("source_slug").notNull(),
    collectedAt: integer("collected_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("items_cefr_idx").on(t.cefr)],
);

/** 카드. 학습 항목 하나에 카드 하나다. FSRS 상태는 ts-fsrs의 Card 필드를 그대로 둔다. */
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .unique()
      .references(() => items.id),
    senseKo: text("sense_ko").notNull(),
    exampleEn: text("example_en").notNull(),
    exampleKo: text("example_ko").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    /** 뺀 시각. 뺀 카드는 지우지 않고 표시만 해 다시 생성 대상이 되지 않게 한다(5.5). */
    excludedAt: integer("excluded_at", { mode: "timestamp_ms" }),
    // FSRS 상태
    due: integer("due", { mode: "timestamp_ms" }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning */
    state: integer("state").notNull(),
    lastReview: integer("last_review", { mode: "timestamp_ms" }),
  },
  (t) => [index("cards_due_idx").on(t.due), check("cards_state_check", sql`${t.state} between 0 and 3`)],
);

/** 복습 기록. Claude 원래 판정과 최종 판정(정정 반영)을 둘 다 남겨 판정 프롬프트 개선에 쓴다. */
export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    userAnswer: text("user_answer").notNull(),
    /** 최종 판정 */
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    /** Claude 원래 판정 */
    graderIsCorrect: integer("grader_is_correct", { mode: "boolean" }).notNull(),
    graderReason: text("grader_reason"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
    // FSRS 로그(ts-fsrs ReviewLog)
    rating: integer("rating").notNull(),
    state: integer("state").notNull(),
    due: integer("due", { mode: "timestamp_ms" }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
  },
  (t) => [index("review_logs_card_idx").on(t.cardId)],
);

/** 학습일별 기록. 하루 새 카드 상한을 넘겨 더 학습하기로 한 장수를 남긴다(개요 문서 5.3). */
export const studyDays = sqliteTable("study_days", {
  /** 학습일(하루가 바뀌는 시각 기준) YYYY-MM-DD */
  day: text("day").primaryKey(),
  /** 하루 새 카드 상한에 더한 장수 */
  extraNew: integer("extra_new").notNull().default(0),
});
