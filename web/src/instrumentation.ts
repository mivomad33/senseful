// Next 서버가 요청을 받기 전에 한 번 실행된다.
// 개발 서버면 개발 DB(Neon dev 브랜치)에 마이그레이션을 적용한다(이미 적용한 것은 건너뛴다). 운영 DB는 npm run db:migrate로 적용한다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) return;
  const { migrateDb } = await import("@/db/migrate");
  await migrateDb(url);
}
