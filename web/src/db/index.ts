import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** DB 또는 트랜잭션. 학습 로직은 이 타입을 받아 어느 쪽에서도 돌게 한다. */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export function openDb(url: string, max = 5): { db: NodePgDatabase<typeof schema>; pool: Pool } {
  const pool = new Pool({ connectionString: url.replace("sslmode=require", "sslmode=verify-full"), max, idleTimeoutMillis: 10_000 });
  // 쉬던 연결이 끊긴 것을 알려 주는 오류로 프로세스가 죽지 않게 한다. 다음 요청은 새 연결을 쓴다.
  pool.on("error", (e) => console.error(`[db] 연결 오류: ${e.name}`));
  return { db: drizzle(pool, { schema }), pool };
}

// 앱의 DB 연결. 처음 쓸 때 연다(빌드 중 정적 페이지는 DB를 쓰지 않는다). 개발 서버의 핫 리로드마다 연결이 늘지 않게 하나만 둔다.
const g = globalThis as unknown as { sensefulDb?: NodePgDatabase<typeof schema> };

function appDb(): NodePgDatabase<typeof schema> {
  if (!g.sensefulDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 없습니다");
    g.sensefulDb = openDb(url).db;
  }
  return g.sensefulDb;
}

export const db: Db = new Proxy({} as Db, {
  get: (_, key) => {
    const d = appDb() as unknown as Record<PropertyKey, unknown>;
    const v = d[key];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(d) : v;
  },
});
