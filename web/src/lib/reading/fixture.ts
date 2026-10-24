// 테스트용 작은 단어 사전. 실제 단어 DB가 아니라 테스트에 필요한 단어만 직접 적었다(레벨도 테스트용).
import { buildLexicon, type Entry } from "./lexicon";
import type { ReadingLevel } from "./rules";

const at = (level: ReadingLevel, words: string) => words.split(",").map((w) => ({ headword: w.trim(), level }));

export const FIXTURE_ENTRIES: Entry[] = [
  ...at("a1", "out, a, the, be, have, do, not, go, find, mean, lie, child, good, play, big, teach, see, stop, try, happy, this, that, I, Monday, TV, o’clock, cafe, T-shirt, ice cream, it, he, she, cat, dog, home, at, in, on, and, can, will, would, sister, small, my, day, live, they, eat, cake, like, mouse, woman, us, let, because of"),
  ...at("a2", "rise, unfortunately, ice, colour"),
  ...at("b1", "lay, AI, Wi-Fi™"),
  ...at("b2", "found, means, rose, seed, cream, outer"),
];

export const fixtureLexicon = (exceptions: Entry[] = []) => buildLexicon(FIXTURE_ENTRIES, exceptions);

// 테스트용 이야기 초안(docs/specs/2026-10-reading-books 4.1). 장 제목 "The Day <숫자>"(3단어)와 본문을 합쳐 장마다 정확한 단어 수를 만든다.

/** 테스트 사전의 A1 단어(이 단어만 쓰면 넘는 단어가 없다) */
export const KNOWN = "the cat dog home sister small day cake like eat live my at in on and happy good big".split(" ");
export const NUMBERS = "One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen".split(" ");
/** 장 제목의 숫자 단어는 사전에 없으므로, 첫 장 맨 앞에서 문장 중간 대문자로 써 이름으로 둔다 */
export const NAMES_SENTENCE = `I like ${NUMBERS.join(" ")}. `;

/** list의 단어를 돌려 쓴 n단어 */
export const wordsOf = (n: number, list = KNOWN) => Array.from({ length: n }, (_, i) => list[i % list.length]).join(" ");
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** 장 본문 n단어(대사 dlg단어 포함, extra 포함). 대사는 따로 한 문단으로 둔다 */
export function chapterBody(extra = "", n = 497, dlg = 200): string {
  const narrative = `${extra}${wordsOf(n - dlg - countWords(extra))}.`;
  return dlg ? `${narrative}\n\n"${wordsOf(dlg)}."` : narrative;
}

/** n장(첫 장에 이름 문장). A1 기본값이면 장마다 500단어, 대사 40% */
export const storyChapters = (n: number, size = 497, dlg = 200) => Array.from({ length: n }, (_, i) => chapterBody(i === 0 ? NAMES_SENTENCE : "", size, dlg));

/** 이야기 초안 글. fields에서 빈 값으로 준 정보는 넣지 않는다 */
export function storyText(chapters: string[], fields: Record<string, string> = {}, given = ["cake", "home", "outer"]): string {
  const f: Record<string, string> = { title: "My Cat", kind: "story", level: "a1", summary: "a girl and her cat", hook: "A cat can talk.", setting: "superpower", pick_id: "a1-test", ...fields };
  const head = Object.entries(f).filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`);
  const lists = ["revisions:", ...chapters.map(() => "  - 0"), "given:", ...given.map((g) => `  - ${g}`)];
  const body = chapters.map((c, i) => `## The Day ${NUMBERS[i]}\n\n${c}`).join("\n\n");
  return `---\n${[...head, ...lists].join("\n")}\n---\n${body}\n`;
}
