// DB를 한 파일로 백업한다. 사용: npm run db:backup [-- 저장할 폴더]
import "./env";
import { backupDb, formatCounts } from "@/db/backup";

async function main() {
  const r = await backupDb(process.argv[2]);
  console.log(`백업: ${r.path} (${formatCounts(r.counts)})`);
}

main();
