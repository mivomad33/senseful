// 덮기 현황·단어 뽑기와 이야기 측정·저장(docs/specs/2026-10-reading-stories 4.1, 4.2, 2026-10-reading-books 4.1). 저장 위치는 임시 폴더다.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { coverageReport, coveredKeys, pickWords } from "./coverage";
import { parseFile } from "./draft";
import { chapterBody, fixtureLexicon, KNOWN as known, NAMES_SENTENCE, storyChapters, storyText as story, wordsOf } from "./fixture";
import { buildLexicon } from "./lexicon";
import { measure } from "./measure";
import { checkGiven, recordPick } from "./picks";
import { InputError } from "./rules";
import { measureStory, saveStory, toStory } from "./story";

const lex = fixtureLexicon();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reading-story-test-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const withNames = (n: number) => storyChapters(n);
const ms = (text: string, covered = new Set<string>()) => measureStory(toStory(parseFile(text)), lex, covered);

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
  const ch = withNames(10);
  ch[0] = chapterBody(`${NAMES_SENTENCE}I see Rose. `);
  ch[3] = chapterBody("Rose likes the cat. ");
  assert.ok(!coveredKeys(dirWith("cover-name3", { "a1/s.md": story(ch) }), lex).has("rose"));
});

test("덮기: 이야기 형식도 장마다 읽는다", () => {
  const dir = dirWith("cover-story", { "a1/s.md": story(withNames(10).map((b, i) => (i === 2 ? `${b} The outer cat.` : b))) });
  const c = coveredKeys(dir, lex);
  assert.ok(c.has("outer") && c.has("cat"));
});

test("단어 뽑기: 덮이지 않은 그 레벨 단어에서 정해진 수를 중복 없이, 같은 시드면 같게 뽑는다", () => {
  const fake = buildLexicon([
    ...Array.from({ length: 400 }, (_, i) => ({ headword: `w${i}`, level: "b2" as const })),
    { headword: "x0", level: "a1" as const },
  ]);
  const covered = new Set(["w0", "w1", "w2"]);
  const p = pickWords(fake, "b2", covered, { seed: 7 });
  assert.equal(p.length, 250); // 4.1-5: B2는 250개
  assert.equal(new Set(p).size, 250);
  assert.ok(p.every((w) => /^w\d+$/.test(w) && !covered.has(w)));
  assert.deepEqual(pickWords(fake, "b2", covered, { seed: 7 }), p);
  assert.notDeepEqual(pickWords(fake, "b2", covered, { seed: 8 }), p);
  // 4.1-5: 레벨마다 뽑는 수
  const many = buildLexicon((["a1", "a2", "b1", "b2", "c1"] as const).flatMap((lv) => Array.from({ length: 300 }, (_, i) => ({ headword: `${lv}w${i}`, level: lv }))));
  assert.deepEqual((["a1", "a2", "b1", "b2", "c1"] as const).map((lv) => pickWords(many, lv, new Set(), { seed: 1 }).length), [150, 180, 200, 250, 250]);
  assert.deepEqual(pickWords(fake, "a1", new Set(), { seed: 1 }), ["x0"]); // 남은 것이 150개보다 적으면 모두
  assert.deepEqual(pickWords(fake, "a1", new Set(["x0"])), []);
});


