// 읽기 글 명령(web/scripts/reading/*). 종료 코드: 통과 0, 미달 1, 입력 오류 2.
// 명령 파일은 이 함수들을 부르기만 한다(테스트가 같은 경로를 탄다).
import fs from "node:fs";
import path from "node:path";
import { coverageReport, coveredKeys, levelWords, pickWords } from "./coverage";
import { isStory, parseFile, saveReading } from "./draft";
import { loadLexicon, type Lexicon } from "./lexicon";
import { measure, type Measurement } from "./measure";
import { checkGiven, isInside, recordPick } from "./picks";
import { InputError, isLevel, levelRank, MIN_DIALOGUE, MIN_GIVEN_USE, type ReadingLevel } from "./rules";
import { chapterDialogue, measureStory, saveStory, toStory, type StoryMeasurement } from "./story";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

export interface Paths {
  db: string;
  exceptions: string;
  readings: string;
  /** 단어 뽑기 기록 */
  picks: string;
}

/** 명령 기본 경로(web 폴더에서 실행한다고 본다) */
export function defaultPaths(cwd = process.cwd()): Paths {
  return {
    db: path.join(cwd, "data/app.db"),
    exceptions: path.join(cwd, "scripts/reading/exceptions.txt"),
    readings: path.join(cwd, "data/readings"),
    picks: path.join(cwd, "data/reading-picks"),
  };
}

function parseArgs(argv: string[], paths: Paths) {
  const flags = new Map<string, string | true>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "--list" || a === "--brief") flags.set(a.slice(2), true);
    else if (/^--(level|db|exceptions|dir|picks|seed)$/.test(a)) {
      const v = argv[++i];
      if (!v) throw new InputError(`${a} 뒤에 값이 없습니다.`);
      flags.set(a.slice(2), v);
    } else if (a.startsWith("--")) throw new InputError(`모르는 옵션입니다: ${a}`);
    else rest.push(a);
  }
  const str = (k: string) => (typeof flags.get(k) === "string" ? (flags.get(k) as string) : undefined);
  return {
    rest,
    json: flags.get("json") === true,
    list: flags.get("list") === true,
    brief: flags.get("brief") === true,
    seed: str("seed"),
    level: str("level")?.toLowerCase(),
    paths: { db: str("db") ?? paths.db, exceptions: str("exceptions") ?? paths.exceptions, readings: str("dir") ?? paths.readings, picks: str("picks") ?? paths.picks },
  };
}

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function formatMeasurement(m: Measurement): string {
  const lines = [
    `${m.pass ? "통과" : "미달"} (목표 ${m.level.toUpperCase()})`,
    `넘는 단어 비율: ${pct(m.ratio)} (${m.aboveTypes} / ${m.countedTypes}종류, 한도 5%)`,
    `전체 단어 수: ${m.totalWords} (범위 ${m.lengthRange[0]}~${m.lengthRange[1]})`,
    `평균 문장 길이: ${m.avgSentenceLength}단어 (${m.sentences}문장, 참고값)`,
  ];
  if (m.reasons.length) lines.push(...m.reasons.map((r) => `  미달 이유: ${r}`));
  lines.push(`넘는 단어 ${m.above.length}개:`);
  for (const a of m.above) lines.push(`  ${a.lemma} [${a.level ? a.level.toUpperCase() : "목록에 없음"}] ← ${a.forms.join(", ")}`);
  lines.push(`고유명사로 뺀 단어: ${m.properNouns.length ? m.properNouns.join(", ") : "없음"}`);
  return lines.join("\n");
}

export function formatStory(m: StoryMeasurement): string {
  const lines = [
    `${m.pass ? "통과" : "미달"} (이야기, 목표 ${m.level.toUpperCase()}, ${m.chapterCount}장 (범위 ${m.chapterRange[0]}~${m.chapterRange[1]}), 장마다 ${m.chapterWordsRange[0]}~${m.chapterWordsRange[1]}단어, 전체 ${m.totalWords}단어)`,
    ...m.reasons.map((r) => `  미달 이유: ${r}`),
    `넘긴 단어 중 쓴 것: ${m.usedGiven.length} / 필요 ${m.requiredGiven} (넘긴 ${m.usedGiven.length + m.unusedGiven.length}개의 ${MIN_GIVEN_USE * 100}%)`,
    `대사 비율: ${pct(m.dialogueRatio)} (${m.dialogueWords} / ${m.totalWords}단어, 하한 ${MIN_DIALOGUE * 100}%, 한 권 전체로 판단)`,
  ];
  m.chapters.forEach((c, i) => {
    lines.push(`${i + 1}장 ${c.pass ? "통과" : "미달"}: 넘는 단어 ${pct(c.ratio)} (${c.aboveTypes}/${c.countedTypes}), ${c.totalWords}단어 (범위 ${c.lengthRange[0]}~${c.lengthRange[1]}), 대사 ${pct(chapterDialogue(c))}`);
    for (const a of c.above) lines.push(`    ${a.lemma} [${a.level ? a.level.toUpperCase() : "목록에 없음"}] ← ${a.forms.join(", ")}`);
  });
  if (m.titleAbove.length) lines.push(`책 제목의 넘는 단어: ${m.titleAbove.join(", ")}`);
  lines.push(`목표 레벨 단어: ${m.targetWords.length}개, 넘긴 단어 중 쓴 것: ${m.usedGiven.length}개, 새로 덮을 단어: ${m.newWords.length}개`);
  lines.push(`고유명사로 뺀 단어: ${m.properNouns.length ? m.properNouns.join(", ") : "없음"}`);
  return lines.join("\n");
}

