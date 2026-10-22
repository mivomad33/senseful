// 로컬 수집 DB(web/data/app.db, git·배포 제외)를 읽는다. 카드 생성 입력(뜻풀이 등)과 이전할 내 학습 기록이 여기 있다.
// 앱은 SQLite를 쓰지 않는다. 이 파일은 로컬 명령에서만 쓴다.
import path from "node:path";
import Database from "better-sqlite3";
import type { GenItem } from "@/lib/card-gen/prompt";

export const LOCAL_DB = path.resolve(process.cwd(), "data/app.db");

export function openLocal(): Database.Database {
  return new Database(LOCAL_DB, { readonly: true, fileMustExist: true });
}

export interface LocalItem {
  id: number;
  kind: GenItem["kind"];
  headword: string;
  pos: string | null;
  cefr: "a1" | "a2" | "b1" | "b2" | "c1";
  shortcut: string | null;
  grammar: string | null;
  labels: string | null;
  definition: string;
}

/** 원격 항목 id(로컬 항목 id와 같다)로 생성 입력을 만든다. */
export function loadGenInputs(local: Database.Database, ids: number[]): Map<number, GenItem> {
  const out = new Map<number, GenItem>();
  const stmt = local.prepare("select id, kind, headword, pos, cefr, shortcut, grammar, labels, definition from items where id = ?");
  for (const id of ids) {
    const it = stmt.get(id) as LocalItem | undefined;
    if (it) out.set(id, { kind: it.kind, headword: it.headword, pos: it.pos, level: it.cefr, shortcut: it.shortcut, grammar: it.grammar, labels: it.labels, def: it.definition });
  }
  return out;
}
