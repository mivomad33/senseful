// 덮기(docs/specs/2026-10-reading-stories 4.1). 저장 위치의 글 전체를 그때 다시 재서, 레벨 단어 중 어느 글에든 나온 것을 구한다.
// 따로 저장한 목록을 쓰지 않는다(글을 고치거나 지워도 어긋나지 않게). 나왔는지는 측정의 covers(원형 후보 중 사전 단어, 고유명사 제외)로 본다.
import fs from "node:fs";
import path from "node:path";
import { chapterTexts, isStory, parseFile, splitChapters } from "./draft";
import type { Lexicon } from "./lexicon";
import { measure } from "./measure";
import { InputError, PICK_COUNT, READING_LEVELS, type ReadingLevel } from "./rules";

/** 저장 위치 아래의 .md 파일(하위 폴더 포함). 폴더가 없으면 빈 목록 */
export function savedFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

/** 글 파일 하나가 덮는 사전 단어. 이야기는 장마다 재고, 고유명사는 이야기 전체를 문맥으로 본다 */
export function coversOfFile(text: string, lex: Lexicon): Set<string> {
  const parsed = parseFile(text);
  const texts = isStory(parsed.fields) ? chapterTexts(splitChapters(parsed.body), lex) : [parsed.body];
  const out = new Set<string>();
  texts.forEach((t, i) => {
    const names = texts.filter((_, j) => j !== i);
    for (const k of measure(t, "c1", lex, { names }).covers) out.add(k);
  });
  return out;
}

/** 저장 위치의 글 전체가 덮는 사전 단어 */
export function coveredKeys(dir: string, lex: Lexicon): Set<string> {
  const out = new Set<string>();
  for (const f of savedFiles(dir)) {
    try {
      for (const k of coversOfFile(fs.readFileSync(f, "utf8"), lex)) out.add(k);
    } catch (e) {
      if (e instanceof InputError) throw new InputError(`${f}: ${e.message}`);
      throw e;
    }
  }
  return out;
}

/** 단어 레벨이 그 레벨인 단어(허용 단어 명령이 그 레벨로 내는 목록) */
export function levelWords(lex: Lexicon, level: ReadingLevel): string[] {
  return [...lex.level].filter(([, lv]) => lv === level).map(([k]) => k).sort();
}

export interface LevelCoverage {
  level: ReadingLevel;
  total: number;
  covered: number;
  remaining: number;
  ratio: number;
}

export function coverageReport(covered: Set<string>, lex: Lexicon): LevelCoverage[] {
  return READING_LEVELS.map((level) => {
    const words = levelWords(lex, level);
    const c = words.filter((w) => covered.has(w)).length;
    return { level, total: words.length, covered: c, remaining: words.length - c, ratio: words.length ? c / words.length : 0 };
  });
}

/** 같은 시드면 같은 수열을 내는 난수(mulberry32) */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 덮이지 않은 그 레벨 단어 중 무작위로 count개(남은 것이 적으면 모두). 결과는 알파벳순 */
export function pickWords(lex: Lexicon, level: ReadingLevel, covered: Set<string>, opts: { seed?: number; count?: number } = {}): string[] {
  const pool = levelWords(lex, level).filter((w) => !covered.has(w));
  const rand = opts.seed === undefined ? Math.random : seededRandom(opts.seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, opts.count ?? PICK_COUNT[level]).sort();
}
