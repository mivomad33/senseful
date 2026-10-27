import assert from "node:assert/strict";
import { test } from "node:test";
import { dueText } from "./format";

const now = Date.UTC(2026, 9, 27, 3, 0);
const min = 60_000;

test("다음 복습 문구: 남은 시간이 있으면 그대로, 시각이 지났으면 지금 볼 수 있다고 보인다", () => {
  assert.equal(dueText(now + 10 * min, true, now), "다음 복습 10분 뒤");
  assert.equal(dueText(now + 1 * min, false, now), "1분 뒤 다시 나옵니다");
  assert.equal(dueText(now - 5 * min, false, now), "지금 다시 볼 수 있습니다");
  assert.equal(dueText(now - 5 * min, true, now), "지금 복습할 수 있습니다");
  // 0분으로 반올림되는 남은 시간(30초 미만)도 지금으로 본다.
  assert.equal(dueText(now + 20_000, false, now), "지금 다시 볼 수 있습니다");
});
