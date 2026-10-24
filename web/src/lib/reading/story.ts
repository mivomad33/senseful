// 이야기의 측정과 저장(docs/specs/2026-10-reading-stories 4.2, 2026-10-reading-books 4.1). 장마다 넘는 단어 5%와 장 길이를 지키고,
// 한 권 전체로 장 수, 넘긴 단어 사용 하한, 대사 비율 하한을 지킨다(값은 rules.ts).
// 고유명사는 이야기 전체를 문맥으로 판별한다(한 장에서 문장 첫머리에만 나오는 등장인물 이름이 넘는 단어로 잡히지 않게). 책 제목에는 넘는 단어를 두지 않는다.
import fs from "node:fs";
import path from "node:path";
import { coveredKeys, levelWords } from "./coverage";
import { chapterTexts, isStory, seoulDate, slug, splitChapters, type Chapter, type ParsedFile } from "./draft";
import type { Lexicon } from "./lexicon";
import { measure, nameHeads, sentenceCaseTitle, type Measurement } from "./measure";
import { checkGiven } from "./picks";
import { enoughDialogue, InputError, isLevel, MIN_DIALOGUE, MIN_GIVEN_USE, rangeAround, requiredGiven, STORY_CHAPTER_WORDS, STORY_CHAPTERS, type ReadingLevel } from "./rules";

export interface StoryDraft {
  title: string;
  level: ReadingLevel;
  summary: string;
  /** 한 줄 설정(훅) */
  hook: string;
  /** 설정 유형(시간 이동, 빙의 등) */
  setting: string;
  /** 넘긴 단어를 뽑은 기록의 ID */
  pickId: string;
  /** 넘긴 단어 */
  given: string[];
  /** 장마다 고친 횟수 */
  revisions: number[];
  chapters: Chapter[];
}

