// 단어 뽑기 기록(docs/specs/2026-10-reading-books 4.1-4). 뽑은 목록을 ID와 함께 남겨, 이야기의 넘긴 단어가 실제로 뽑은 목록과 같은지 확인한다.
// 이미 쓴 ID는 저장 위치 파일의 pick_id로 판단한다(저장 파일을 지우면 같은 ID로 다시 저장할 수 있다).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { savedFiles } from "./coverage";
import { parseFile } from "./draft";
import { InputError, type ReadingLevel } from "./rules";

export interface PickRecord {
  id: string;
  level: ReadingLevel;
  words: string[];
  created: string;
}

const ID_RE = /^[a-z0-9-]+$/;

/** 뽑은 목록을 기록하고 기록을 돌려준다 */
export function recordPick(dir: string, level: ReadingLevel, words: string[], now = new Date()): PickRecord {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const rec: PickRecord = { id: `${level}-${stamp}-${crypto.randomBytes(2).toString("hex")}`, level, words: [...words].sort(), created: now.toISOString() };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${rec.id}.json`), `${JSON.stringify(rec, null, 2)}\n`, { flag: "wx" });
  return rec;
}

export function loadPick(dir: string, id: string): PickRecord {
  if (!ID_RE.test(id)) throw new InputError(`pick_id의 형식이 틀렸습니다: ${id}`);
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) throw new InputError(`뽑기 기록이 없습니다: ${id}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as PickRecord;
}

/** 넘긴 단어가 뽑기 기록과 레벨·단어·개수까지 같은지, 그 ID를 저장 위치의 다른 파일이 이미 쓰지 않았는지 확인한다 */
export function checkGiven(pickId: string, level: ReadingLevel, given: string[], picksDir: string, readingsDir: string): void {
  const rec = loadPick(picksDir, pickId);
  if (rec.level !== level) throw new InputError(`뽑기 기록 ${pickId}의 레벨(${rec.level})이 초안 레벨(${level})과 다릅니다.`);
  const want = new Set(rec.words);
  const have = new Set(given);
  const missing = rec.words.filter((w) => !have.has(w));
  const extra = given.filter((w) => !want.has(w));
  if (missing.length || extra.length || given.length !== rec.words.length) {
    const parts = [`given(${given.length}개)이 뽑기 기록 ${pickId}(${rec.words.length}개)과 다릅니다`];
    if (missing.length) parts.push(`빠진 단어: ${missing.join(", ")}`);
    if (extra.length) parts.push(`기록에 없는 단어: ${extra.join(", ")}`);
    throw new InputError(`${parts.join(". ")}. 넘긴 단어 목록은 고치지 않습니다.`);
  }
  for (const f of savedFiles(readingsDir)) {
    const fields = parseFile(fs.readFileSync(f, "utf8")).fields;
    if (fields.pick_id === pickId) throw new InputError(`뽑기 ${pickId}는 이미 저장된 이야기가 썼습니다: ${f}. 새 권은 새로 뽑습니다.`);
  }
}

/** file이 dir 안에 있는지 */
export function isInside(file: string, dir: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
