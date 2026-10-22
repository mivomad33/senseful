// 개발 DB(data/dev.db) 준비. 실제 DB를 복사해 만들고 마이그레이션을 적용한다.
// @/db는 불러오는 순간 연결을 열어 파일이 없으면 빈 DB를 만들므로 여기서는 쓰지 않는다.
import fs from "node:fs";
import { config } from "@/config";
import { copyDb, formatCounts } from "./backup";
import { migrateDb } from "./migrate";

/** 개발 DB를 실제 DB의 사본으로 새로 만든다. 기존 개발 DB(-wal·-shm 포함)는 지운다. */
export async function resetDevDb(): Promise<string> {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(config.devDbPath + suffix, { force: true });
  const counts = await copyDb(config.appDbPath, config.devDbPath);
  migrateDb(config.devDbPath);
  return `개발 DB: ${config.devDbPath} (실제 DB 사본, ${formatCounts(counts)})`;
}

/** 개발 서버 시작 때: 개발 DB가 없으면 실제 DB를 복사해 만들고, 마이그레이션을 적용한다. */
export async function prepareDevDb(): Promise<void> {
  if (config.dbPath !== config.devDbPath) return; // SENSEFUL_DB_PATH로 다른 DB를 쓰면 건드리지 않는다
  if (!fs.existsSync(config.devDbPath) && fs.existsSync(config.appDbPath)) {
    console.log(await resetDevDb());
    return;
  }
  migrateDb(config.devDbPath);
}