test("이야기 측정: 장 수는 A1·A2 9~11개, B1~C1 11~13개다", () => {
  const ok = ms(story(withNames(10)));
  assert.deepEqual(ok.reasons, []);
  assert.equal(ok.pass, true);
  assert.equal(ok.chapterCount, 10);
  assert.deepEqual(ok.chapterRange, [9, 11]);
  for (const n of [9, 11]) assert.equal(ms(story(withNames(n))).pass, true, `A1 ${n}장`);
  assert.match(ms(story(withNames(8))).reasons.join(), /장이 8개입니다\(9~11개/);
  assert.match(ms(story(withNames(12))).reasons.join(), /장이 12개입니다\(9~11개/);

  // B1은 장마다 1000단어(800~1200)
  const b1 = (n: number) => ms(story(storyChapters(n, 997, 400), { level: "b1" }));
  for (const n of [11, 13]) assert.deepEqual(b1(n).reasons, [], `B1 ${n}장`);
  assert.match(b1(10).reasons.join(), /장이 10개입니다\(11~13개/);
  assert.match(b1(14).reasons.join(), /장이 14개입니다\(11~13개/);
  assert.deepEqual(b1(11).chapterWordsRange, [800, 1200]);
});

test("이야기 측정: 장 길이는 장 제목을 포함해 레벨 목표의 ±20%(A1 400~600)이고, 벗어난 장 번호가 나온다", () => {
  const at = (n: number) => {
    const ch = withNames(10);
    ch[3] = chapterBody("", n - 3, 150); // 장 제목 3단어
    return ms(story(ch));
  };
  assert.equal(at(400).chapters[3].totalWords, 400);
  assert.equal(at(400).pass, true);
  assert.equal(at(600).pass, true);
  assert.match(at(399).reasons.join(), /4장: 전체 단어 수 399가 범위 400~600 밖입니다/);
  assert.match(at(601).reasons.join(), /4장: 전체 단어 수 601가 범위 400~600 밖입니다/);
  assert.equal(at(601).chapters.filter((c) => !c.pass).length, 1);
});

test("이야기 측정: 장마다 넘는 단어 5%를 지켜야 하고, 미달인 장 번호가 나온다", () => {
  const hard = withNames(10);
  hard[3] = chapterBody("zebra lion tiger. ");
  const m = ms(story(hard));
  assert.equal(m.pass, false);
  assert.match(m.reasons.join(), /4장: 넘는 단어 비율/);
  assert.equal(m.chapters.filter((c) => !c.pass).length, 1);

  // 한 장만 6% 남짓(1/17)이고 이야기 전체는 5% 이하(다른 장이 다른 허용 단어를 더 쓴다)여도 미달이다
  const mixed = withNames(10).map((b) => `${b} The child can play good day.`);
  mixed[4] = `${wordsOf(480, known.slice(0, 16))} cream.\n\n"${wordsOf(14, known.slice(0, 16))}."`;
  const whole = measure(mixed.join("\n\n"), "a1", lex);
  assert.ok(whole.ratio <= 0.05, `전체 비율 ${whole.ratio}`);
  const mm = ms(story(mixed));
  assert.equal(mm.chapters[4].pass, false);
  assert.ok(mm.chapters[4].ratio > 0.05 && mm.chapters[4].ratio < 0.07, `5장 비율 ${mm.chapters[4].ratio}`);
  assert.match(mm.reasons.join(), /5장: 넘는 단어 비율/);
  assert.equal(mm.pass, false);
});

test("이야기 측정: 고유명사는 이야기 전체를 문맥으로 판별한다", () => {
  const ch = withNames(10);
  ch[0] = chapterBody(`${NAMES_SENTENCE}I see Zed. `);
  ch[2] = chapterBody("Zed likes the cat. ");
  const m = ms(story(ch));
  assert.ok(!m.chapters[2].above.some((a) => a.lemma === "zed"));
  assert.ok(m.chapters[2].properNouns.includes("Zed"));
});

test("이야기 측정: 장 제목과 책 제목의 넘는 단어도 잰다(제목식 대문자로 빠지지 않는다)", () => {
  assert.match(ms(story(withNames(10), { title: "The Zebra Cat" })).reasons.join(), /책 제목에 넘는 단어가 있습니다: zebra/);
  const c = ms(story(withNames(10)).replace("## The Day Two", "## The Lion Day"));
  assert.ok(c.chapters[1].above.some((a) => a.lemma === "lion"));
});

test("이야기 측정: 넘긴 단어 중 60% 이상을 써야 한다(활용형은 원형으로 세고, 이름은 세지 않는다)", () => {
  const given = ["cat", "dog", "go", "rose", "mouse", "woman", "teach", "child", "stop", "try"];
  const build = (extra: string) => {
    const ch = withNames(10);
    ch[0] = chapterBody(`${NAMES_SENTENCE}I see Rose. `);
    ch[1] = chapterBody(extra);
    return ms(story(ch, {}, given));
  };
  const five = build("I went home. Rose likes a mouse and the child. ");
  assert.deepEqual(five.usedGiven.sort(), ["cat", "child", "dog", "go", "mouse"]); // went → go, 이름 Rose는 rose가 아니다
  assert.equal(five.requiredGiven, 6);
  assert.equal(five.pass, false);
  assert.match(five.reasons.join(), /쓴 것이 5개로, 필요한 6개\(넘긴 10개의 60%\)/);
  assert.ok(five.unusedGiven.includes("rose") && five.unusedGiven.includes("woman"));

  const six = build("I went home. Rose likes a mouse and the child. The woman is happy. ");
  assert.equal(six.usedGiven.length, 6);
  assert.deepEqual(six.reasons, []);
});

test("이야기 측정: 대사(큰따옴표 안 단어)가 한 권 전체의 30% 이상이어야 한다", () => {
  // 10장 × 500단어 = 5000단어
  const at = (dlg: number[]) => ms(story(dlg.map((d, i) => chapterBody(i === 0 ? NAMES_SENTENCE : "", 497, d))));
  const thirty = at(Array(10).fill(150));
  assert.equal(thirty.totalWords, 5000);
  assert.equal(thirty.dialogueWords, 1500);
  assert.equal(thirty.pass, true);
  const low = at(Array(10).fill(145));
  assert.equal(low.dialogueRatio, 0.29);
  assert.match(low.reasons.join(), /대사 비율이 29\.0%\(1450 \/ 5000단어\)로, 하한 30%보다 낮습니다/);
  // 대사가 없는 장이 있어도 한 권 전체로 판단한다
  const zero = at([0, ...Array(9).fill(167)]);
  assert.equal(zero.chapters[0].dialogueWords, 0);
  assert.equal(zero.pass, true);

  // 둥근 큰따옴표도 센다
  const curly = withNames(10).map((c) => c.replace(/"([^"]*)"/g, "\u201c$1\u201d"));
  assert.equal(ms(story(curly)).dialogueWords, ms(story(withNames(10))).dialogueWords);
});

test("대사 세기: 작은따옴표는 대사로 세지 않고, 문단 끝에 열린 큰따옴표는 짝수여도 입력 오류다", () => {
  assert.equal(measure("'Hello,' she said. The cat is good.", "a1", lex, { dialogue: true }).dialogueWords, 0);
  assert.equal(measure('"Hello cat," she said. The dog is good.', "a1", lex, { dialogue: true }).dialogueWords, 2);
  assert.equal(measure("The \u201ccat is\u201d good.", "a1", lex, { dialogue: true }).dialogueWords, 2);
  assert.throws(() => measure('"Hello cat.\n\nGood dog."', "a1", lex, { dialogue: true }), /1번째 문단에서 큰따옴표가 닫히지 않았습니다/);
  const ch = withNames(10);
  ch[2] = `${chapterBody()}\n\n"The cat is good.\n\nThe dog is good."`;
  assert.throws(() => ms(story(ch)), /3장: .*닫히지 않았습니다/); // 어느 장인지 나온다
  // CRLF 줄바꿈도 문단으로 나눈다
  assert.throws(() => measure('"Hello cat.\r\n\r\nGood dog."', "a1", lex, { dialogue: true }), /1번째 문단/);
  // 여는 따옴표 없이 닫는 둥근 따옴표, 열린 채로 다시 여는 둥근 따옴표도 입력 오류다
  assert.throws(() => measure("\u201dThe cat\u201d is good.", "a1", lex, { dialogue: true }), InputError);
  assert.throws(() => measure("\u201cThe \u201ccat\u201d is good.", "a1", lex, { dialogue: true }), InputError);
  // 대사를 세지 않는 측정(짧은 글, 덮기)은 따옴표를 보지 않는다
  assert.equal(measure('"Hello cat.\n\nGood dog."', "a1", lex).dialogueWords, undefined);
});

test("이야기 초안: hook, setting, pick_id가 없으면 입력 오류다", () => {
  for (const k of ["hook", "setting", "pick_id"]) {
    assert.throws(() => toStory(parseFile(story(withNames(10), { [k]: "" }))), (e: Error) => e instanceof InputError && e.message.includes(k), k);
  }
});

test("이야기 측정: 목표 레벨 단어, 넘긴 단어 중 쓴 것, 새로 덮을 단어", () => {
  const m = ms(story(withNames(10)), new Set(["cat"]));
  assert.ok(m.targetWords.includes("cat") && m.targetWords.includes("cake"));
  assert.deepEqual(m.usedGiven, ["cake", "home"]);
  assert.deepEqual(m.unusedGiven, ["outer"]);
  assert.ok(!m.newWords.includes("cat") && m.newWords.includes("cake"));
});

test("뽑기 대조: 넘긴 단어가 뽑기 기록과 레벨·단어·개수까지 같아야 한다", () => {
  const picks = path.join(tmp, "picks-check");
  const readings = path.join(tmp, "picks-check-readings");
  const rec = recordPick(picks, "a1", ["home", "cake", "outer"]);
  assert.match(rec.id, /^a1-\d{14}-[0-9a-f]{4}$/);
  assert.deepEqual(rec.words, ["cake", "home", "outer"]);
  checkGiven(rec.id, "a1", ["outer", "cake", "home"], picks, readings); // 순서는 상관없다
  assert.throws(() => checkGiven(rec.id, "a1", ["cake", "home", "cream"], picks, readings), /빠진 단어: outer.*기록에 없는 단어: cream/);
  assert.throws(() => checkGiven(rec.id, "a1", ["cake", "home"], picks, readings), /빠진 단어: outer/);
  assert.throws(() => checkGiven(rec.id, "a1", ["cake", "home", "outer", "outer"], picks, readings), InputError);
  assert.throws(() => checkGiven(rec.id, "a2", ["cake", "home", "outer"], picks, readings), /레벨/);
  assert.throws(() => checkGiven("a1-nothing", "a1", ["cake"], picks, readings), /뽑기 기록이 없습니다/);
  assert.throws(() => checkGiven("../x", "a1", ["cake"], picks, readings), /형식/);
});

test("이야기 저장: 통과한 이야기만 저장하고, 새로 덮은 단어는 저장 순간 기준이며, 같은 이름은 거부한다", () => {
  const dir = path.join(tmp, "save");
  const picks = path.join(tmp, "save-picks");
  const now = new Date("2026-10-24T03:00:00Z");
  const pick = (words = ["cake", "home", "outer"]) => recordPick(picks, "a1", words, now).id;
  const bad = withNames(10);
  bad[0] = chapterBody(`${NAMES_SENTENCE}zebra lion tiger. `);
  assert.equal(saveStory(parseFile(story(bad, { pick_id: pick() })), dir, picks, lex, now).ok, false);
  assert.equal(fs.existsSync(dir), false);

  const id1 = pick();
  const first = saveStory(parseFile(story(withNames(10), { pick_id: id1 })), dir, picks, lex, now);
  assert.equal(first.ok, true);
  const file = path.join(dir, "a1", "2026-10-24-my-cat.md");
  const saved = parseFile(fs.readFileSync(file, "utf8"));
  for (const k of ["title", "level", "summary", "hook", "setting", "pick_id", "created", "chapters", "revisions", "chapter_results", "given_words", "used_given", "used_given_count", "required_given_count", "dialogue_ratio", "new_words", "new_count"]) {
    assert.ok(k in saved.fields, k);
  }
  assert.equal(saved.fields.kind, "story");
  assert.equal(saved.fields.hook, "A cat can talk.");
  assert.equal(saved.fields.setting, "superpower");
  assert.equal(saved.fields.pick_id, id1);
  assert.equal(saved.fields.used_given_count, "2");
  assert.equal(saved.fields.required_given_count, "2");
  assert.equal(saved.fields.dialogue_ratio, "0.4000 (2000/5000)");
  assert.equal((saved.fields.chapter_results as string[]).length, 10);
  assert.match((saved.fields.chapter_results as string[])[1], /dialogue 0\.4000/);
  assert.ok((saved.fields.new_words as string[]).includes("cake"));
  // 저장한 파일을 다시 읽으면 정보가 그대로이고, 다시 재도 통과한다
  const back = toStory(saved);
  assert.equal(back.hook, "A cat can talk.");
  assert.equal(back.pickId, id1);
  assert.equal(measureStory(back, lex, new Set()).pass, true);

  // 같은 뽑기를 다른 이야기가 다시 쓰면 입력 오류이고, 저장 파일을 지우면 다시 저장할 수 있다
  assert.throws(() => saveStory(parseFile(story(withNames(10), { title: "My Dog", pick_id: id1 })), dir, picks, lex, now), /이미 저장된 이야기가 썼습니다/);
  assert.throws(() => saveStory(parseFile(story(withNames(10), { title: "My Dog", pick_id: "a1-unknown" })), dir, picks, lex, now), /뽑기 기록이 없습니다/);
  assert.throws(() => saveStory(parseFile(story(withNames(10), { title: "My Dog", pick_id: pick() }, ["cake", "home"])), dir, picks, lex, now), /빠진 단어/);

  // 뽑은 뒤 다른 이야기가 덮은 단어가 있어도(새로 덮지는 않는다) 기록과 같으면 저장된다
  const second = saveStory(parseFile(story(withNames(10), { title: "My Dog", pick_id: pick() })), dir, picks, lex, now);
  assert.equal(second.ok, true);
  assert.ok(second.ok && !second.measurement.newWords.includes("cake"));
  assert.throws(() => saveStory(parseFile(story(withNames(10), { pick_id: pick() })), dir, picks, lex, now), /이미 있습니다/);

  fs.rmSync(file);
  assert.equal(saveStory(parseFile(story(withNames(10), { pick_id: id1 })), dir, picks, lex, now).ok, true);
});
