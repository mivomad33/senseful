// 예외 목록, 단어 DB 읽기, 저장, 명령 종료 코드. 단어 DB는 임시 폴더에 직접 만든다(실제 DB를 쓰지 않는다).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { runCoverage, runMeasure, runPick, runSave, runWords, type Paths } from "./cli";
import { parseFile } from "./draft";
import { FIXTURE_ENTRIES, fixtureLexicon, storyChapters, storyText } from "./fixture";
import { parseExceptions } from "./lexicon";
import { measure } from "./measure";
import { recordPick } from "./picks";
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
  return { db: path.join(dir, "words.sqlite"), exceptions: path.join(dir, "exceptions.txt"), readings: path.join(dir, "readings"), picks: path.join(dir, "picks") };
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

test("덮기 현황 명령: 레벨마다 덮인 수를 내고, 저장한 글을 지우면 다시 남는다. DB가 없으면 입력 오류", () => {
  const p = makePaths("coverage");
  const now = new Date("2026-10-24T03:00:00Z");
  const before = capture();
  assert.equal(runCoverage(["--json"], before.io, p), 0);
  const b = JSON.parse(before.out.join("")).levels.find((r: { level: string }) => r.level === "a1");
  assert.equal(b.covered, 0);

  assert.equal(runSave([writeDraft("cov-draft.md", draft(PASS_BODY, { title: "Cov" }))], capture().io, p, now), 0);
  const after1 = capture();
  assert.equal(runCoverage(["--level", "a1", "--list", "--json"], after1.io, p), 0);
  const j = JSON.parse(after1.out.join(""));
  assert.ok(j.levels[0].covered > 0);
  assert.ok(!j.remaining.includes("cat") && j.remaining.includes("mouse"));

  fs.rmSync(path.join(p.readings, "a1", "2026-10-24-cov.md"));
  const after2 = capture();
  assert.equal(runCoverage(["--json"], after2.io, p), 0);
  assert.equal(JSON.parse(after2.out.join("")).levels[0].covered, 0);

  const noDb = capture();
  assert.equal(runCoverage([], noDb.io, { ...p, db: path.join(tmp, "missing.sqlite") }), 2);
  assert.match(noDb.err.join(), /단어 DB가 없습니다/);
});

test("단어 뽑기 명령: 덮이지 않은 단어만, 같은 시드면 같게 뽑고, 뽑기 기록을 남긴다", () => {
  const p = makePaths("pick");
  const now = new Date("2026-10-24T03:00:00Z");
  const a = capture();
  assert.equal(runPick(["a2", "--seed", "3", "--json"], a.io, p, now), 0);
  const j = JSON.parse(a.out.join(""));
  assert.deepEqual(j.words, ["colour", "ice", "rise", "unfortunately"]); // 남은 것이 4개뿐이라(뽑는 수 180보다 적다) 모두
  assert.equal(j.count, 4);
  const rec = JSON.parse(fs.readFileSync(path.join(p.picks, `${j.pick_id}.json`), "utf8"));
  assert.deepEqual([rec.id, rec.level, rec.words], [j.pick_id, "a2", j.words]); // 기록도 남은 단어 모두
  const again = capture();
  runPick(["a2", "--seed", "3", "--json"], again.io, p, now);
  const k = JSON.parse(again.out.join(""));
  assert.deepEqual(k.words, j.words);
  assert.notEqual(k.pick_id, j.pick_id); // 뽑을 때마다 새 ID
  const text = capture();
  runPick(["a2"], text.io, p, now);
  assert.match(text.out.join(), /^pick_id: a2-\d{14}-[0-9a-f]{4}\ncolour\nice/);
  assert.equal(runPick(["x1"], capture().io, p), 2);
});

