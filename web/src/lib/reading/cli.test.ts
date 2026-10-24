// 예외 목록, 단어 DB 읽기, 저장, 명령 종료 코드. 단어 DB는 임시 폴더에 직접 만든다(실제 DB를 쓰지 않는다).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runMeasure, runSave, runWords, type Paths } from "./cli";
import { parseFile } from "./draft";
import { FIXTURE_ENTRIES, fixtureLexicon } from "./fixture";
import { parseExceptions } from "./lexicon";
import { measure } from "./measure";
import { InputError } from "./rules";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-test-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function makePaths(name: string, exceptions = ""): Paths {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "words.sqlite"));
  db.exec("create table items (id integer primary key, kind text, headword text, cefr text)");
  const ins = db.prepare("insert into items (kind, headword, cefr) values (?, ?, ?)");
  for (const e of FIXTURE_ENTRIES) ins.run("word", e.headword, e.level);
  ins.run("phrase", "zebra crossing", "a1"); // 단어가 아닌 항목은 쓰지 않는다
  db.close();
  fs.writeFileSync(path.join(dir, "exceptions.txt"), exceptions);
  return { db: path.join(dir, "words.sqlite"), exceptions: path.join(dir, "exceptions.txt"), readings: path.join(dir, "readings") };
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
}

const known = "the cat dog home sister small day cake like eat live my at in on and happy good big".split(" ");
/** A1 기준 통과하는 본문(20종류 중 넘는 단어 1개, 120단어) */
const PASS_BODY = Array(6).fill([...known, "unfortunately"].join(" ")).join(" ");
const FAIL_BODY = Array(6).fill([...known.slice(0, 15), "unfortunately", "zebra", "lion", "tiger", "cream"].join(" ")).join(" ");

function draft(body: string, extra: Record<string, string> = {}) {
  const f = { title: "My Cat", topic: "a pet cat", level: "a1", news: "false", revisions: "1", ...extra };
  return `---\n${Object.entries(f).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${body}\n`;
}

function writeDraft(name: string, text: string) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, text);
  return p;
}

test("예외 목록에 적은 단어는 그 레벨로 센다", () => {
  const ex = parseExceptions("# 주석\n\nzebra a1\nice cream c1\n");
  assert.deepEqual(ex, [
    { headword: "zebra", level: "a1" },
    { headword: "ice cream", level: "c1" },
  ]);
  const m = measure("a zebra", "a1", fixtureLexicon(ex));
  assert.deepEqual(m.above, []);
});

test("예외 목록의 형식이 틀린 줄은 입력 오류다", () => {
  assert.throws(() => parseExceptions("zebra\n"), InputError);
  assert.throws(() => parseExceptions("zebra z9\n"), /1번째 줄/);
  const p = makePaths("bad-exceptions", "zebra a1\nlion\n");
  const f = writeDraft("bad-ex.txt", "The cat.");
  const c = capture();
  assert.equal(runMeasure([f, "--level", "a1"], c.io, p), 2);
  assert.match(c.err.join(), /2번째 줄/);
});

test("단어 DB가 없으면 입력 오류다", () => {
  const p = { ...makePaths("no-db"), db: path.join(tmp, "missing.sqlite") };
  const f = writeDraft("no-db.txt", "The cat.");
  const c = capture();
  assert.equal(runMeasure([f, "--level", "a1"], c.io, p), 2);
  assert.match(c.err.join(), /단어 DB가 없습니다/);
  assert.equal(fs.existsSync(p.db), false); // 없는 DB를 만들지 않는다
});

test("측정 명령: 통과 0, 미달 1, 사람이 읽는 출력과 JSON 출력", () => {
  const p = makePaths("measure");
  const ok = capture();
  assert.equal(runMeasure([writeDraft("pass.txt", PASS_BODY), "--level", "a1"], ok.io, p), 0);
  assert.match(ok.out.join(), /통과/);
  assert.match(ok.out.join(), /unfortunately \[A2\]/);

  const bad = capture();
  assert.equal(runMeasure([writeDraft("fail.txt", FAIL_BODY), "--level", "a1", "--json"], bad.io, p), 1);
  const j = JSON.parse(bad.out.join(""));
  assert.equal(j.pass, false);
  assert.deepEqual(
    j.above.map((a: { lemma: string; level: string | null }) => [a.lemma, a.level]),
    [["cream", "b2"], ["lion", null], ["tiger", null], ["unfortunately", "a2"], ["zebra", null]],
  );
  for (const k of ["ratio", "countedTypes", "totalWords", "properNouns", "avgSentenceLength"]) assert.ok(k in j, k);

  // 레벨을 주지 않으면 파일 정보의 level을 쓴다
  assert.equal(runMeasure([writeDraft("pass-draft.md", draft(PASS_BODY))], capture().io, p), 0);
  // 레벨이 없으면 입력 오류
  assert.equal(runMeasure([writeDraft("no-level.txt", PASS_BODY)], capture().io, p), 2);
});

