// 홈 통계의 표시 계산 단위 테스트(퍼센트, 남은 기간).
import assert from "node:assert/strict";
import { test } from "node:test";
import { daysLeft, formatDays, percent } from "./stats";

test("퍼센트는 소수점 한 자리까지, 반올림으로 0%·100%가 되는 값은 <0.1%·>99.9%로 보인다", () => {
  assert.equal(percent(40, 2319), "1.7%");
  assert.equal(percent(0, 2319), "0%");
  assert.equal(percent(0, 0), "0%");
  assert.equal(percent(1, 2319), "<0.1%");
  assert.equal(percent(2319, 2319), "100%");
  assert.equal(percent(1, 2), "50%");
  assert.equal(percent(2318, 2319), ">99.9%");
});

test("남은 날 수는 하루 새 카드 수로 나눠 올림하고, 30일·12개월을 넘으면 개월·년으로 보인다", () => {
  assert.equal(daysLeft(2299, 20), 115);
  assert.equal(daysLeft(2299, 10), 230);
  assert.equal(daysLeft(20, 20), 1);
  assert.equal(daysLeft(21, 20), 2);
  assert.equal(daysLeft(0, 20), 0);

  assert.equal(formatDays(0), "완료");
  assert.equal(formatDays(1), "1일");
  assert.equal(formatDays(29), "29일");
  assert.equal(formatDays(30), "1개월");
  assert.equal(formatDays(115), "3개월 25일");
  assert.equal(formatDays(359), "11개월 29일");
  // 12개월 이상은 일을 생략하고 개월을 올림한다.
  assert.equal(formatDays(360), "1년");
  assert.equal(formatDays(361), "1년 1개월");
  assert.equal(formatDays(678), "1년 11개월");
  assert.equal(formatDays(720), "2년");
});
