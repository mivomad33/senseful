import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureLexicon } from "./fixture";
import { measure } from "./measure";
import { InputError, withinRatio } from "./rules";

const lex = fixtureLexicon();
const run = (text: string, level: "a1" | "a2" | "b1" = "a1") => measure(text, level, lex);
const aboveOf = (text: string, level: "a1" | "a2" | "b1" = "a1") => run(text, level).above.map((a) => a.lemma);
const lemmas = (text: string) => {
  const m = run(text, "b1");
  return { types: m.countedTypes, above: m.above.map((a) => a.lemma) };
};

test("규칙·불규칙 활용형을 원형으로 묶는다", () => {
  const text = "He plays. They played. She is playing. It was big, bigger, biggest. He went home. The children and the women saw mice. She taught us. He stopped. They tried. I am happier. Better cake. It has been good.";
  assert.deepEqual(aboveOf(text), []);
  // play·plays·played·playing은 한 종류
  assert.equal(run("play plays played playing").countedTypes, 1);
  assert.equal(run("went go goes going gone").countedTypes, 1);
});

test("한 모양이 여러 원형으로 읽히면 가장 낮은 레벨로 센다", () => {
  const m = run("She found a cat. It means a lot. He lay at home. The cat rose.");
  assert.deepEqual(m.above.map((a) => a.lemma), ["lot", "rise"]); // rise는 A2
  assert.equal(m.above.find((a) => a.lemma === "rise")?.level, "a2");
  // 겉모양만 표제어인 단어는 그 레벨 그대로다(seed는 see의 활용이 아니다)
  assert.deepEqual(aboveOf("a seed"), ["seed"]);
});

test("an, these, those는 a, this, that으로 센다", () => {
  const m = run("an cat, these cats, those dogs, a cat, this dog, that cat");
  assert.deepEqual(m.above, []);
  assert.equal(m.countedTypes, 5); // a, cat, this, dog, that
});

test("둥근 아포스트로피, 악센트, 표제어의 기호를 같게 본다", () => {
  assert.deepEqual(aboveOf("at 7 o'clock in the café"), []);
  assert.deepEqual(aboveOf("at 7 o’clock"), []);
  assert.deepEqual(aboveOf("the Wi-Fi", "b1"), []);
  assert.deepEqual(aboveOf("the Wi-Fi"), ["wi-fi"]);
});

test("축약형은 나누고 소유격 's는 뗀다", () => {
  const m = run("I don't like it. It's my sister's cake. They can't eat. He won't go. I'm happy. Let's go. They're home. We've eaten. She'll see. He'd like it.");
  assert.ok(!m.above.some((a) => ["don", "t", "s", "sister's"].includes(a.lemma)), JSON.stringify(m.above));
  assert.ok(m.above.every((a) => a.lemma === "we"), JSON.stringify(m.above)); // we는 테스트 사전에 없다
  // 축약형은 전체 단어 수에서 한 단어다
  assert.equal(run("I don't like it.").totalWords, 4);
});

test("띄어 쓴 표제어와 하이픈 단어를 알아본다", () => {
  // ice cream은 표제어로 A1, 따로 쓴 cream은 B2
  assert.deepEqual(aboveOf("I like ice cream."), []);
  assert.deepEqual(aboveOf("I like cream."), ["cream"]);
  assert.deepEqual(aboveOf("a big T-shirt"), []);
  // 사전에 없는 하이픈 단어는 나눠서 센다
  assert.deepEqual(aboveOf("a cat-dog home"), []);
  assert.deepEqual(aboveOf("a cat-zebra"), ["zebra"]);
  assert.deepEqual(aboveOf("because of the dog"), []);
});

test("숫자는 세지 않지만 전체 단어 수에는 넣는다", () => {
  const m = run("I have 3 cats in 2026. The 1st cat is big.");
  assert.deepEqual(m.above, []);
  assert.equal(m.totalWords, 11);
});

test("문장 중간의 대문자 단어는 고유명사로 빼고, 대문자 표제어는 센다", () => {
  const m = run("On Monday the cat and Tom see TV. I like Rose and Anna. The AI is big.");
  assert.deepEqual(m.properNouns, ["Anna", "Rose", "Tom"]);
  assert.deepEqual(m.above.map((a) => a.lemma), ["ai"]);
});

test("문장 첫 대문자 일반 단어는 고유명사로 빠지지 않는다", () => {
  assert.deepEqual(aboveOf("Unfortunately, the cat is big."), ["unfortunately"]);
  assert.deepEqual(aboveOf("Zebras are big. I see it."), ["zebra"]);
  // 같은 모양이 문장 중간에도 대문자로 나오면 고유명사다
  assert.deepEqual(run("Tom is big. I see Tom.").properNouns, ["Tom"]);
  // 축약·소유격이 붙은 모양도 같은 이름으로 본다(문장 첫 NASA's와 문장 중간의 NASA)
  assert.deepEqual(run("NASA's cat is big. I like NASA.").above, []);
  assert.deepEqual(run("NASA's cat is big. I like NASA.").properNouns, ["NASA"]);
  // 따옴표 뒤의 문장 첫 단어도 문장 첫 단어로 본다
  const q = run('I see Tom. "Tom is big."');
  assert.deepEqual(q.properNouns, ["Tom"]);
  assert.deepEqual(q.above, []);
  assert.deepEqual(aboveOf('"Zebras are big."'), ["zebra"]);
  // 문장 중간이라도 여는 따옴표 바로 뒤는 인용문의 첫 단어다
  assert.deepEqual(run('She said, "We like it." He said, “Zebras are big.”').properNouns, []);
  assert.deepEqual(aboveOf('She said, "We like it."'), ["say", "we"]);
});

