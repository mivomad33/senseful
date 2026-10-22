// 원격 DB를 로컬 파일로 백업한다. 사용: npm run db:backup [-- --dev] [-- 저장할 폴더]
// 복원: psql "<주소>" -f <백업 파일> (README "백업과 복원")
import "./env";
import { backupDb, BACKUP_DIR } from "./lib/backup";
import { target } from "./lib/target";

async function main() {
  const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) || BACKUP_DIR;
  const t = target();
  console.log(`백업: ${t.name} DB → ${await backupDb(t, dir)}`);
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
