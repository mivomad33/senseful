// DB를 한 파일로 복사한다(npm run db:backup, 학습 기록 초기화 직전, 개발 DB 만들기).
// WAL 모드라 app.db만 복사하면 최근 기록이 빠질 수 있어서 SQLite 온라인 백업을 쓴다. 앱이 켜져 있어도 된다.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "@/config";

export interface BackupResult {
  path: string;
  counts: { items: number; cards: number; reviewLogs: number };
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** src DB를 dest 파일 하나로 복사하고 무결성을 검사한다. 원본이 열려 있어도 된다. 실패하면 예외를 던진다. */
export async function copyDb(src: string, dest: string): Promise<BackupResult["counts"]> {
  if (!fs.existsSync(src)) throw new Error(`DB가 없다: ${src}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const from = new Database(src, { readonly: true });
  try {
    await from.backup(dest);
  } finally {
    from.close();
  }

  // 원본의 WAL 설정을 물려받으면 -wal/-shm 파일이 따라 생기므로, 사본은 파일 하나로 둔다.
  const check = new Database(dest);
  try {
    check.pragma("journal_mode = DELETE");
    const ok = check.pragma("integrity_check", { simple: true });
    if (ok !== "ok") throw new Error(`사본 무결성 검사 실패(${ok}): ${dest}`);
    const count = (t: string) => (check.prepare(`select count(*) n from ${t}`).get() as { n: number }).n;
    return { items: count("items"), cards: count("cards"), reviewLogs: count("review_logs") };
  } finally {
    check.close();
  }
}

/** dir(기본 DB 옆 backups/)에 app-YYYYMMDD-HHMMSS.db로 백업한다. 실패하면 예외를 던진다. */
export async function backupDb(dir?: string, dbPath = config.dbPath): Promise<BackupResult> {
  const outDir = path.resolve(dir || path.join(path.dirname(dbPath), "backups"));
  const dest = path.join(outDir, `app-${stamp(new Date())}.db`);
  return { path: dest, counts: await copyDb(dbPath, dest) };
}

export function formatCounts(c: BackupResult["counts"]): string {
  return `items ${c.items}, cards ${c.cards}, review_logs ${c.reviewLogs}`;
}
