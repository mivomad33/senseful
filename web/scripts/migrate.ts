// 마이그레이션을 원격 DB에 적용한다. 사용: npm run db:migrate [-- --dev]
// 운영 DB는 적용 전에 자동으로 백업한다.
import "./env";
import { migrateDb } from "@/db/migrate";
import { backupBeforeChange, target } from "./lib/target";

async function main() {
  const t = target();
  await backupBeforeChange(t);
  await migrateDb(t.url);
  console.log(`마이그레이션 적용: ${t.name} DB`);
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
