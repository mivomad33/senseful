// E2E 테스트 실행: 테스트 DB를 준비하고(스키마를 지우고 마이그레이션) 카드를 넣은 뒤 Playwright를 돌린다.
// 사용: npm run test:e2e [-- Playwright 인자]
import "../../scripts/env";
import { execFileSync, spawnSync } from "node:child_process";
import { openDb } from "@/db";
import { cards, items } from "@/db/schema";

async function main() {
  const url = execFileSync("npx", ["tsx", "test/setup-db.ts"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const { db, pool } = openDb(url, 1);
  // A1 10장, A2 10장. 표제어가 모두 달라 형제 미루기가 끼지 않는다.
  const rows = [...Array(20).keys()].map((i) => ({ id: i + 1, kind: "word" as const, headword: `word${i + 1}`, pos: "noun", cefr: (i < 10 ? "a1" : "a2") as "a1" | "a2" }));
  await db.insert(items).values(rows);
  await db.insert(cards).values(rows.map((r) => ({ itemId: r.id, senseKo: `뜻 ${r.id}`, exampleEn: `This is example number ${r.id}.`, exampleKo: `이것은 ${r.id}번 예문이다.` })));
  await pool.end();
  const r = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, E2E_DATABASE_URL: url } });
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(`E2E 준비 실패: ${(e as Error).message}`);
  process.exit(1);
});