/** 스킬이 장마다 읽는 짧은 출력. 덮는 단어 목록 같은 큰 값은 넣지 않는다 */
export function briefStory(m: StoryMeasurement) {
  return {
    pass: m.pass,
    reasons: m.reasons,
    chapters: m.chapters.map((c, i) => ({
      chapter: i + 1,
      ratio: Number(c.ratio.toFixed(4)),
      words: c.totalWords,
      range: c.lengthRange,
      dialogue: Number(chapterDialogue(c).toFixed(4)),
      above: c.above.map((a) => `${a.lemma} (${a.level ?? "none"})`),
    })),
    chapterRange: m.chapterRange,
    dialogue: Number(m.dialogueRatio.toFixed(4)),
    usedGiven: m.usedGiven.length,
    requiredGiven: m.requiredGiven,
    unusedGiven: m.unusedGiven,
  };
}

function run(io: Io, f: () => number): number {
  try {
    return f();
  } catch (e) {
    if (e instanceof InputError) {
      io.err(`입력 오류: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

/** 측정: <글 파일> [--level a1] [--json | --brief]. 레벨을 주지 않으면 파일 정보의 level을 쓴다.
 * 저장 위치 밖의 이야기 초안은 넘긴 단어를 뽑기 기록과 대조한다(저장 위치 안의 파일은 자기 단어를 덮고 있어 대조하지 않는다) */
export function runMeasure(argv: string[], io: Io, paths = defaultPaths()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    const file = a.rest[0];
    if (!file) throw new InputError("사용: npm run reading:measure -- <글 파일> [--level a1] [--json]");
    if (!fs.existsSync(file)) throw new InputError(`글 파일이 없습니다: ${file}`);
    const raw = fs.readFileSync(file, "utf8");
    const parsed = raw.startsWith("---") ? parseFile(raw) : { fields: {}, body: raw.trim() };
    if (isStory(parsed.fields)) {
      if (a.level) throw new InputError("이야기는 --level을 받지 않습니다. 레벨은 초안 정보의 level로 정합니다.");
      const lex = loadLexicon(a.paths.db, a.paths.exceptions);
      const d = toStory(parsed);
      if (!isInside(file, a.paths.readings)) checkGiven(d.pickId, d.level, d.given, a.paths.picks, a.paths.readings);
      const m = measureStory(d, lex, coveredKeys(a.paths.readings, lex));
      io.out(a.brief ? JSON.stringify(briefStory(m)) : a.json ? JSON.stringify(m, null, 2) : formatStory(m));
      return m.pass ? 0 : 1;
    }
    const level = a.level ?? (typeof parsed.fields.level === "string" ? parsed.fields.level.toLowerCase() : undefined);
    if (!isLevel(level)) throw new InputError("목표 레벨이 없습니다. --level a1 처럼 주거나 파일 정보에 level을 적어 주세요.");
    if (a.brief) throw new InputError("--brief는 이야기에만 씁니다.");
    const m = measure(parsed.body, level, loadLexicon(a.paths.db, a.paths.exceptions));
    io.out(a.json ? JSON.stringify(m, null, 2) : formatMeasurement(m));
    return m.pass ? 0 : 1;
  });
}

/** 저장: <초안 파일> [--json]. 다시 재서 통과하면 저장 위치에 쓴다 */
export function runSave(argv: string[], io: Io, paths = defaultPaths(), now = new Date()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    if (a.level) throw new InputError("저장은 --level을 받지 않습니다. 레벨은 초안 정보의 level로 정합니다.");
    const file = a.rest[0];
    if (!file) throw new InputError("사용: npm run reading:save -- <초안 파일>");
    if (!fs.existsSync(file)) throw new InputError(`초안 파일이 없습니다: ${file}`);
    const raw = fs.readFileSync(file, "utf8");
    const lex = loadLexicon(a.paths.db, a.paths.exceptions);
    const parsed = parseFile(raw);
    if (isStory(parsed.fields)) {
      const r = saveStory(parsed, a.paths.readings, a.paths.picks, lex, now);
      if (a.json) io.out(JSON.stringify(r, null, 2));
      else io.out(r.ok ? `저장했습니다: ${r.file}\n${formatStory(r.measurement)}` : `저장하지 않았습니다(미달).\n${formatStory(r.measurement)}`);
      return r.ok ? 0 : 1;
    }
    const r = saveReading(raw, a.paths.readings, lex, now);
    if (a.json) io.out(JSON.stringify(r, null, 2));
    else io.out(r.ok ? `저장했습니다: ${r.file}\n${formatMeasurement(r.measurement)}` : `저장하지 않았습니다(미달).\n${formatMeasurement(r.measurement)}`);
    return r.ok ? 0 : 1;
  });
}

/** 허용 단어: <레벨>. 그 레벨 이하 표제어를 레벨별로 낸다(쓰기 전에 참고용) */
export function runWords(argv: string[], io: Io, paths = defaultPaths()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    const level = a.rest[0]?.toLowerCase();
    if (!isLevel(level)) throw new InputError("사용: npm run reading:words -- <a1|a2|b1|b2|c1>");
    const lex: Lexicon = loadLexicon(a.paths.db, a.paths.exceptions);
    const by = new Map<ReadingLevel, string[]>();
    for (const [k, lv] of lex.level) if (levelRank(lv) <= levelRank(level)) by.set(lv, [...(by.get(lv) ?? []), k]);
    for (const [lv, words] of [...by].sort((x, y) => levelRank(x[0]) - levelRank(y[0]))) {
      io.out(`${lv.toUpperCase()} (${words.length}): ${words.sort().join(", ")}`);
    }
    return 0;
  });
}

/** 덮기 현황: [--level a1 --list] [--json]. 레벨마다 레벨 단어 수, 덮인 수, 남은 수. --list면 그 레벨의 남은 단어를 낸다 */
export function runCoverage(argv: string[], io: Io, paths = defaultPaths()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    if (a.level !== undefined && !isLevel(a.level)) throw new InputError("--level은 a1, a2, b1, b2, c1 중 하나여야 합니다.");
    if (a.list && !a.level) throw new InputError("--list는 --level과 함께 씁니다.");
    const lex = loadLexicon(a.paths.db, a.paths.exceptions);
    const covered = coveredKeys(a.paths.readings, lex);
    const report = coverageReport(covered, lex).filter((r) => !a.level || r.level === a.level);
    const remaining = a.list && isLevel(a.level) ? levelWords(lex, a.level).filter((w) => !covered.has(w)) : undefined;
    if (a.json) io.out(JSON.stringify({ levels: report, ...(remaining ? { remaining } : {}) }, null, 2));
    else {
      for (const r of report) io.out(`${r.level.toUpperCase()}: 덮인 ${r.covered} / ${r.total} (${pct(r.ratio)}), 남은 ${r.remaining}`);
      if (remaining) io.out(`남은 단어: ${remaining.join(", ")}`);
    }
    return 0;
  });
}

/** 단어 뽑기: <레벨> [--seed 숫자] [--json]. 덮이지 않은 그 레벨 단어를 무작위로 뽑아(수는 rules.ts의 PICK_COUNT) 뽑기 기록에 남긴다.
 * 남은 단어가 그보다 적으면 남은 단어를 모두 넘긴다 */
export function runPick(argv: string[], io: Io, paths = defaultPaths(), now = new Date()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    const level = a.rest[0]?.toLowerCase();
    if (!isLevel(level)) throw new InputError("사용: npm run reading:pick -- <a1|a2|b1|b2|c1> [--seed 숫자]");
    if (a.seed !== undefined && !/^\d+$/.test(a.seed)) throw new InputError("--seed는 0 이상의 정수여야 합니다.");
    const lex = loadLexicon(a.paths.db, a.paths.exceptions);
    const words = pickWords(lex, level, coveredKeys(a.paths.readings, lex), { seed: a.seed === undefined ? undefined : Number(a.seed) });
    const rec = recordPick(a.paths.picks, level, words, now);
    io.out(a.json ? JSON.stringify({ pick_id: rec.id, level, count: words.length, words }) : [`pick_id: ${rec.id}`, ...words].join("\n"));
    return 0;
  });
}
