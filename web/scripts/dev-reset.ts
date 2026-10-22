// 개발 DB(Neon dev 브랜치)를 운영 DB의 지금 상태로 되돌린다. 사용: npm run db:dev-reset
// 개발 DB의 지금 데이터는 사라진다. 운영 DB는 읽기만 한다. 개발 서버가 켜져 있으면 다시 켠다(연결이 끊긴다).
import "./env";
import { restoreBranch } from "./lib/neon";

async function main() {
  const dev = process.env.NEON_DEV_BRANCH_ID;
  const prod = process.env.NEON_PROD_BRANCH_ID;
  if (!dev || !prod) throw new Error("NEON_DEV_BRANCH_ID·NEON_PROD_BRANCH_ID가 없습니다");
  await restoreBranch(dev, prod);
  console.log("개발 DB를 운영 DB의 지금 상태로 되돌렸습니다.");
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
