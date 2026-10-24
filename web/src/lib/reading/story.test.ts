// 덮기 현황·단어 뽑기와 이야기 측정·저장(docs/specs/2026-10-reading-stories 4.1, 4.2). 저장 위치는 임시 폴더다.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { coverageReport, coveredKeys, pickWords } from "./coverage";
import { parseFile } from "./draft";
import { fixtureLexicon } from "./fixture";
import { buildLexicon } from "./lexicon";
import { measure } from "./measure";
import { measureStory, saveStory, toStory } from "./story";

const lex = fixtureLexicon();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-story-test-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const known = "the cat dog home sister small day cake like eat live my at in on and happy good big".split(" ");
/** A1 기준 통과하는 장 본문(넘는 단어 없음, 133단어). extra는 맨 앞 문장으로 더한다 */
const chapterBody = (extra = "") => `${extra}${Array(7).fill(known.join(" ")).join(" ")}.`;

function story(chapters: string[], extra: Record<string, string> = {}) {
  const f = { title: "My Cat", kind: "story", level: "a1", summary: "a girl and her cat", ...extra };
  const head = Object.entries(f).map(([k, v]) => `${k}: ${v}`);
  const lists = ["revisions:", ...chapters.map(() => "  - 0"), "given:", "  - cake", "  - outer", "  - cream"];
  const body = chapters.map((c, i) => `## The Day ${["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][i]}\n\n${c}`).join("\n\n");
  return `---\n${[...head, ...lists].join("\n")}\n---\n${body}\n`;
}

/** 장 제목의 숫자 단어는 사전에 없으므로 이름으로 둔다(본문 문장 중간에 대문자로 나오게) */
const names = "One Two Three Four Five Six Seven Eight Nine";
const withNames = (n: number) => Array.from({ length: n }, (_, i) => chapterBody(i === 0 ? `I like ${names}. ` : ""));

function dirWith(name: string, files: Record<string, string>) {
  const dir = path.join(tmp, name);
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}
const shortFile = (body: string) => `---\ntitle: T\ntopic: t\nlevel: a1\nnews: false\nrevisions: 0\n---\n${body}\n`;

test("덮기: 저장된 글에 나온 단어(원형 후보 포함)만 덮이고, 파일을 지우면 다시 남는다", () => {
  const dir = dirWith("cover", { "a1/x.md": shortFile("I went out. The outer home is big. I like Rose and ice cream.") });
  const c = coveredKeys(dir, lex);
  assert.ok(c.has("go")); // went → go
  assert.ok(c.has("outer") && c.has("out")); // 측정이 out(A1)으로 세는 outer(B2)도 덮인다
  assert.ok(c.has("ice cream"));
  assert.ok(!c.has("ice")); // 띄어 쓴 표제어는 묶음으로만
  assert.ok(!c.has("rose")); // 고유명사로 뺀 이름은 덮지 않는다
  const b2 = coverageReport(c, lex).find((r) => r.level === "b2")!;
  assert.equal(b2.covered, 1);
  assert.equal(b2.remaining, b2.total - 1);

  fs.rmSync(path.join(dir, "a1/x.md"));
  assert.equal(coveredKeys(dir, lex).size, 0);
  assert.equal(coveredKeys(path.join(tmp, "missing"), lex).size, 0);
});

test("덮기: 다른 곳에서 이름으로 쓰인 단어는 문장 첫머리에 와도 덮지 않는다(측정에는 센다)", () => {
  const c = coveredKeys(dirWith("cover-name", { "a1/x.md": shortFile("I see Rose. Rose is happy.") }), lex);
  assert.ok(!c.has("rose"));
  const m = measure("I see Rose. Rose is happy.", "a1", lex);
  assert.ok(m.above.some((a) => a.lemma === "rose" || a.forms.includes("Rose")));
  // 소문자로 따로 나오면 덮인다
  assert.ok(coveredKeys(dirWith("cover-name2", { "a1/x.md": shortFile("I see Rose. Rose has a rose.") }), lex).has("rose"));
  // 이야기에서는 다른 장의 이름도 문맥이다
  const ch = withNames(6);
  ch[0] = chapterBody(`I like ${names} and Rose. `);
  ch[3] = chapterBody("Rose likes the cat. ");
  assert.ok(!coveredKeys(dirWith("cover-name3", { "a1/s.md": story(ch) }), lex).has("rose"));
});

test("덮기: 이야기 형식도 장마다 읽는다", () => {
  const dir = dirWith("cover-story", { "a1/s.md": story(withNames(6).map((b, i) => (i === 2 ? `${b} The outer cat.` : b))) });
  const c = coveredKeys(dir, lex);
  assert.ok(c.has("outer") && c.has("cat"));
});

test("단어 뽑기: 덮이지 않은 그 레벨 단어에서 정해진 수를 중복 없이, 같은 시드면 같게 뽑는다", () => {
  const fake = buildLexicon([
    ...Array.from({ length: 200 }, (_, i) => ({ headword: `w${i}`, level: "b2" as const })),
    { headword: "x0", level: "a1" as const },
  ]);
  const covered = new Set(["w0", "w1", "w2"]);
  const p = pickWords(fake, "b2", covered, { seed: 7 });
  assert.equal(p.length, 120);
  assert.equal(new Set(p).size, 120);
  assert.ok(p.every((w) => /^w\d+$/.test(w) && !covered.has(w)));
  assert.deepEqual(pickWords(fake, "b2", covered, { seed: 7 }), p);
  assert.notDeepEqual(pickWords(fake, "b2", covered, { seed: 8 }), p);
  assert.deepEqual(pickWords(fake, "a1", new Set(), { seed: 1 }), ["x0"]); // 남은 것이 80개보다 적으면 모두
  assert.deepEqual(pickWords(fake, "a1", new Set(["x0"])), []);
});

