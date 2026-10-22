import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

// 마이그레이션 파일 만들기(npm run db:generate)에만 쓴다. 적용은 npm run db:migrate가 한다(README "DB 스키마 변경").
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
