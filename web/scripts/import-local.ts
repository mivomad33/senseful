// 로컬 DB를 원격 DB로 옮긴다(문서 4.6-1, 4.6-3). 사용: npm run db:import-local [-- --dev]
// - 학습 항목 13,569개 전체: id(로컬과 같다), 종류, 표제어, 품사, 레벨만 올린다. 뜻풀이와 사전 고유 값은 올리지 않는다.
// - 카드(고친 내용 포함): 공용 카드로 올린다(id 그대로). 로컬에서 뺀 카드는 관리자가 뺀 카드가 된다.
// - 내 학습 상태·학습 기록·새 카드 더 학습 기록: 관리자 계정(ADMIN_EMAIL)으로 옮긴다. 관리자 계정이 없으면 미리 만든다(처음 구글 로그인 때 연결된다).
// 다시 실행하면 항목·카드는 갱신하고, 관리자 학습 기록이 이미 있으면 기록 이전은 건너뛴다. 운영 DB는 먼저 백업한다.
import "./env";
import { eq, sql } from "drizzle-orm";
import { State } from "ts-fsrs";
import { adminEmail } from "@/config";
import { openDb } from "@/db";
import { cards, items, reviewLogs, studyDays, userCards, users } from "@/db/schema";
import { openLocal, type LocalItem } from "./lib/local-db";
import { backupBeforeChange, target } from "./lib/target";

interface LocalCard {
  id: number;
  item_id: number;
  sense_ko: string;
  example_en: string;
  example_ko: string;
  created_at: number;
  updated_at: number;
  excluded_at: number | null;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

interface LocalLog {
  id: number;
  card_id: number;
  user_answer: string;
  is_correct: number;
  grader_is_correct: number;
  grader_reason: string | null;
  reviewed_at: number;
  rating: number;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
}

const d = (ms: number) => new Date(ms);
const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const email = adminEmail();
  if (!email) throw new Error("ADMIN_EMAIL이 없습니다");
  const t = target();
  const local = openLocal();
  const localItems = local.prepare("select id, kind, headword, pos, cefr from items order by id").all() as Pick<LocalItem, "id" | "kind" | "headword" | "pos" | "cefr">[];
  const localCards = local.prepare("select * from cards order by id").all() as LocalCard[];
  const localLogs = local.prepare("select * from review_logs order by id").all() as LocalLog[];
  const localDays = local.prepare("select day, extra_new from study_days").all() as { day: string; extra_new: number }[];
  local.close();
  console.log(`로컬: 항목 ${localItems.length}, 카드 ${localCards.length}, 학습 기록 ${localLogs.length}, 새 카드 더 학습 ${localDays.length}일`);

  await backupBeforeChange(t);
  const { db, pool } = openDb(t.url, 1);
  try {
    await db.transaction(async (tx) => {
      for (const part of chunks(localItems, 1000)) {
        await tx
          .insert(items)
          .values(part)
          .onConflictDoUpdate({ target: items.id, set: { kind: sql`excluded.kind`, headword: sql`excluded.headword`, pos: sql`excluded.pos`, cefr: sql`excluded.cefr` } });
      }
      for (const part of chunks(localCards, 500)) {
        await tx
          .insert(cards)
          .values(
            part.map((c) => ({
              id: c.id,
              itemId: c.item_id,
              senseKo: c.sense_ko,
              exampleEn: c.example_en,
              exampleKo: c.example_ko,
              createdAt: d(c.created_at),
              updatedAt: d(c.updated_at),
              excludedAt: c.excluded_at === null ? null : d(c.excluded_at),
            })),
          )
          .onConflictDoUpdate({
            target: cards.id,
            set: { senseKo: sql`excluded.sense_ko`, exampleEn: sql`excluded.example_en`, exampleKo: sql`excluded.example_ko`, updatedAt: sql`excluded.updated_at`, excludedAt: sql`excluded.excluded_at` },
          });
      }
      // 명시한 id로 넣었으므로 다음 카드 id가 겹치지 않게 순서를 맞춘다.
      await tx.execute(sql`select setval(pg_get_serial_sequence('cards', 'id'), greatest((select max(id) from cards), 1))`);

      let [admin] = await tx.select().from(users).where(eq(users.email, email));
      if (!admin) [admin] = await tx.insert(users).values({ email, newPerDay: 20 }).returning();
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(reviewLogs).where(eq(reviewLogs.userId, admin.id));
      if (n > 0) {
        console.log(`관리자 학습 기록이 이미 ${n}건 있어 기록 이전은 건너뜁니다.`);
        return;
      }
      await tx.update(users).set({ newPerDay: 20 }).where(eq(users.id, admin.id));
      const studied = localCards.filter((c) => c.state !== State.New || c.reps > 0 || c.excluded_at !== null);
      for (const part of chunks(studied, 500)) {
        await tx.insert(userCards).values(
          part.map((c) => ({
            userId: admin.id,
            cardId: c.id,
            due: d(c.due),
            stability: c.stability,
            difficulty: c.difficulty,
            elapsedDays: c.elapsed_days,
            scheduledDays: c.scheduled_days,
            learningSteps: c.learning_steps,
            reps: c.reps,
            lapses: c.lapses,
            state: c.state,
            lastReview: c.last_review === null ? null : d(c.last_review),
          })),
        );
      }
      for (const part of chunks(localLogs, 500)) {
        await tx.insert(reviewLogs).values(
          part.map((l) => ({
            userId: admin.id,
            cardId: l.card_id,
            userAnswer: l.user_answer,
            isCorrect: l.is_correct === 1,
            graderIsCorrect: l.grader_is_correct === 1,
            graderReason: l.grader_reason,
            gradedBy: "claude" as const,
            reviewedAt: d(l.reviewed_at),
            rating: l.rating,
            state: l.state,
            due: d(l.due),
            stability: l.stability,
            difficulty: l.difficulty,
            elapsedDays: l.elapsed_days,
            lastElapsedDays: l.last_elapsed_days,
            scheduledDays: l.scheduled_days,
            learningSteps: l.learning_steps,
          })),
        );
      }
      if (localDays.length) await tx.insert(studyDays).values(localDays.map((x) => ({ userId: admin.id, day: x.day, extraNew: x.extra_new })));
      console.log(`관리자 계정(${admin.id})으로 카드 상태 ${studied.length}, 학습 기록 ${localLogs.length}, 새 카드 더 학습 ${localDays.length}일을 옮겼습니다.`);
    });
    const [counts] = (await db.execute(sql`select (select count(*) from items)::int items, (select count(*) from cards)::int cards, (select count(*) from review_logs)::int logs, (select count(*) from users)::int users`)).rows;
    console.log(`${t.name} DB: ${JSON.stringify(counts)}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
