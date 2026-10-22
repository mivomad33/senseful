// 마이그레이션 적용(db:migrate, 운영·개발 서버 시작). 이미 적용한 것은 건너뛴다.
// @/db는 불러오는 순간 연결을 열어 파일이 없으면 빈 DB를 만들므로, 연결을 따로 열고 닫는다.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export function migrateDb(dbPath: string): void {
  const sqlite = new Database(dbPath);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  } finally {
    sqlite.close();
  }
}
