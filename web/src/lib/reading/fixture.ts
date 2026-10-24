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
