// 학습일 경계 테스트(문서 4.2-4). 서버 시간대와 상관없이 한국 시간 새벽 4시에 바뀐다. npm test는 TZ=UTC로 돈다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dayKey, dayRange, weekday } from "./day";

const kst = (s: string) => new Date(`${s}+09:00`);

test("서버 시간대가 UTC여도 학습일은 한국 시간 새벽 4시에 바뀐다", () => {
  assert.equal(new Date(0).getTimezoneOffset(), 0, "TZ=UTC로 실행해야 합니다");
  const before = dayRange(kst("2026-10-18T03:59:59"), 4);
  assert.deepEqual(before.start, kst("2026-10-17T04:00:00"));
  assert.deepEqual(before.end, kst("2026-10-18T04:00:00"));
  assert.equal(dayKey(kst("2026-10-18T03:59:00"), 4), "2026-10-17");
  const after = dayRange(kst("2026-10-18T04:00:00"), 4);
  assert.deepEqual(after.start, kst("2026-10-18T04:00:00"));
  assert.equal(dayKey(kst("2026-10-18T04:00:00"), 4), "2026-10-18");
});

test("자정을 넘겨도 새벽 4시 전이면 전날이다", () => {
  assert.equal(dayKey(kst("2026-10-18T00:30:00"), 4), "2026-10-17");
  assert.equal(dayKey(kst("2026-10-17T23:59:00"), 4), "2026-10-17");
  assert.equal(dayKey(kst("2026-01-01T02:00:00"), 4), "2025-12-31");
});

test("하루가 바뀌는 시각은 설정값을 따른다", () => {
  assert.equal(dayKey(kst("2026-10-18T05:59:00"), 6), "2026-10-17");
  assert.equal(dayKey(kst("2026-10-18T06:00:00"), 6), "2026-10-18");
  assert.equal(dayKey(kst("2026-10-18T00:00:00"), 0), "2026-10-18");
});

test("요일과 날짜 더하기는 한국 날짜 기준이다", () => {
  const { start } = dayRange(kst("2026-10-19T10:00:00"), 4); // 월요일
  assert.equal(weekday(start), "월");
  assert.equal(dayKey(addDays(start, -1), 4), "2026-10-18");
  assert.equal(weekday(addDays(start, -1)), "일");
});