const text = (f: ParsedFile["fields"], k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
const list = (f: ParsedFile["fields"], k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : text(f, k) ? [text(f, k)] : []);

/** 이야기 초안의 정보를 확인한다. revisions는 장마다 한 줄(고친 횟수) */
export function toStory({ fields, body }: ParsedFile): StoryDraft {
  if (!isStory(fields)) throw new InputError("이야기 초안은 정보에 kind: story가 있어야 합니다.");
  const title = text(fields, "title");
  const level = text(fields, "level").toLowerCase();
  const summary = text(fields, "summary");
  if (!title) throw new InputError("title이 없습니다.");
  if (!isLevel(level)) throw new InputError("level은 a1, a2, b1, b2, c1 중 하나여야 합니다.");
  if (!summary) throw new InputError("summary(줄거리 요약 한 줄)가 없습니다.");
  const hook = text(fields, "hook");
  const setting = text(fields, "setting");
  const pickId = text(fields, "pick_id");
  if (!hook) throw new InputError("hook(한 줄 설정)이 없습니다.");
  if (!setting) throw new InputError("setting(설정 유형)이 없습니다.");
  if (!pickId) throw new InputError("pick_id(넘긴 단어를 뽑은 기록의 ID)가 없습니다.");
  const chapters = splitChapters(body);
  const revisions = list(fields, "revisions").map(Number);
  if (revisions.length !== chapters.length || revisions.some((r) => !Number.isInteger(r) || r < 0)) {
    throw new InputError(`revisions는 장마다 한 줄씩(장 ${chapters.length}개) 0 이상의 정수여야 합니다.`);
  }
  const given = list(fields, "given").length ? list(fields, "given") : list(fields, "given_words"); // 저장 파일은 given_words
  return { title, level, summary, hook, setting, pickId, given: given.map((w) => w.toLowerCase()), revisions, chapters };
}

export interface StoryMeasurement {
  level: ReadingLevel;
  pass: boolean;
  reasons: string[];
  chapterCount: number;
  /** 장 수 범위 [최소, 최대] */
  chapterRange: [number, number];
  /** 장 하나의 단어 수 범위 [최소, 최대] */
  chapterWordsRange: [number, number];
  totalWords: number;
  /** 큰따옴표 안 단어 수와 한 권 전체 비율(장 제목 포함 전체 단어 대비) */
  dialogueWords: number;
  dialogueRatio: number;
  /** 장마다 측정(고유명사는 이야기 전체 문맥) */
  chapters: Measurement[];
  /** 책 제목에 나온 넘는 단어 */
  titleAbove: string[];
  /** 이야기의 목표 레벨 단어(본문이 덮는 목표 레벨 단어) */
  targetWords: string[];
  /** 넘긴 단어 중 본문이 덮는 것 */
  usedGiven: string[];
  /** 넘긴 단어 중 써야 하는 수 */
  requiredGiven: number;
  /** 넘긴 단어 중 본문이 덮지 않은 것 */
  unusedGiven: string[];
  /** 목표 레벨 단어 중 저장 위치에서 아직 덮이지 않은 것 */
  newWords: string[];
  properNouns: string[];
}

/** 이야기를 잰다. coveredBefore: 이 이야기를 빼고 저장 위치에서 이미 덮인 단어 */
export function measureStory(d: StoryDraft, lex: Lexicon, coveredBefore: Set<string>): StoryMeasurement {
  const texts = chapterTexts(d.chapters, lex);
  const lengthTarget = STORY_CHAPTER_WORDS[d.level];
  const chapters = texts.map((t, i) => {
    try {
      return measure(t, d.level, lex, { names: texts.filter((_, j) => j !== i), lengthTarget, dialogue: true });
    } catch (e) {
      // 입력 오류는 어느 장인지 붙인다(문단 번호는 장 제목을 1번째로 센다)
      if (e instanceof InputError) throw new InputError(`${i + 1}장: ${e.message}`);
      throw e;
    }
  });
  const title = measure(sentenceCaseTitle(d.title, nameHeads(d.chapters.map((c) => c.body), lex), lex), d.level, lex, { names: texts });
  const reasons: string[] = [];
  const [min, max] = STORY_CHAPTERS[d.level];
  if (d.chapters.length < min || d.chapters.length > max) reasons.push(`장이 ${d.chapters.length}개입니다(${min}~${max}개여야 합니다)`);
  chapters.forEach((m, i) => m.reasons.forEach((r) => reasons.push(`${i + 1}장: ${r}`)));
  if (title.above.length) reasons.push(`책 제목에 넘는 단어가 있습니다: ${title.above.map((a) => a.lemma).join(", ")}`);

  const covers = new Set(chapters.flatMap((m) => m.covers));
  const targetWords = levelWords(lex, d.level).filter((w) => covers.has(w));
  const usedGiven = d.given.filter((w) => covers.has(w));
  const required = requiredGiven(d.given.length);
  if (usedGiven.length < required) {
    reasons.push(`넘긴 단어 중 쓴 것이 ${usedGiven.length}개로, 필요한 ${required}개(넘긴 ${d.given.length}개의 ${MIN_GIVEN_USE * 100}%)보다 적습니다`);
  }
  const totalWords = chapters.reduce((n, m) => n + m.totalWords, 0);
  const dialogueWords = chapters.reduce((n, m) => n + (m.dialogueWords ?? 0), 0);
  if (!enoughDialogue(dialogueWords, totalWords)) {
    reasons.push(`대사 비율이 ${pctText(dialogueWords, totalWords)}(${dialogueWords} / ${totalWords}단어)로, 하한 ${MIN_DIALOGUE * 100}%보다 낮습니다`);
  }
  return {
    level: d.level,
    pass: reasons.length === 0,
    reasons,
    chapterCount: d.chapters.length,
    chapterRange: [min, max],
    chapterWordsRange: rangeAround(lengthTarget),
    totalWords,
    dialogueWords,
    dialogueRatio: totalWords ? dialogueWords / totalWords : 0,
    chapters,
    titleAbove: title.above.map((a) => a.lemma),
    targetWords,
    usedGiven,
    requiredGiven: required,
    unusedGiven: d.given.filter((w) => !covers.has(w)),
    newWords: targetWords.filter((w) => !coveredBefore.has(w)),
    properNouns: [...new Set(chapters.flatMap((m) => m.properNouns))].sort(),
  };
}

const pctText = (n: number, total: number) => `${(total ? (n / total) * 100 : 0).toFixed(1)}%`;

/** 장의 대사 비율 */
export const chapterDialogue = (c: Measurement) => (c.totalWords ? (c.dialogueWords ?? 0) / c.totalWords : 0);

const aboveText = (m: Measurement) => m.above.map((a) => `${a.lemma} (${a.level ?? "목록에 없음"})`).join(", ") || "없음";

export function serializeStory(d: StoryDraft, m: StoryMeasurement, created: string): string {
  const lines = [
    "---",
    `title: ${d.title}`,
    "kind: story",
    `level: ${d.level}`,
    `summary: ${d.summary}`,
    `hook: ${d.hook}`,
    `setting: ${d.setting}`,
    `pick_id: ${d.pickId}`,
    `created: ${created}`,
    `chapters: ${m.chapterCount}`,
    `total_words: ${m.totalWords}`,
    `target_words: ${m.targetWords.length}`,
    `given_count: ${d.given.length}`,
    `used_given_count: ${m.usedGiven.length}`,
    `required_given_count: ${m.requiredGiven}`,
    `dialogue_ratio: ${m.dialogueRatio.toFixed(4)} (${m.dialogueWords}/${m.totalWords})`,
    `new_count: ${m.newWords.length}`,
  ];
  const listField = (k: string, items: string[]) => lines.push(`${k}:`, ...items.map((i) => `  - ${i}`));
  listField("revisions", d.revisions.map(String));
  listField(
    "chapter_results",
    m.chapters.map((c, i) => `${i + 1}장 ratio ${c.ratio.toFixed(4)} (${c.aboveTypes}/${c.countedTypes}), words ${c.totalWords}, dialogue ${chapterDialogue(c).toFixed(4)}, revisions ${d.revisions[i]}, above: ${aboveText(c)}`),
  );
  listField("proper_nouns", m.properNouns);
  listField("given_words", d.given);
  listField("used_given", m.usedGiven);
  listField("new_words", m.newWords);
  const body = d.chapters.map((c) => `## ${c.title}\n\n${c.body}`).join("\n\n");
  return `${lines.join("\n")}\n---\n\n${body}\n`;
}

export type StorySaveResult = { ok: true; file: string; measurement: StoryMeasurement } | { ok: false; measurement: StoryMeasurement };

/** 이야기 초안을 다시 재서 통과하면 dir/<레벨>/<날짜>-<제목>.md에 쓴다. 새로 덮은 단어는 저장하는 순간의 저장 위치 기준이다.
 * 넘긴 단어는 picksDir의 뽑기 기록과 같아야 하고, 그 뽑기를 저장 위치의 다른 이야기가 쓰지 않았어야 한다 */
export function saveStory(parsed: ParsedFile, dir: string, picksDir: string, lex: Lexicon, now = new Date()): StorySaveResult {
  const d = toStory(parsed);
  checkGiven(d.pickId, d.level, d.given, picksDir, dir);
  const m = measureStory(d, lex, coveredKeys(dir, lex));
  if (!m.pass) return { ok: false, measurement: m };
  const created = seoulDate(now);
  const file = path.join(dir, d.level, `${created}-${slug(d.title)}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, serializeStory(d, m, created), { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new InputError(`같은 이름의 파일이 이미 있습니다: ${file}`);
    throw e;
  }
  return { ok: true, file, measurement: m };
}