test("저장 명령: 통과한 글만 저장하고, 같은 이름은 덮어쓰지 않는다", () => {
  const p = makePaths("save");
  const now = new Date("2026-10-24T03:00:00Z");

  const bad = capture();
  assert.equal(runSave([writeDraft("bad-draft.md", draft(FAIL_BODY))], bad.io, p, now), 1);
  assert.match(bad.out.join(), /저장하지 않았습니다/);
  assert.equal(fs.existsSync(p.readings), false);

  const ok = capture();
  const d = writeDraft("ok-draft.md", draft(PASS_BODY));
  assert.equal(runSave([d], ok.io, p, now), 0);
  const file = path.join(p.readings, "a1", "2026-10-24-my-cat.md");
  const saved = parseFile(fs.readFileSync(file, "utf8"));
  assert.equal(saved.fields.title, "My Cat");
  assert.equal(saved.fields.level, "a1");
  assert.equal(saved.fields.created, "2026-10-24");
  assert.equal(saved.fields.revisions, "1");
  assert.equal(saved.fields.ratio, "0.0500");
  assert.deepEqual(saved.fields.above_words, ["unfortunately (a2)"]);
  assert.equal(saved.fields.total_words, "120");
  assert.ok("proper_nouns" in saved.fields);
  assert.equal(saved.body, PASS_BODY);

  const again = capture();
  assert.equal(runSave([d], again.io, p, now), 2);
  assert.match(again.err.join(), /이미 있습니다/);
});

test("시사 글은 서로 다른 도메인의 출처가 2개 이상이어야 저장된다", () => {
  const p = makePaths("news");
  const now = new Date("2026-10-24T03:00:00Z");
  const news = (sources: string[], title: string) =>
    draft(PASS_BODY, { title, news: "true" }).replace("---\n", `---\nsources:\n${sources.map((s) => `  - ${s}`).join("\n")}\n`);

  assert.equal(runSave([writeDraft("n1.md", news(["https://a.example/x"], "One"))], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("n2.md", news(["https://a.example/x", "https://www.a.example/y"], "Two"))], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("n2d.md", news(["https://a.example./x", "https://www.a.example/y"], "TwoD"))], capture().io, p, now), 2);
  // 서브도메인만 다른 것은 같은 도메인이다
  assert.equal(runSave([writeDraft("n2b.md", news(["https://news.a.example/x", "https://a.example/y"], "TwoB"))], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("n2c.md", news(["https://www.bbc.co.uk/x", "https://news.bbc.co.uk/y"], "TwoC"))], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("n3.md", news(["https://a.example/x", "https://b.example/y"], "Three"))], capture().io, p, now), 0);
  const saved = parseFile(fs.readFileSync(path.join(p.readings, "a1", "2026-10-24-three.md"), "utf8"));
  assert.equal(saved.fields.news, "true");
  assert.deepEqual(saved.fields.sources, ["https://a.example/x", "https://b.example/y"]);
  // 시사 글이 아니면 출처가 없어도 된다
  assert.equal(runSave([writeDraft("n4.md", draft(PASS_BODY, { title: "Four", level: "a1" }))], capture().io, p, now), 0);
});

test("저장 명령은 --level을 받지 않는다(레벨은 초안 정보로만 정한다)", () => {
  const p = makePaths("save-level");
  const c = capture();
  assert.equal(runSave([writeDraft("lv.md", draft(PASS_BODY)), "--level", "b1"], c.io, p), 2);
  assert.match(c.err.join(), /--level/);
});

test("허용 단어 명령: 그 레벨 이하 표제어를 레벨별로 낸다", () => {
  const p = makePaths("words");
  const c = capture();
  assert.equal(runWords(["a2"], c.io, p), 0);
  assert.equal(c.out.length, 2);
  assert.match(c.out[0], /^A1 \(\d+\): a, and/);
  assert.match(c.out[1], /^A2 \(4\): colour, ice, rise, unfortunately$/);
  assert.equal(runWords(["x1"], capture().io, p), 2);
});
