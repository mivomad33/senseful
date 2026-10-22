// 학습 기록을 초기화한다. 사용: npm run db:reset-progress
// 먼저 DB를 백업하고(실패하면 멈춘다), 확인을 받은 뒤 복습 기록을 모두 지우고 카드를 새 카드로 되돌린다.
// 카드 내용과 빼기 표시는 그대로 둔다. 되돌리려면 출력된 백업 파일로 복원한다(README "DB 백업과 복원").
import "./env";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { count } from "drizzle-orm";
import { config } from "@/config";
import { backupDb, formatCounts } from "@/db/backup";
import { cards, reviewLogs } from "@/db/schema";
import { resetProgress } from "@/lib/study/reset";

async function main() {
  // @/db는 불러오는 순간 연결을 열어 파일이 없으면 빈 DB를 만들므로, 먼저 확인하고 나중에 불러온다.
  if (!fs.existsSync(config.dbPath)) throw new Error(`DB가 없다: ${config.dbPath}`);
  const { db } = await import("@/db");
  const [{ logs }] = db.select({ logs: count() }).from(reviewLogs).all();
  const [{ n }] = db.select({ n: count() }).from(cards).all();
  console.log(`DB: ${config.dbPath}`);
  console.log(`복습 기록 ${logs}건을 지우고 카드 ${n}장을 새 카드로 되돌린다. 카드 내용과 빼기 표시는 그대로 둔다.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("계속하려면 y를 입력한다: ")).trim().toLowerCase();
  rl.close();
  if (answer !== "y") {
    console.log("취소했다. 바뀐 것은 없다.");
    return;
  }

  const b = await backupDb();
  console.log(`백업: ${b.path} (${formatCounts(b.counts)})`);
  const r = resetProgress(db);
  console.log(`초기화: 복습 기록 ${r.deletedLogs}건 삭제, 카드 ${r.resetCards}장을 새 카드로 되돌림`);
}

main();
