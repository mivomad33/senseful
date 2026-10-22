// 소개 화면 체험 카드 판정 규칙 테스트(문서 4.5-1): 예시 답 ①은 맞음, ②는 틀림.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO, demoGrade } from "./content";

test("예시 답 ①은 맞음, ②는 틀림이다", () => {
  assert.equal(demoGrade(DEMO.samples[0]), true);
  assert.equal(demoGrade(DEMO.samples[1]), false);
  assert.equal(demoGrade(""), false);
  assert.equal(demoGrade("그 여자는 동네에서 조그만 빵집을 하고 있다"), true);
});
