import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "@/config";
import * as schema from "./schema";

export function openDb(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof openDb>;

// 개발 서버의 핫 리로드마다 연결이 늘지 않게 하나만 둔다.
const g = globalThis as unknown as { sensefulDb?: Db };
export const db: Db = g.sensefulDb ?? (g.sensefulDb = openDb());