test("이야기 측정: 6~8장이고 모든 장이 기준을 통과해야 통과다", () => {
  const ok = measureStory(toStory(parseFile(story(withNames(7)))), lex, new Set());
  assert.deepEqual(ok.reasons, []);
  assert.equal(ok.pass, true);
  assert.equal(ok.chapterCount, 7);

  const five = measureStory(toStory(parseFile(story(withNames(5)))), lex, new Set());
  assert.match(five.reasons.join(), /장이 5개/);
  const nine = measureStory(toStory(parseFile(story(withNames(9)))), lex, new Set());
  assert.match(nine.reasons.join(), /장이 9개/);

  // 한 장만 넘는 단어가 많으면(전체 비율은 5% 이하여도) 미달이고 그 장 번호가 나온다
  const hard = withNames(7);
  hard[3] = chapterBody("zebra lion tiger. ");
  const m = measureStory(toStory(parseFile(story(hard))), lex, new Set());
  assert.equal(m.pass, false);
  assert.match(m.reasons.join(), /4장: 넘는 단어 비율/);
  assert.equal(m.chapters.filter((c) => !c.pass).length, 1);

  // 한 장만 6% 남짓(1/17)이고 이야기 전체는 5% 이하(다른 장이 다른 허용 단어를 더 쓴다)여도 미달이다
  const mixed = withNames(7).map((b) => `${b} The child can play good games.`.replace("games", "day"));
  mixed[4] = `${Array(8).fill(`${known.slice(0, 16).join(" ")} cream`).join(" ")}.`;
  const whole = measure(mixed.join("\n\n"), "a1", lex);
  assert.ok(whole.ratio <= 0.05, `전체 비율 ${whole.ratio}`);
  const mm = measureStory(toStory(parseFile(story(mixed))), lex, new Set());
  assert.equal(mm.chapters[4].pass, false);
  assert.ok(mm.chapters[4].ratio > 0.05 && mm.chapters[4].ratio < 0.07, `5장 비율 ${mm.chapters[4].ratio}`);
  assert.match(mm.reasons.join(), /5장: 넘는 단어 비율/);
  assert.equal(mm.pass, false);

  // 한 장이 길이 범위 밖
  const long = withNames(7);
  long[5] = `${long[5]} ${Array(3).fill(known.join(" ")).join(" ")}`;
  assert.match(measureStory(toStory(parseFile(story(long))), lex, new Set()).reasons.join(), /6장: 전체 단어 수/);
});

test("이야기 측정: 고유명사는 이야기 전체를 문맥으로 판별한다", () => {
  const ch = withNames(6);
  ch[0] = chapterBody(`I like ${names} and Zed. `);
  ch[2] = chapterBody("Zed likes the cat. ");
  const m = measureStory(toStory(parseFile(story(ch))), lex, new Set());
  assert.ok(!m.chapters[2].above.some((a) => a.lemma === "zed"));
  assert.ok(m.chapters[2].properNouns.includes("Zed"));
});

test("이야기 측정: 장 제목과 책 제목의 넘는 단어도 잰다(제목식 대문자로 빠지지 않는다)", () => {
  const m = measureStory(toStory(parseFile(story(withNames(6), { title: "The Zebra Cat" }))), lex, new Set());
  assert.match(m.reasons.join(), /책 제목에 넘는 단어가 있습니다: zebra/);

  const text = story(withNames(6)).replace("## The Day Two", "## The Lion Day");
  const c = measureStory(toStory(parseFile(text)), lex, new Set());
  assert.ok(c.chapters[1].above.some((a) => a.lemma === "lion"));
});

test("이야기 측정: 목표 레벨 단어, 넘긴 단어 중 쓴 것, 새로 덮을 단어", () => {
  const m = measureStory(toStory(parseFile(story(withNames(6)))), lex, new Set(["cat"]));
  assert.ok(m.targetWords.includes("cat") && m.targetWords.includes("cake"));
  assert.deepEqual(m.usedGiven, ["cake"]);
  assert.ok(!m.newWords.includes("cat") && m.newWords.includes("cake"));
});

test("이야기 저장: 통과한 이야기만 저장하고, 새로 덮은 단어는 저장 순간 기준이며, 같은 이름은 거부한다", () => {
  const dir = path.join(tmp, "save");
  const now = new Date("2026-10-24T03:00:00Z");
  const bad = withNames(7);
  bad[0] = chapterBody(`I like ${names}. zebra lion tiger. `);
  assert.equal(saveStory(parseFile(story(bad)), dir, lex, now).ok, false);
  assert.equal(fs.existsSync(dir), false);

  const first = saveStory(parseFile(story(withNames(6))), dir, lex, now);
  assert.equal(first.ok, true);
  const saved = parseFile(fs.readFileSync(path.join(dir, "a1", "2026-10-24-my-cat.md"), "utf8"));
  for (const k of ["title", "level", "summary", "created", "chapters", "revisions", "chapter_results", "given_words", "used_given", "new_words", "new_count"]) assert.ok(k in saved.fields, k);
  assert.equal(saved.fields.kind, "story");
  assert.equal((saved.fields.chapter_results as string[]).length, 6);
  assert.ok((saved.fields.new_words as string[]).includes("cake"));
  // 저장한 파일을 다시 재도 통과한다
  assert.equal(measureStory(toStory(saved), lex, new Set()).pass, true);

  const second = saveStory(parseFile(story(withNames(6), { title: "My Dog" })), dir, lex, now);
  assert.equal(second.ok, true);
  assert.ok(second.ok && !second.measurement.newWords.includes("cake"));
  assert.throws(() => saveStory(parseFile(story(withNames(6))), dir, lex, now), /이미 있습니다/);
});
