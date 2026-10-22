// 한 사용자의 학습 기록을 초기화한다. 사용: npm run db:reset-progress -- <이메일> [--dev]
// 운영 DB면 먼저 백업하고(실패하면 멈춘다), 확인을 받은 뒤 그 사용자의 복습 기록을 지우고 카드를 새 카드로 되돌린다.
// 공용 카드 내용과 빼기 표시는 그대로 둔다. 되돌리려면 출력된 백업 파일로 복원한다(README "백업과 복원").
import "./env";
import { createInterface } from "node:readline/promises";
import { count, eq } from "drizzle-orm";
import { openDb } from "@/db";
import { reviewLogs, users } from "@/db/schema";
import { resetProgress } from "@/lib/study/reset";
import { backupBeforeChange, target } from "./lib/target";

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toLowerCase();
  if (!email) throw new Error("사용: npm run db:reset-progress -- <이메일> [--dev]");
  const t = target();
  const { db, pool } = openDb(t.url, 1);
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`${t.name} DB에 그 이메일의 사용자가 없습니다`);
    const [{ logs }] = await db.select({ logs: count() }).from(reviewLogs).where(eq(reviewLogs.userId, user.id));
    console.log(`${t.name} DB의 사용자 ${user.id}: 복습 기록 ${logs}건을 지우고 카드를 새 카드로 되돌립니다. 카드 내용과 빼기 표시는 그대로 둡니다.`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("계속하려면 y를 입력합니다: ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y") {
      console.log("취소했습니다. 바뀐 것은 없습니다.");
      return;
    }
    await backupBeforeChange(t);
    const r = await resetProgress(db, user.id);
    console.log(`초기화: 복습 기록 ${r.deletedLogs}건 삭제, 카드 ${r.resetCards}장을 새 카드로 되돌림`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
