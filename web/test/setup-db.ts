// 통합·E2E 테스트용 DB를 준비하고 접속 주소를 표준 출력으로 내보낸다. 사용: TEST_DATABASE_URL=$(tsx test/setup-db.ts)
// Neon의 테스트 전용 브랜치(test)를 쓴다. 운영·개발 브랜치는 건드리지 않는다.
// test는 운영 브랜치에서 분기한다. dev 아래에 두면 Neon이 dev를 운영 상태로 되돌리는 것(db:dev-reset)을 막기 때문이다.
// 테스트 브랜치의 스키마를 지우고 마이그레이션을 처음부터 적용해, 지난 실행의 데이터와 스키마가 남지 않게 한다.
import "../scripts/env";
import { Client } from "pg";
import { migrateDb } from "@/db/migrate";
import { connectionUri, deleteBranch, ensureBranch, listBranches } from "../scripts/lib/neon";

async function main() {
  const devId = process.env.NEON_DEV_BRANCH_ID;
  const prodId = process.env.NEON_PROD_BRANCH_ID;
  if (!devId || !prodId) throw new Error("NEON_DEV_BRANCH_ID·NEON_PROD_BRANCH_ID가 없습니다");
  const old = (await listBranches()).find((b) => b.name === "test" && b.parent_id !== prodId);
  if (old) await deleteBranch(old.id); // 예전에 dev에서 분기한 테스트 브랜치
  const branch = await ensureBranch("test", prodId);
  if ([process.env.NEON_PROD_BRANCH_ID, devId].includes(branch.id)) throw new Error("테스트 브랜치가 운영·개발 브랜치와 같습니다");
  const url = await connectionUri(branch.id);
  const c = new Client({ connectionString: url.replace("sslmode=require", "sslmode=verify-full") });
  await c.connect();
  await c.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
  await c.end();
  await migrateDb(url);
  process.stdout.write(url);
}

main().catch((e) => {
  console.error(`테스트 DB 준비 실패: ${(e as Error).message}`);
  process.exit(1);
});
