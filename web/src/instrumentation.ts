// Next 서버가 요청을 받기 전에 한 번 실행된다.
// 개발 서버면 개발 DB를 준비한다(없으면 실제 DB를 복사, 마이그레이션 적용). 운영 서버는 scripts/serve.ts에서 마이그레이션한다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") return;
  const { prepareDevDb } = await import("@/db/dev-db");
  await prepareDevDb();
}
