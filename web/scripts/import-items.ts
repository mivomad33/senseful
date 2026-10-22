// 사전 수집 결과(JSON)를 items로 옮긴다. 사용: npm run db:import -- <파일 경로>
// 다시 실행하면 key가 같은 항목은 내용을 갱신하고 새 항목은 더한다. 수집 결과에서 사라진 항목은 지우지 않고 수만 알린다.
import "./env";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { config } from "@/config";
import { openDb } from "@/db";
import { items } from "@/db/schema";

interface CollectedItem {
  key: string;
  kind: "word" | "idiom" | "phrasal_verb" | "phrase";
  headword: string;
  pos: string | null;
  level: "a1" | "a2" | "b1" | "b2" | "c1";
  senseId: string;
  shortcut: string | null;
  grammar: string | null;
  labels: string | null;
  def: string;
  page: string;
}

if (!process.argv[2]) throw new Error("사용: npm run db:import -- <수집 결과 JSON 경로>");
const file = path.resolve(process.argv[2]);
const data = JSON.parse(fs.readFileSync(file, "utf8")) as { collectedAt: string; items: CollectedItem[] };
const collectedAt = new Date(data.collectedAt);
if (Number.isNaN(collectedAt.getTime())) throw new Error(`collectedAt을 읽을 수 없다: ${data.collectedAt}`);

const rows = data.items.map((it) => {
  if (!it.def?.trim()) throw new Error(`뜻풀이가 비었다: ${it.key}`);
  return {
    key: it.key,
    kind: it.kind,
    headword: it.headword,
    dictSenseId: it.senseId,
    pos: it.pos,
    cefr: it.level,
    shortcut: it.shortcut,
    grammar: it.grammar,
    labels: it.labels,
    definition: it.def,
    sourceSlug: it.page,
    collectedAt,
  };
});

const db = openDb();
const before = db.select({ n: sql<number>`count(*)` }).from(items).get()!.n;

db.transaction((tx) => {
  for (let i = 0; i < rows.length; i += 500) {
    tx.insert(items)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: items.key,
        set: {
          kind: sql`excluded.kind`,
          headword: sql`excluded.headword`,
          dictSenseId: sql`excluded.dict_sense_id`,
          pos: sql`excluded.pos`,
          cefr: sql`excluded.cefr`,
          shortcut: sql`excluded.shortcut`,
          grammar: sql`excluded.grammar`,
          labels: sql`excluded.labels`,
          definition: sql`excluded.definition`,
          sourceSlug: sql`excluded.source_slug`,
          collectedAt: sql`excluded.collected_at`,
        },
      })
      .run();
  }
});

const keys = new Set(rows.map((r) => r.key));
const all = db.select({ key: items.key }).from(items).all();
const stale = all.filter((r) => !keys.has(r.key)).length;

console.log(`가져온 파일: ${file} (수집 ${data.collectedAt})`);
console.log(`DB: ${config.dbPath}`);
console.log(`items ${before} → ${all.length}개 (파일 ${rows.length}개${stale ? `, 파일에 없는 기존 항목 ${stale}개` : ""})`);

// 종류 × 레벨 집계. eval/card-gen/results/collection/full-report.md 2장과 대조한다.
const counts = db
  .select({ kind: items.kind, cefr: items.cefr, n: sql<number>`count(*)` })
  .from(items)
  .groupBy(items.kind, items.cefr)
  .all();
const levels = ["a1", "a2", "b1", "b2", "c1"] as const;
const kinds = ["word", "idiom", "phrasal_verb", "phrase"] as const;
const get = (k: string, l: string) => counts.find((c) => c.kind === k && c.cefr === l)?.n ?? 0;
const table = [
  ...kinds.map((k) => ({ kind: k, ...Object.fromEntries(levels.map((l) => [l, get(k, l)])), total: levels.reduce((s, l) => s + get(k, l), 0) })),
  { kind: "합계", ...Object.fromEntries(levels.map((l) => [l, kinds.reduce((s, k) => s + get(k, l), 0)])), total: all.length },
];
console.table(table);
