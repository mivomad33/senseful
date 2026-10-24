// 읽기 글 파일(초안과 저장 파일). 맨 위 --- 사이에 "키: 값" 줄과 "- 항목" 목록을 두고, 그 아래가 본문이다.
// 저장(docs/specs/2026-10-reading-gen 4.2)은 다시 재서 통과한 글만, 같은 이름이 없을 때만 쓴다.
import fs from "node:fs";
import path from "node:path";
import { TIME_ZONE } from "@/lib/day";
import type { Lexicon } from "./lexicon";
import { measure, nameHeads, sentenceCaseTitle, type Measurement } from "./measure";
import { InputError, isLevel, type ReadingLevel } from "./rules";

export type Fields = Record<string, string | string[]>;

export interface ParsedFile {
  fields: Fields;
  body: string;
}

export function parseFile(text: string): ParsedFile {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new InputError("파일 맨 위에 --- 로 감싼 정보(title, topic, level 등)가 없습니다.");
  const fields: Fields = {};
  let listKey: string | null = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && listKey) {
      (fields[listKey] as string[]).push(item[1].trim());
      continue;
    }
    const kv = /^([a-z_]+):\s*(.*)$/.exec(raw);
    if (!kv) throw new InputError(`정보 줄의 형식이 틀렸습니다: ${raw}`);
    const [, key, value] = kv;
    if (value === "") {
      fields[key] = [];
      listKey = key;
    } else {
      fields[key] = value.trim();
      listKey = null;
    }
  }
  return { fields, body: m[2].trim() };
}

const text = (f: Fields, k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");
const list = (f: Fields, k: string) => (Array.isArray(f[k]) ? (f[k] as string[]) : text(f, k) ? [text(f, k)] : []);

export interface Draft {
  title: string;
  topic: string;
  level: ReadingLevel;
  news: boolean;
  sources: string[];
  revisions: number;
  body: string;
}

/** 등록 도메인(서브도메인을 뗀 것). co.uk처럼 두 글자 국가 도메인 아래의 일반 2단계는 세 부분을 쓴다 */
export function siteOf(u: string): string {
  const labels = new URL(u).hostname.toLowerCase().replace(/\.$/, "").split(".");
  const n = labels.length >= 3 && labels.at(-1)!.length === 2 && /^(co|com|org|net|ac|gov|edu|or|ne|go)$/.test(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-n).join(".");
}

/** 초안의 정보를 확인한다. 시사 글(news: true)은 서로 다른 도메인의 출처가 2개 이상이어야 한다 */
export function toDraft({ fields, body }: ParsedFile): Draft {
  const title = text(fields, "title");
  const topic = text(fields, "topic");
  const level = text(fields, "level").toLowerCase();
  const news = text(fields, "news");
  const revisions = Number(text(fields, "revisions"));
  const sources = list(fields, "sources");
  if (!title) throw new InputError("title이 없습니다.");
  if (!topic) throw new InputError("topic이 없습니다.");
  if (!isLevel(level)) throw new InputError("level은 a1, a2, b1, b2, c1 중 하나여야 합니다.");
  if (news !== "true" && news !== "false") throw new InputError("news는 true 또는 false여야 합니다.");
  if (!Number.isInteger(revisions) || revisions < 0) throw new InputError("revisions는 0 이상의 정수여야 합니다(고친 횟수).");
  if (!body) throw new InputError("본문이 없습니다.");
  for (const s of sources) {
    if (!/^https?:\/\//.test(s) || !URL.canParse(s)) throw new InputError(`출처 주소가 올바르지 않습니다: ${s}`);
  }
  if (news === "true" && new Set(sources.map(siteOf)).size < 2) {
    throw new InputError("시사 글은 서로 다른 도메인의 출처가 2개 이상이어야 합니다.");
  }
  return { title, topic, level, news: news === "true", sources, revisions, body };
}

/** 파일 이름에 쓸 제목 조각 */
export function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "reading"
  );
}

/** 한국 시간 날짜(YYYY-MM-DD) */
export function seoulDate(d = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

const aboveLine = (a: Measurement["above"][number]) => `${a.lemma} (${a.level ?? "목록에 없음"})`;

export function serialize(d: Draft, m: Measurement, created: string): string {
  const lines = [
    "---",
    `title: ${d.title}`,
    `topic: ${d.topic}`,
    `level: ${d.level}`,
    `news: ${d.news}`,
    `created: ${created}`,
    `revisions: ${d.revisions}`,
    `ratio: ${m.ratio.toFixed(4)}`,
    `above_types: ${m.aboveTypes}`,
    `counted_types: ${m.countedTypes}`,
    `total_words: ${m.totalWords}`,
    `avg_sentence_length: ${m.avgSentenceLength}`,
  ];
  const listField = (k: string, items: string[]) => lines.push(`${k}:`, ...items.map((i) => `  - ${i}`));
  listField("above_words", m.above.map(aboveLine));
  listField("proper_nouns", m.properNouns);
  listField("sources", d.sources);
  return `${lines.join("\n")}\n---\n\n${d.body}\n`;
}

export type SaveResult = { ok: true; file: string; measurement: Measurement } | { ok: false; measurement: Measurement };

/** 초안 파일을 다시 재서 통과하면 dir/<레벨>/<날짜>-<제목>.md에 쓴다. 같은 이름이 있으면 입력 오류 */
export function saveReading(draftText: string, dir: string, lex: Lexicon, now = new Date()): SaveResult {
  const d = toDraft(parseFile(draftText));
  const m = measure(d.body, d.level, lex);
  if (!m.pass) return { ok: false, measurement: m };
  const created = seoulDate(now);
  const file = path.join(dir, d.level, `${created}-${slug(d.title)}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, serialize(d, m, created), { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new InputError(`같은 이름의 파일이 이미 있습니다: ${file}`);
    throw e;
  }
  return { ok: true, file, measurement: m };
}

// 이야기(docs/specs/2026-10-reading-stories). 정보에 kind: story를 두고, 본문은 "## 장 제목" 줄로 장을 나눈다.

export const isStory = (f: Fields) => f.kind === "story";

export interface Chapter {
  title: string;
  body: string;
}

/** 본문을 장으로 나눈다. 첫 "## " 줄 앞에 글이 있거나, 제목이나 본문이 빈 장이 있으면 입력 오류 */
export function splitChapters(body: string): Chapter[] {
  const parts = body.split(/^## +/m);
  if (parts[0].trim()) throw new InputError("이야기 본문은 \"## 장 제목\" 줄로 시작해야 합니다.");
  return parts.slice(1).map((p, i) => {
    const nl = p.indexOf("\n");
    const title = (nl < 0 ? p : p.slice(0, nl)).trim();
    const text = nl < 0 ? "" : p.slice(nl + 1).trim();
    if (!title || !text) throw new InputError(`${i + 1}장의 제목이나 본문이 비어 있습니다.`);
    return { title, body: text };
  });
}

/** 장마다 재는 글. 장 제목도 장 본문과 함께 잰다(제목에 넘는 단어가 재지 않은 채 남지 않게). 제목식 대문자는 본문의 이름만 남기고 소문자로 바꾼다 */
export function chapterTexts(chapters: Chapter[], lex: Lexicon): string[] {
  const names = nameHeads(chapters.map((c) => c.body), lex);
  return chapters.map((c) => `${sentenceCaseTitle(c.title, names, lex)}\n\n${c.body}`);
}
