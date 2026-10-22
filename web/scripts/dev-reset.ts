// 개발 DB를 실제 DB의 사본으로 새로 만든다. 사용: npm run db:dev-reset
// 실제 DB는 읽기만 한다. 개발 서버가 켜져 있으면 먼저 끈다(열린 DB 파일을 바꾸게 되어서).
import "./env";
import { resetDevDb } from "@/db/dev-db";

async function main() {
  console.log(await resetDevDb());
}

main();
