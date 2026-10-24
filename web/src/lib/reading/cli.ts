// 읽기 글 명령(web/scripts/reading/*). 종료 코드: 통과 0, 미달 1, 입력 오류 2.
// 명령 파일은 이 함수들을 부르기만 한다(테스트가 같은 경로를 탄다).
import fs from "node:fs";
import path from "node:path";
import { parseFile, saveReading } from "./draft";
import { loadLexicon, type Lexicon } from "./lexicon";
import { measure, type Measurement } from "./measure";
import { InputError, isLevel, levelRank, type ReadingLevel } from "./rules";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

export interface Paths {
  db: string;
  exceptions: string;
  readings: string;
}

/** 명령 기본 경로(web 폴더에서 실행한다고 본다) */
export function defaultPaths(cwd = process.cwd()): Paths {
  return {
    db: path.join(cwd, "data/app.db"),
    exceptions: path.join(cwd, "scripts/reading/exceptions.txt"),
    readings: path.join(cwd, "data/readings"),
  };
}

function parseArgs(argv: string[], paths: Paths) {
  const flags = new Map<string, string | true>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.set("json", true);
    else if (/^--(level|db|exceptions|dir)$/.test(a)) {
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
    level: str("level")?.toLowerCase(),
    paths: { db: str("db") ?? paths.db, exceptions: str("exceptions") ?? paths.exceptions, readings: str("dir") ?? paths.readings },
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

/** 측정: <글 파일> [--level a1] [--json]. 레벨을 주지 않으면 파일 정보의 level을 쓴다 */
export function runMeasure(argv: string[], io: Io, paths = defaultPaths()): number {
  return run(io, () => {
    const a = parseArgs(argv, paths);
    const file = a.rest[0];
    if (!file) throw new InputError("사용: npm run reading:measure -- <글 파일> [--level a1] [--json]");
    if (!fs.existsSync(file)) throw new InputError(`글 파일이 없습니다: ${file}`);
    const raw = fs.readFileSync(file, "utf8");
    const parsed = raw.startsWith("---") ? parseFile(raw) : { fields: {}, body: raw.trim() };
    const level = a.level ?? (typeof parsed.fields.level === "string" ? parsed.fields.level.toLowerCase() : undefined);
    if (!isLevel(level)) throw new InputError("목표 레벨이 없습니다. --level a1 처럼 주거나 파일 정보에 level을 적어 주세요.");
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
    const r = saveReading(fs.readFileSync(file, "utf8"), a.paths.readings, loadLexicon(a.paths.db, a.paths.exceptions), now);
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
