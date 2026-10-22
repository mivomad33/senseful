import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceLeak } from "./create";

const def = "an opportunity to take part in something, especially to study at a school";
const leak = sourceLeak([def]);
const card = (over: Partial<{ sense_ko: string; example_en: string; example_ko: string }>) => ({ id: 0, sense_ko: "뜻", example_en: "Example.", example_ko: "예문.", ...over });

test("뜻풀이 원문이 카드의 어느 필드에 그대로 들어가도 걸린다", () => {
  assert.equal(leak(card({ example_en: `She said it was ${def}.` })), "뜻풀이 원문이 들어 있음");
  assert.equal(leak(card({ sense_ko: `자리(${def})` })), "뜻풀이 원문이 들어 있음");
  assert.equal(leak(card({ example_ko: def })), "뜻풀이 원문이 들어 있음");
});

test("출처 이름과 같은 일반 단어나 원문 일부는 걸리지 않는다", () => {
  assert.equal(leak(card({ example_en: "She got a place at Edinburgh to study law.", example_ko: "그녀는 에든버러에서 법을 공부할 자리를 얻었다." })), null);
  assert.equal(leak(card({ example_en: "It was an opportunity to take part in something new." })), null);
});
