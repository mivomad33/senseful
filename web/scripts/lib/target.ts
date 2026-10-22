// 명령이 다룰 원격 DB. 기본은 운영 DB이고 --dev를 주면 개발 DB(Neon dev 브랜치)다.
// 기본값을 운영으로 둔 것은 백업·카드 생성 같은 관리 명령을 운영에 쓰기 때문이다. 개발 중 확인은 --dev로 한다.
import { backupDb } from "./backup";

export interface Target {
  name: "운영" | "개발";
  /** 풀링하지 않는 주소(마이그레이션, 덤프, 긴 작업) */
  url: string;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name}이 없습니다(web/.env.local)`);
  return v;
}

export function target(argv = process.argv): Target {
  return argv.includes("--dev") ? { name: "개발", url: need("DATABASE_URL_UNPOOLED") } : { name: "운영", url: need("PROD_DATABASE_URL_UNPOOLED") };
}

/** 운영 DB를 바꾸기 전에 자동으로 백업한다(문서 4.6-4). 개발 DB는 운영으로 언제든 되돌릴 수 있어 백업하지 않는다. */
export async function backupBeforeChange(t: Target): Promise<void> {
  if (t.name !== "운영") return;
  const b = await backupDb(t);
  console.log(`바꾸기 전 백업: ${b}`);
}
