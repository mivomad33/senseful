// 원격 DB를 로컬 SQL 파일 하나로 받는다(pg_dump, 일반 텍스트). 파일은 web/data/backups/(git·배포 제외)에 둔다.
// 로컬 pg_dump가 서버보다 낮은 버전이면 덤프를 거부하므로 Homebrew postgresql@18의 pg_dump를 쓴다(PG_DUMP로 바꿀 수 있다).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Target } from "./target";

const PG_DUMP = process.env.PG_DUMP || "/opt/homebrew/opt/postgresql@18/bin/pg_dump";
export const BACKUP_DIR = path.resolve(process.cwd(), "data/backups");

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function libpqEnv(url: string): Record<string, string> {
  const u = new URL(url);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1),
    PGSSLMODE: u.searchParams.get("sslmode") || "require",
    PGCHANNELBINDING: u.searchParams.get("channel_binding") || "prefer",
  };
}

/** 백업 파일 경로를 돌려준다. 실패하면 예외를 던진다(실패한 백업 파일은 지운다). */
export async function backupDb(t: Target, dir = BACKUP_DIR): Promise<string> {
  if (!fs.existsSync(PG_DUMP)) throw new Error(`pg_dump가 없습니다: ${PG_DUMP} (brew install postgresql@18)`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${t.name === "운영" ? "prod" : "dev"}-${stamp(new Date())}.sql`);
  try {
    // 주소(비밀번호 포함)는 인자 대신 libpq 환경 변수로 나눠 넘겨 프로세스 목록에 보이지 않게 한다.
    execFileSync(PG_DUMP, ["--no-owner", "--no-privileges", "--file", file], { env: { ...process.env, ...libpqEnv(t.url) }, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    fs.rmSync(file, { force: true });
    throw new Error(`백업 실패: ${((e as { stderr?: Buffer }).stderr?.toString() ?? "").split("\n")[0]}`);
  }
  if (fs.statSync(file).size === 0) throw new Error("백업 파일이 비었습니다");
  return file;
}
