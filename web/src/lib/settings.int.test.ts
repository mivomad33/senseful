// 사용자 설정 저장 통합 테스트(문서 4.2-6): 바꾸면 그날 오늘의 학습에 바로 반영되고, 범위 밖 값은 저장하지 않는다.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { todayCounts } from "@/lib/study/schedule";
import { addCard, addUser, db, reset, T0 } from "../../test/helpers";
import { saveSettings } from "./settings";

beforeEach(reset);

const load = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0];

test("하루 새 카드 수를 5로 바꾸면 그날 새 카드가 5장까지만 나오고, 범위 밖 값과 레벨 모두 제외는 저장되지 않는다", async () => {
  for (let i = 0; i < 8; i++) await addCard(`a${i}`);
  for (let i = 0; i < 8; i++) await addCard(`b${i}`, { level: "b1" });
  const u = await addUser({ newPerDay: 10 });
  assert.equal((await saveSettings(db, u.id, { newPerDay: 5, excludedLevels: [] })).ok, true);
  assert.equal((await todayCounts(db, await load(u.id), T0)).new, 5);

  for (const bad of [{ newPerDay: 0, excludedLevels: [] }, { newPerDay: 21, excludedLevels: [] }, { newPerDay: 5, excludedLevels: ["a1", "a2", "b1", "b2", "c1"] }]) {
    assert.equal((await saveSettings(db, u.id, bad)).ok, false);
  }
  const saved = await load(u.id);
  assert.deepEqual({ n: saved.newPerDay, ex: saved.excludedLevels }, { n: 5, ex: [] });

  await saveSettings(db, u.id, { newPerDay: 20, excludedLevels: ["a1"] });
  const c = await todayCounts(db, await load(u.id), T0);
  assert.equal(c.new, 8); // A1을 빼면 B1 8장뿐이다
});