test("괄호·닫는 따옴표·줄임표 뒤의 대문자 단어도 문장 첫 단어다", () => {
  assert.deepEqual(aboveOf("The cat is big (it is good.) Zebras are big."), ["zebra"]);
  assert.deepEqual(aboveOf("The cat is small [it is good.] Zebras are big."), ["zebra"]);
  assert.deepEqual(aboveOf("I like it\u2026 Zebras are big."), ["zebra"]);
  assert.deepEqual(aboveOf('She said "I like it." Zebras are big.'), ["say", "zebra"]);
});

test("홑따옴표 인용문, 목록·제목 줄 처음의 대문자 단어도 문장 첫 단어다", () => {
  assert.deepEqual(aboveOf("He likes it, 'Zebras are big.'"), ["zebra"]);
  assert.deepEqual(aboveOf("He likes it, \u2018Zebras are big.\u2019"), ["zebra"]);
  assert.deepEqual(aboveOf("I like it\n- Zebras are big"), ["zebra"]);
  assert.deepEqual(aboveOf("## Zebras\nThe cat is big."), ["zebra"]);
  assert.deepEqual(aboveOf("I like it\n1. Zebras are big"), ["zebra"]);
});

test("숫자가 섞인 하이픈 단어는 숫자 조각만 빼고, 글자와 숫자가 붙은 단어는 목록에 없음으로 센다", () => {
  assert.deepEqual(aboveOf("a 3-zebra home and a 24-cat day"), ["zebra"]);
  assert.deepEqual(aboveOf("zebra2 and cat"), ["zebra2"]);
  assert.deepEqual(aboveOf("the 3rd cat in 2026"), []);
  assert.deepEqual(aboveOf("the 2020's big day"), []);
});

test("대문자가 섞인 글자+숫자 약어(CO2, G7)는 고유명사처럼 뺀다", () => {
  const m = run("The cat and CO2 in the home. G7 day is big.");
  assert.deepEqual(m.above, []);
  assert.deepEqual(m.properNouns, ["CO2"]);
  assert.deepEqual(aboveOf("a big home at 5 km\u00b2"), ["km2"]); // 소문자만 있으면 목록에 없음
});

test("호환 글자는 맞추고, 남은 영어 밖 글자는 입력 오류다", () => {
  assert.deepEqual(aboveOf("the \uff5a\uff45\uff42\uff52\uff41 is big"), ["zebra"]);
  assert.deepEqual(aboveOf("a T\u2011shirt"), []);
  assert.throws(() => run("the c\u0430t is big"), InputError); // 키릴 а
  assert.throws(() => run("the ca\u732bt is big"), InputError); // 대소문자 없는 글자(한자)
  assert.deepEqual(aboveOf("the zeb\u00adra is big"), ["zebra"]); // 소프트 하이픈·폭 없는 글자는 뗀다
  assert.deepEqual(aboveOf("the ze\u200bbra is big"), ["zebra"]);
});

test("경칭(Mr, Mrs, Ms, Dr)은 이름과 함께 고유명사로 뺀다", () => {
  const m = run("I see Mr Smith and Mrs Brown. Mr. Smith is big. Dr Green likes cake.");
  assert.deepEqual(m.above, []);
  assert.deepEqual(m.properNouns, ["Brown", "Dr", "Green", "Mr", "Mrs", "Smith"]);
});

test("단어 종류 기준 비율과 한도", () => {
  assert.equal(withinRatio(1, 20), true);
  assert.equal(withinRatio(1, 19), false);
  const known = "the cat dog home sister small day cake like eat live my at in on and happy good big".split(" ");
  const pass = run(Array(6).fill([...known, "unfortunately"].join(" ")).join(" "));
  assert.equal(pass.countedTypes, 20);
  assert.equal(pass.aboveTypes, 1);
  assert.equal(pass.pass, true, pass.reasons.join());
  const fail = run(Array(7).fill([...known.slice(0, -1), "unfortunately"].join(" ")).join(" "));
  assert.equal(fail.countedTypes, 19);
  assert.equal(fail.pass, false);
  assert.match(fail.reasons.join(), /5%/);
});

test("길이가 범위 밖이면 미달이고 이유를 낸다", () => {
  const short = run("The cat is big.");
  assert.equal(short.pass, false);
  assert.match(short.reasons.join(), /전체 단어 수 4가 범위 120~180 밖/);
  const long = run(Array(200).fill("cat").join(" "));
  assert.match(long.reasons.join(), /전체 단어 수 200/);
});

test("평균 문장 길이를 낸다", () => {
  const m = run("The cat is big. The dog is small! Is it good?");
  assert.equal(m.sentences, 3);
  assert.equal(m.avgSentenceLength, 3.7);
});

test("lemmas 도우미: 사전에 없는 단어는 원형으로 묶어 한 종류로 센다", () => {
  assert.deepEqual(lemmas("zebras zebra"), { types: 1, above: ["zebra"] });
});
