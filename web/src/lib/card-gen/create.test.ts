// 새 카드 만들기 테스트. Claude API 대신 가짜 생성 함수를 넣어 고르기와 실패 처리를 확인한다. 사용: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import { cards, items } from "@/db/schema";
import { createCards, pickItems, type Generate } from "./create";

type Level = "a1" | "a2" | "b1" | "b2" | "c1";

function setup(levels: Record<string, number>): Db {
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const rows = Object.entries(levels).flatMap(([cefr, n]) =>
    Array.from({ length: n }, (_, i) => ({
      key: `word:${cefr}_${i}`,
      kind: "word" as const,
      headword: `${cefr}-${i}`,
      dictSenseId: `${cefr}_${i}`,
      cefr: cefr as Level,
      definition: `def ${cefr} ${i}`,
      sourceSlug: `${cefr}_${i}`,
      collectedAt: new Date(0),
    })),
  );
  db.insert(items).values(rows).run();
  return db;
}

// 입력마다 카드를 만드는 정상 생성 함수
const ok: Generate = async (input) =>
  input.map((it, id) => ({ id, sense_ko: `뜻 ${it.headword}`, example_en: `Example ${it.headword}.`, example_ko: `예문 ${it.headword}.` }));

test("가장 낮은 레벨부터 고르고 모자라면 다음 레벨에서 채운다", () => {
  const db = setup({ b1: 30, a1: 5, a2: 30 });
  const picked = pickItems(db, 20);
  assert.equal(picked.length, 20);
  assert.equal(picked.filter((p) => p.cefr === "a1").length, 5);
  assert.equal(picked.filter((p) => p.cefr === "a2").length, 15);
});

test("레벨 안에서는 랜덤으로 고른다", () => {
  const db = setup({ a1: 200 });
  const a = pickItems(db, 20).map((p) => p.id).join();
  const b = pickItems(db, 20).map((p) => p.id).join();
  assert.notEqual(a, b);
});

test("정상 생성이면 20장을 저장하고 FSRS 새 카드 상태로 둔다", async () => {
  const db = setup({ a1: 25 });
  const now = new Date("2026-10-17T00:00:00Z");
  const r = await createCards(db, ok, 20, now);
  assert.deepEqual(r, { created: 20, failed: [] });
  const saved = db.select().from(cards).all();
  assert.equal(saved.length, 20);
  for (const c of saved) {
    assert.equal(c.state, 0);
    assert.equal(c.reps, 0);
    assert.equal(c.due.getTime(), now.getTime());
    assert.match(c.senseKo, /^뜻 a1-/);
  }
});

test("카드가 있는 항목과 뺀 카드의 항목은 다시 고르지 않는다", async () => {
  const db = setup({ a1: 25 });
  await createCards(db, ok, 20);
  db.update(cards).set({ excludedAt: new Date() }).run();
  const r = await createCards(db, ok, 20);
  assert.equal(r.created, 5);
  assert.equal(db.select().from(cards).all().length, 25);
  assert.deepEqual(await createCards(db, ok, 20), { created: 0, failed: [] });
});

test("응답에 빠진 항목, 중복 번호, 빈 필드는 저장하지 않고 이유를 알린다", async () => {
  const db = setup({ a1: 20 });
  const bad: Generate = async (input) => {
    const out = await ok(input);
    out[3].example_ko = "  ";
    return [...out.filter((c) => c.id !== 0 && c.id !== 1), { ...out[5] }];
  };
  const r = await createCards(db, bad, 20);
  assert.equal(r.created, 16);
  assert.deepEqual(r.failed.map((f) => f.reason).sort(), ["빈 필드(example_ko)", "응답에 같은 번호가 여러 번 나옴", "응답에 없음", "응답에 없음"]);
  const failedIds = new Set(r.failed.map((f) => f.headword));
  const savedIds = new Set(db.select({ itemId: cards.itemId }).from(cards).all().map((c) => c.itemId));
  const savedNames = db.select().from(items).all().filter((it) => savedIds.has(it.id)).map((it) => it.headword);
  assert.equal(savedNames.filter((h) => failedIds.has(h)).length, 0);
});

test("생성 호출이 실패하면 아무것도 저장하지 않고 전부 실패로 알린다", async () => {
  const db = setup({ a1: 20 });
  const r = await createCards(db, async () => { throw new Error("overloaded"); }, 20);
  assert.equal(r.created, 0);
  assert.equal(r.failed.length, 20);
  assert.equal(r.failed[0].reason, "생성 호출 실패: overloaded");
  assert.equal(db.select().from(cards).all().length, 0);
});

test("범위 밖 번호는 무시하고, 실패한 항목은 다음 번에 다시 후보가 된다", async () => {
  const db = setup({ a1: 3 });
  const once: Generate = async (input) => [...(await ok(input)).slice(1), { id: 99, sense_ko: "x", example_en: "x", example_ko: "x" }];
  const r1 = await createCards(db, once, 20);
  assert.equal(r1.created, 2);
  assert.equal(r1.failed.length, 1);
  const r2 = await createCards(db, ok, 20);
  assert.deepEqual(r2, { created: 1, failed: [] });
});
