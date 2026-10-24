// 단어 레벨 사전. 로컬 수집 DB의 단어 표제어(가장 낮은 레벨)와 예외 목록으로 만든다.
// 표기 차이(둥근 아포스트로피, 악센트, ™ 같은 기호)는 key로 맞춘다. 대소문자는 key에서 무시하고, 표제어가 대문자로 시작하는지는 따로 둔다(고유명사 판별용).
import fs from "node:fs";
import Database from "better-sqlite3";
import { InputError, isLevel, levelRank, type ReadingLevel } from "./rules";

/** 표기를 맞춘 소문자 key. 악센트를 떼고, 아포스트로피를 곧은 따옴표로, 글자·숫자·'·-·공백 밖의 기호를 뺀다 */
export function wordKey(s: string): string {
  return foldText(s)
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 본문에도 쓰는 표기 맞춤: 보이지 않는 글자를 떼고, 호환 글자(전각, 합자)를 풀고, 악센트를 떼고, 둥근 따옴표와 특수 하이픈을 ASCII로 바꾼다 */
export function foldText(s: string): string {
  return s
    .replace(/[\u2122\u00ae\u00a9]/g, "") // ™ ® ©: NFKC가 TM 같은 글자로 바꾸기 전에 뗀다
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, "") // 소프트 하이픈, 폭 없는 글자: 단어를 조각내지 않게 뗀다
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010\u2011]/g, "-");
}

export interface Lexicon {
  /** key → 가장 낮은 레벨 */
  level: Map<string, ReadingLevel>;
  /** 대문자로 시작하는 표제어의 key(Monday, TV, I 등) */
  capitalized: Set<string>;
  /** 띄어 쓴 표제어의 key를 단어로 나눈 것, 긴 것부터 */
  multi: string[][];
}

export interface Entry {
  headword: string;
  level: ReadingLevel;
}

/** 표제어 목록과 예외 목록으로 사전을 만든다. 예외 목록이 같은 단어의 DB 레벨보다 우선한다 */
export function buildLexicon(entries: Entry[], exceptions: Entry[] = []): Lexicon {
  const level = new Map<string, ReadingLevel>();
  const capitalized = new Set<string>();
  const add = (e: Entry, override: boolean) => {
    const k = wordKey(e.headword);
    if (!k) return;
    const prev = level.get(k);
    if (override || !prev || levelRank(e.level) < levelRank(prev)) level.set(k, e.level);
    if (/^[A-Z]/.test(foldText(e.headword).trim())) capitalized.add(k);
  };
  for (const e of entries) add(e, false);
  for (const e of exceptions) add(e, true);
  const multi = [...level.keys()]
    .filter((k) => k.includes(" "))
    .map((k) => k.split(" "))
    .sort((a, b) => b.length - a.length);
  return { level, capitalized, multi };
}

/** 예외 목록 파일 내용. 한 줄에 "단어 레벨"(예: derive b1), #로 시작하는 줄과 빈 줄은 건너뛴다. 형식이 틀리면 입력 오류 */
export function parseExceptions(text: string): Entry[] {
  const out: Entry[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/\s+/);
    const lv = parts.at(-1)?.toLowerCase();
    const headword = parts.slice(0, -1).join(" ");
    if (parts.length < 2 || !isLevel(lv) || !wordKey(headword)) {
      throw new InputError(`예외 목록 ${i + 1}번째 줄의 형식이 틀렸습니다. "단어 레벨"(예: derive b1)로 적어 주세요.`);
    }
    out.push({ headword, level: lv });
  });
  return out;
}

/** 로컬 수집 DB(읽기 전용)와 예외 목록 파일로 사전을 만든다. DB가 없으면 입력 오류 */
export function loadLexicon(dbPath: string, exceptionsPath: string): Lexicon {
  if (!fs.existsSync(dbPath)) throw new InputError(`단어 DB가 없습니다: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  let rows: { headword: string; cefr: string }[];
  try {
    rows = db.prepare("select headword, cefr from items where kind = 'word'").all() as typeof rows;
  } finally {
    db.close();
  }
  const entries = rows.filter((r) => isLevel(r.cefr)).map((r) => ({ headword: r.headword, level: r.cefr as ReadingLevel }));
  if (entries.length === 0) throw new InputError(`단어 DB에 단어가 없습니다: ${dbPath}`);
  if (!fs.existsSync(exceptionsPath)) throw new InputError(`예외 목록 파일이 없습니다: ${exceptionsPath}`);
  return buildLexicon(entries, parseExceptions(fs.readFileSync(exceptionsPath, "utf8")));
}
