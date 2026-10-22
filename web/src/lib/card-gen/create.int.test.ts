// 카드 생성 통합 테스트. Claude API 대신 가짜 생성 함수를 넣어 항목 고르기, 저장, 실패 처리, 원문 검사를 확인한다.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import { addCard, addItem, db, reset } from "../../../test/helpers";
import { createCards, pickItems, type Generate, type LeakCheck, type LoadInputs } from "./create";
import type { GenItem } from "./prompt";

beforeEach(reset);

const load: LoadInputs = (ids) => new Map(ids.map((id) => [id, { kind: "word", headword: `h${id}`, pos: null, level: "a1", shortcut: null, grammar: null, labels: null, def: `def ${id}` } satisfies GenItem]));
const noLeak: LeakCheck = () => null;
const ok: Generate = async (its) => ({
  cards: its.map((it, i) => ({ id: i, sense_ko: `뜻 ${it.headword}`, example_en: `Example ${it.headword}.`, example_ko: "예문." })),
  usage: { inputTokens: 100, outputTokens: 50 },
});

test("가장 낮은 레벨부터 고르고 모자라면 다음 레벨에서 채운다", async () => {
  for (const l of ["b1", "a2", "a1", "a2"] as const) await addItem(`w-${l}`, l);
  const picked = await pickItems(db, 3);
  assert.deepEqual(picked.map((p) => p.cefr), ["a1", "a2", "a2"]);
});

test("레벨을 지정하면 그 레벨에서만 고르고, 모자라면 있는 만큼만 고른다", async () => {
  for (const l of ["a1", "b1", "b1", "c1"] as const) await addItem(`w-${l}`, l);
  const picked = await pickItems(db, 5, "b1");
  assert.deepEqual(picked.map((p) => p.cefr), ["b1", "b1"]);
});

test("레벨 안에서는 랜덤으로 고른다", async () => {
  for (let i = 0; i < 30; i++) await addItem(`w${i}`);
  const runs = new Set<string>();
  for (let i = 0; i < 4; i++) runs.add((await pickItems(db, 5)).map((p) => p.id).join(","));
  assert.ok(runs.size > 1);
});

test("20장씩 묶어 생성해 저장하고, 다시 실행하면 카드가 있는 항목과 뺀 카드의 항목은 고르지 않는다", async () => {
  for (let i = 0; i < 45; i++) await addItem(`w${i}`);
  const batches: number[] = [];
  const gen: Generate = async (its) => (batches.push(its.length), ok(its));
  const r = await createCards(db, gen, load, noLeak, 25);
  assert.deepEqual(batches, [20, 5]);
  assert.equal(r.created, 25);
  assert.deepEqual(r.usage, { inputTokens: 200, outputTokens: 100 });
  const [first] = await db.select().from(cards).limit(1);
  await db.update(cards).set({ excludedAt: new Date() }).where(eq(cards.id, first.id));
  const again = await createCards(db, ok, load, noLeak, 100);
  assert.equal(again.created, 20);
  assert.equal((await db.select().from(cards)).length, 45);
  assert.equal((await pickItems(db, 10)).length, 0);
});

test("이미 카드가 있는 항목은 고르지 않는다", async () => {
  await addCard("has");
  const free = await addItem("free");
  assert.deepEqual((await pickItems(db, 10)).map((p) => p.id), [free]);
});

test("응답에 빠진 항목, 중복 번호, 빈 필드는 저장하지 않고 이유를 알린다", async () => {
  for (let i = 0; i < 4; i++) await addItem(`w${i}`);
  const bad: Generate = async () => ({
    cards: [
      { id: 0, sense_ko: "뜻", example_en: "A.", example_ko: "가." },
      { id: 1, sense_ko: "뜻", example_en: "B.", example_ko: "나." },
      { id: 1, sense_ko: "뜻", example_en: "B2.", example_ko: "나2." },
      { id: 2, sense_ko: " ", example_en: "C.", example_ko: "다." },
      { id: 9, sense_ko: "뜻", example_en: "Z.", example_ko: "하." },
    ],
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  const r = await createCards(db, bad, load, noLeak, 4);
  assert.equal(r.created, 1);
  assert.deepEqual(r.failed.map((f) => f.reason).sort(), ["빈 필드(sense_ko)", "응답에 같은 번호가 여러 번 나옴", "응답에 없음"].sort());
});

test("생성 호출이 실패하면 아무것도 저장하지 않고, 실패한 항목은 다음 실행 때 다시 후보가 된다", async () => {
  for (let i = 0; i < 3; i++) await addItem(`w${i}`);
  const fail: Generate = async () => {
    throw new Error("overloaded");
  };
  const r = await createCards(db, fail, load, noLeak, 3);
  assert.equal(r.created, 0);
  assert.ok(r.failed.every((f) => f.reason === "생성 호출 실패: overloaded"));
  assert.equal((await pickItems(db, 10)).length, 3);
});

test("원문 검사에 걸린 카드는 실패로 보고 다시 생성하며, 다시 실패하면 저장하지 않는다", async () => {
  for (let i = 0; i < 2; i++) await addItem(`w${i}`);
  let calls = 0;
  const leaky: Generate = async (its) => {
    calls++;
    return { cards: its.map((_, i) => ({ id: i, sense_ko: "뜻", example_en: calls === 1 && i === 0 ? "LEAK here." : "Clean.", example_ko: "예문." })), usage: { inputTokens: 1, outputTokens: 1 } };
  };
  const leak: LeakCheck = (c) => (c.example_en.includes("LEAK") ? "뜻풀이 원문이 들어 있음" : null);
  const r = await createCards(db, leaky, load, leak, 2);
  assert.equal(calls, 2); // 걸린 항목만 다시 생성
  assert.equal(r.created, 2);
  assert.ok((await db.select().from(cards)).every((c) => !c.exampleEn.includes("LEAK")));

  await reset();
  await addItem("w");
  const always: Generate = async (its) => ({ cards: its.map((_, i) => ({ id: i, sense_ko: "뜻", example_en: "LEAK.", example_ko: "예문." })), usage: { inputTokens: 1, outputTokens: 1 } });
  const r2 = await createCards(db, always, load, leak, 1);
  assert.equal(r2.created, 0);
  assert.equal(r2.failed[0].reason, "뜻풀이 원문이 들어 있음");
});
