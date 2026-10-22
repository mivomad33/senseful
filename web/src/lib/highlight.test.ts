import { test } from "node:test";
import assert from "node:assert/strict";
import { findHeadword } from "./highlight";

const marked = (s: string, h: string) => {
  const r = findHeadword(s, h);
  return r && s.slice(r[0], r[1]);
};

test("표제어와 규칙 활용형을 찾는다", () => {
  assert.equal(marked("We shared the pizza between the four of us.", "share"), "shared");
  assert.equal(marked("She sang a beautiful song.", "song"), "song");
  assert.equal(marked("He is running late.", "run"), "running");
  assert.equal(marked("The babies cried.", "baby"), "babies");
  assert.equal(marked("Of course I'll help.", "of"), "Of");
});

test("다른 단어의 일부나 불규칙 활용은 찾지 않는다", () => {
  assert.equal(marked("I left my umbrella at the restaurant.", "a"), null);
  assert.equal(marked("They went home.", "go"), null);
  assert.equal(marked("I've never heard of that singer.", "sing"), null);
});

test("구는 자리 표시를 빼고 예문에 그대로 있을 때만 찾는다", () => {
  assert.equal(marked("I get on with my sister.", "get on with sb"), "get on with");
  assert.equal(marked("She got on with her work.", "get on with sth"), null);
});
