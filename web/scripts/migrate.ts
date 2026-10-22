// 마이그레이션을 DB에 적용한다. 사용: npm run db:migrate
import "./env";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/config";
import { migrateDb } from "@/db/migrate";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true }); // 처음 설정할 때는 data/가 없다
migrateDb(config.dbPath);
console.log(`마이그레이션 적용: ${config.dbPath}`);
