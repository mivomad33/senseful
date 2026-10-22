// 사용자 설정 입력 확인 단위 테스트(문서 4.2-6).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSettings } from "./settings";

test("하루 새 카드 수는 1~20장만 받는다", () => {
  for (const n of [1, 5, 10, 20]) assert.equal(parseSettings({ newPerDay: n, excludedLevels: [] }).ok, true);
  for (const n of [0, 21, -1, 2.5, Number.NaN]) assert.equal(parseSettings({ newPerDay: n, excludedLevels: [] }).ok, false);
  assert.equal(parseSettings({ newPerDay: "5", excludedLevels: [] }).ok, false);
});

test("레벨은 하나 이상 남겨야 하고, 알 수 없는 레벨은 받지 않는다", () => {
  const all = parseSettings({ newPerDay: 10, excludedLevels: ["a1", "a2", "b1", "b2", "c1"] });
  assert.deepEqual(all, { ok: false, error: "레벨을 모두 제외할 수는 없습니다. 하나 이상 남겨 주세요." });
  assert.equal(parseSettings({ newPerDay: 10, excludedLevels: ["c2"] }).ok, false);
  // 순서는 레벨 순으로, 중복은 하나로 정리한다.
  assert.deepEqual(parseSettings({ newPerDay: 10, excludedLevels: ["b1", "a1", "a1"] }), { ok: true, settings: { newPerDay: 10, excludedLevels: ["a1", "b1"] } });
});