test("측정·저장 명령은 이야기 초안(kind: story)을 장마다 재고, 넘긴 단어를 뽑기 기록과 대조해 저장한다", () => {
  const p = makePaths("story-cli");
  const now = new Date("2026-10-24T03:00:00Z");
  const id = recordPick(p.picks, "a1", ["cake", "home", "outer"], now).id;
  const text = storyText(storyChapters(10), { title: "Cat Days", pick_id: id });
  const f = writeDraft("story-draft.md", text);

  const m = capture();
  assert.equal(runMeasure([f], m.io, p), 0);
  const out = m.out.join();
  assert.match(out, /이야기, 목표 A1, 10장 \(범위 9~11\), 장마다 400~600단어/);
  assert.match(out, /넘긴 단어 중 쓴 것: 2 \/ 필요 2 \(넘긴 3개의 60%\)/);
  assert.match(out, /대사 비율: 40\.0% \(2000 \/ 5000단어, 하한 30%/);
  assert.match(out, /1장 통과: .*\(범위 400~600\), 대사 /);

  const j = capture();
  assert.equal(runMeasure([f, "--json"], j.io, p), 0);
  const json = JSON.parse(j.out.join(""));
  for (const k of ["chapterRange", "chapterWordsRange", "usedGiven", "requiredGiven", "unusedGiven", "dialogueWords", "dialogueRatio"]) assert.ok(k in json, k);

  // 스킬용 짧은 출력: 통과·이유·장마다 비율·길이·대사·넘는 단어, 쓴 수, 쓰지 않은 넘긴 단어. 덮는 단어 목록은 없다
  const b = capture();
  assert.equal(runMeasure([f, "--brief"], b.io, p), 0);
  const brief = JSON.parse(b.out.join(""));
  assert.deepEqual(Object.keys(brief.chapters[0]).sort(), ["above", "chapter", "dialogue", "range", "ratio", "words"]);
  assert.equal(brief.usedGiven, 2);
  assert.deepEqual(brief.unusedGiven, ["outer"]);
  assert.ok(!b.out.join().includes("covers"));
  assert.ok(b.out.join().length < j.out.join().length / 5, `짧은 출력 ${b.out.join().length}자`);
  assert.equal(runMeasure([writeDraft("short-brief.txt", "The cat."), "--level", "a1", "--brief"], capture().io, p), 2);

  assert.equal(runMeasure([f, "--level", "a1"], capture().io, p), 2);
  // 넘긴 단어가 기록과 다르거나, 기록이 없으면 측정도 저장도 입력 오류다
  const swapped = writeDraft("story-swapped.md", storyText(storyChapters(10), { title: "Cat Days", pick_id: id }, ["cake", "home", "cream"]));
  const sw = capture();
  assert.equal(runMeasure([swapped], sw.io, p), 2);
  assert.match(sw.err.join(), /기록에 없는 단어: cream/);
  assert.equal(runSave([swapped], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("story-noid.md", storyText(storyChapters(10), { pick_id: "a1-none" }))], capture().io, p, now), 2);
  assert.equal(runSave([writeDraft("story-nopick.md", storyText(storyChapters(10), { pick_id: "" }))], capture().io, p, now), 2);

  const s = capture();
  assert.equal(runSave([f], s.io, p, now), 0);
  const saved = path.join(p.readings, "a1", "2026-10-24-cat-days.md");
  assert.ok(fs.existsSync(saved));
  // 저장한 뒤에는 같은 뽑기를 쓴 초안이 입력 오류다
  const reuse = capture();
  assert.equal(runMeasure([f], reuse.io, p), 2);
  assert.match(reuse.err.join(), /이미 저장된 이야기가 썼습니다/);

  // 다른 이야기를 더 저장한 뒤에도, 저장 위치 안의 파일을 다시 재면(뽑기 대조 없이) 통과한다
  const id2 = recordPick(p.picks, "a1", ["cake", "home", "mouse"], now).id;
  assert.equal(runSave([writeDraft("story-2.md", storyText(storyChapters(10), { title: "Dog Days", pick_id: id2 }, ["cake", "home", "mouse"]))], capture().io, p, now), 0);
  const re = capture();
  assert.equal(runMeasure([saved, "--brief"], re.io, p), 0);
  assert.equal(JSON.parse(re.out.join("")).usedGiven, 2);

  const bad = writeDraft("story-bad.md", text.replace("## The Day One", "## The Zebra Lion Tiger Cream Day"));
  const bj = capture();
  assert.equal(runMeasure([bad, "--json"], bj.io, { ...p, readings: path.join(tmp, "story-cli-empty") }), 1);
  const failJson = JSON.parse(bj.out.join(""));
  assert.equal(failJson.pass, false);
  for (const k of ["chapterRange", "chapterWordsRange", "usedGiven", "requiredGiven", "unusedGiven", "dialogueWords", "dialogueRatio", "reasons"]) assert.ok(k in failJson, k);
});
