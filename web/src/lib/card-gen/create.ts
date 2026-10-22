// 카드 생성(문서 4.3-2). 관리자가 로컬 맥에서 명령으로 실행한다(scripts/generate-cards.ts).
// 원격 DB에서 카드가 없는 항목을 고르고, 생성 입력(뜻풀이 등)은 로컬 수집 DB에서 읽는다. 결과 카드는 원격 DB에 바로 저장한다.
// 생성이 실패한 항목은 저장하지 않는다. 카드가 없는 항목으로 남아 다음 실행 때 다시 후보가 된다.
import { asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { cards, items } from "@/db/schema";
import type { Level } from "@/lib/study/schedule";
import type { GenCard, GenItem } from "./prompt";

export interface GenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** 항목 목록을 받아 카드 목록을 돌려준다. 실제로는 Claude API를 부르고, 테스트에서는 바꿔 끼운다. */
export type Generate = (items: GenItem[]) => Promise<{ cards: GenCard[]; usage: GenUsage }>;

/** 원격 항목 id로 생성 입력을 찾는다(로컬 수집 DB). 없는 id는 빠진다. */
export type LoadInputs = (ids: number[]) => Map<number, GenItem>;

/** 생성된 카드 내용에 들어가면 안 되는 것이 있는지(원문 문자열, 금지 문자열). 있으면 이유를 돌려준다. */
export type LeakCheck = (card: GenCard) => string | null;

export interface CreateResult {
  created: number;
  failed: { itemId: number; headword: string; reason: string }[];
  usage: GenUsage;
}

type ItemRow = typeof items.$inferSelect;

/**
 * 카드가 없는 항목(뺀 카드도 카드 행이 남으므로 제외된다) n개를 고른다.
 * level이 없으면 레벨이 낮은 것부터, 있으면 그 레벨에서만 고른다. 레벨 안에서는 랜덤이다.
 */
export async function pickItems(db: Db, n: number, level?: Level): Promise<ItemRow[]> {
  const rows = await db
    .select({ item: items })
    .from(items)
    .leftJoin(cards, eq(cards.itemId, items.id))
    .where(level ? sql`${cards.id} is null and ${items.cefr} = ${level}` : isNull(cards.id))
    .orderBy(asc(items.cefr), sql`random()`)
    .limit(n);
  return rows.map((r) => r.item);
}

/** 응답에서 항목 번호마다 쓸 수 있는 카드를 찾는다. 없으면 실패 이유를 둔다. */
function matchCards(n: number, out: GenCard[], leak: LeakCheck): (GenCard | string)[] {
  return Array.from({ length: n }, (_, i) => {
    const found = out.filter((c) => c.id === i);
    if (found.length === 0) return "응답에 없음";
    if (found.length > 1) return "응답에 같은 번호가 여러 번 나옴";
    const c = { ...found[0], sense_ko: found[0].sense_ko?.trim(), example_en: found[0].example_en?.trim(), example_ko: found[0].example_ko?.trim() };
    const empty = (["sense_ko", "example_en", "example_ko"] as const).filter((f) => !c[f]);
    if (empty.length) return `빈 필드(${empty.join(", ")})`;
    return leak(c) ?? c;
  });
}

export const BATCH_SIZE = 20;

export interface CreateOptions {
  level?: Level;
  /** 원문·금지 문자열 때문에 실패한 항목을 같은 실행에서 다시 생성하는 횟수 */
  leakRetries?: number;
  onBatch?: (done: number, total: number, r: CreateResult) => void;
  now?: Date;
}

/** n개 항목을 골라 BATCH_SIZE개씩 생성하고 저장한다. n은 이번 실행에서 새로 만들 장수다. */
export async function createCards(db: Db, generate: Generate, loadInputs: LoadInputs, leak: LeakCheck, n: number, opts: CreateOptions = {}): Promise<CreateResult> {
  const now = opts.now ?? new Date();
  const result: CreateResult = { created: 0, failed: [], usage: { inputTokens: 0, outputTokens: 0 } };
  const picked = await pickItems(db, n, opts.level);
  const inputs = loadInputs(picked.map((it) => it.id));
  let queue = picked.map((it) => ({ it, tries: 0 }));
  let done = 0;

  while (queue.length) {
    const batch = queue.slice(0, BATCH_SIZE);
    queue = queue.slice(BATCH_SIZE);
    const usable = batch.filter((b) => {
      if (inputs.has(b.it.id)) return true;
      result.failed.push({ itemId: b.it.id, headword: b.it.headword, reason: "로컬 수집 DB에 항목이 없음" });
      return false;
    });

    let results: (GenCard | string)[];
    try {
      const out = await generate(usable.map((b) => inputs.get(b.it.id)!));
      result.usage.inputTokens += out.usage.inputTokens;
      result.usage.outputTokens += out.usage.outputTokens;
      results = matchCards(usable.length, out.cards, leak);
    } catch (e) {
      results = usable.map(() => `생성 호출 실패: ${(e as Error).message}`);
    }

    const rows: (typeof cards.$inferInsert)[] = [];
    usable.forEach((b, i) => {
      const r = results[i];
      if (typeof r !== "string") {
        rows.push({ itemId: b.it.id, senseKo: r.sense_ko, exampleEn: r.example_en, exampleKo: r.example_ko, createdAt: now, updatedAt: now });
      } else if (r.startsWith("금지") && b.tries < (opts.leakRetries ?? 1)) {
        queue.push({ it: b.it, tries: b.tries + 1 }); // 다시 생성한다
      } else {
        result.failed.push({ itemId: b.it.id, headword: b.it.headword, reason: r });
      }
    });

    // 두 번 실행해 같은 항목이 겹치면 먼저 저장된 카드를 남긴다.
    const saved = new Set(
      rows.length
        ? (await db.insert(cards).values(rows).onConflictDoNothing({ target: cards.itemId }).returning({ itemId: cards.itemId })).map((r) => r.itemId)
        : [],
    );
    for (const r of rows) {
      if (!saved.has(r.itemId)) result.failed.push({ itemId: r.itemId, headword: picked.find((it) => it.id === r.itemId)!.headword, reason: "이미 카드가 있음" });
    }
    result.created += saved.size;
    done = picked.length - queue.length;
    opts.onBatch?.(done, picked.length, result);
  }
  return result;
}
