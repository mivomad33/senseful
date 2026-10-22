// 새 카드 만들기(docs/project_overview.md 5.2). 카드가 없는 항목 중 가장 낮은 레벨에서 랜덤으로 골라 생성하고 바로 저장한다.
// 생성이 실패한 항목은 저장하지 않는다. 카드가 없는 항목으로 남아 다음 번에 다시 후보가 된다.
import { asc, isNull, sql } from "drizzle-orm";
import { createEmptyCard } from "ts-fsrs";
import type { Db } from "@/db";
import { cards, items } from "@/db/schema";
import type { GenCard, GenItem } from "./prompt";

/** 항목 목록을 받아 카드 목록을 돌려준다. 실제로는 Claude API를 부르고, 테스트에서는 바꿔 끼운다. */
export type Generate = (items: GenItem[]) => Promise<GenCard[]>;

export interface CreateResult {
  created: number;
  failed: { headword: string; reason: string }[];
}

type ItemRow = typeof items.$inferSelect;

/** 카드가 없는 항목(뺀 카드도 카드 행이 남으므로 제외된다) 중 레벨이 낮은 것부터, 레벨 안에서는 랜덤으로 n개 고른다. */
export function pickItems(db: Db, n: number): ItemRow[] {
  return db
    .select({ item: items })
    .from(items)
    .leftJoin(cards, sql`${cards.itemId} = ${items.id}`)
    .where(isNull(cards.id))
    .orderBy(asc(items.cefr), sql`random()`)
    .limit(n)
    .all()
    .map((r) => r.item);
}

const toGenItem = (it: ItemRow): GenItem => ({
  kind: it.kind,
  headword: it.headword,
  pos: it.pos,
  level: it.cefr,
  shortcut: it.shortcut,
  grammar: it.grammar,
  labels: it.labels,
  def: it.definition,
});

/** 응답에서 항목 번호마다 쓸 수 있는 카드를 찾는다. 없으면 실패 이유를 둔다. */
function matchCards(n: number, out: GenCard[]): (GenCard | string)[] {
  return Array.from({ length: n }, (_, i) => {
    const found = out.filter((c) => c.id === i);
    if (found.length === 0) return "응답에 없음";
    if (found.length > 1) return "응답에 같은 번호가 여러 번 나옴";
    const c = found[0];
    const empty = (["sense_ko", "example_en", "example_ko"] as const).filter((f) => !c[f]?.trim());
    if (empty.length) return `빈 필드(${empty.join(", ")})`;
    return c;
  });
}

export async function createCards(db: Db, generate: Generate, n: number, now = new Date()): Promise<CreateResult> {
  const picked = pickItems(db, n);
  if (picked.length === 0) return { created: 0, failed: [] };

  let results: (GenCard | string)[];
  try {
    results = matchCards(picked.length, await generate(picked.map(toGenItem)));
  } catch (e) {
    const reason = `생성 호출 실패: ${(e as Error).message}`;
    results = picked.map(() => reason);
  }

  const failed: CreateResult["failed"] = [];
  const fsrs = createEmptyCard(now);
  const rows = picked.flatMap((it, i) => {
    const r = results[i];
    if (typeof r === "string") {
      failed.push({ headword: it.headword, reason: r });
      return [];
    }
    return [
      {
        itemId: it.id,
        senseKo: r.sense_ko.trim(),
        exampleEn: r.example_en.trim(),
        exampleKo: r.example_ko.trim(),
        createdAt: now,
        updatedAt: now,
        due: fsrs.due,
        stability: fsrs.stability,
        difficulty: fsrs.difficulty,
        elapsedDays: fsrs.elapsed_days,
        scheduledDays: fsrs.scheduled_days,
        learningSteps: fsrs.learning_steps,
        reps: fsrs.reps,
        lapses: fsrs.lapses,
        state: fsrs.state,
        lastReview: null,
      },
    ];
  });

  // 버튼을 두 번 눌러 같은 항목이 겹치면 먼저 저장된 카드를 남긴다.
  const saved = new Set(
    rows.length
      ? db.insert(cards).values(rows).onConflictDoNothing({ target: cards.itemId }).returning({ itemId: cards.itemId }).all().map((r) => r.itemId)
      : [],
  );
  for (const r of rows) {
    if (!saved.has(r.itemId)) failed.push({ headword: picked.find((it) => it.id === r.itemId)!.headword, reason: "이미 카드가 있음" });
  }
  return { created: saved.size, failed };
}
