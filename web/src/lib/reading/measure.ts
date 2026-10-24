// 읽기 글 측정(docs/specs/2026-10-reading-gen 4.1). 본문을 단어로 나눠 원형으로 묶고, 목표 레벨을 넘는 단어 종류의 비율을 잰다.
// - 원형 후보: 겉모양 그대로 + 명사·동사·형용사 원형(wink-lemmatizer) + 기능어 대응(an→a 등). 사전에 있는 후보 중 가장 낮은 레벨을 쓴다(found → find).
// - 축약형은 나눠서(don't → do, not), 소유격 's는 떼고 센다. 숫자와 고유명사는 종류에 넣지 않는다. 전체 단어 수에는 모두 넣는다.
// - 고유명사: 문장 중간의 대문자 단어 중 대문자 표제어(Monday, TV)가 아닌 것. 문장 첫 대문자 단어는 일반 단어로 보고, 사전에 없으면서 같은 모양이 문장 중간에도 대문자로 나올 때만 고유명사로 본다.
import lemmatizer from "wink-lemmatizer";
import { foldText, wordKey, type Lexicon } from "./lexicon";
import { InputError, lengthRange, levelRank, rangeAround, withinRatio, type ReadingLevel } from "./rules";

/** 사전에 없는 형태가 바뀐 기능어 */
const FUNCTION_FORMS: Record<string, string> = { an: "a", these: "this", those: "that" };

/** 's가 is·has로 읽히는 앞말. 나머지는 소유격으로 본다 */
const S_AS_VERB = new Set(["it", "he", "she", "that", "there", "what", "where", "who", "here", "how", "when", "why", "this", "everyone", "everything", "nothing", "something", "someone", "nobody"]);

export interface AboveWord {
  /** 원형(종류의 key) */
  lemma: string;
  /** 본문에 나온 모양 */
  forms: string[];
  /** 단어 레벨. 사전에 없으면 null */
  level: ReadingLevel | null;
}

export interface Measurement {
  level: ReadingLevel;
  pass: boolean;
  /** 넘는 종류 수 ÷ 센 종류 수 */
  ratio: number;
  aboveTypes: number;
  countedTypes: number;
  totalWords: number;
  lengthRange: [number, number];
  /** 미달 이유. 통과면 빈 배열 */
  reasons: string[];
  above: AboveWord[];
  properNouns: string[];
  /** 본문이 덮는 사전 단어(key). 센 단어의 원형 후보 중 사전에 있는 것 모두. 고유명사는 넣지 않는다 */
  covers: string[];
  sentences: number;
  avgSentenceLength: number;
  /** 큰따옴표 안 단어 수(opts.dialogue일 때만 센다) */
  dialogueWords?: number;
}

interface Token {
  text: string;
  start: number;
  end: number;
  sentenceStart: boolean;
}

/** 경칭. 이름과 함께 고유명사로 빼고, 뒤의 점은 문장 끝으로 보지 않는다 */
const HONORIFICS = new Set(["Mr", "Mrs", "Ms", "Dr"]);
const HONORIFIC_DOT = /(^|[^A-Za-z])(Mr|Mrs|Ms|Dr)\.$/;

const TOKEN = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*(?:-[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*)*/g;

function tokenize(body: string): Token[] {
  const out: Token[] = [];
  for (const m of body.matchAll(TOKEN)) {
    const pre = body.slice(0, m.index);
    const before = pre.replace(/["'\u201c\u201d()[\]\s*_]+$/, "");
    // 문장 첫 단어: 글 처음, 문장 부호 뒤(닫는 괄호·따옴표 너머까지, 경칭의 점은 빼고), 문단 처음, 목록·제목 표시 뒤, 여는 따옴표 바로 뒤(인용문의 첫 단어)
    const ended = /[.!?:\u2026]$/.test(before) && !HONORIFIC_DOT.test(before);
    const lineStart = /\n\s*$/.test(pre) || /(^|\n)[ \t]*([-*+]|#+|\d+[.)])[ \t]+$/.test(pre);
    const sentenceStart = before === "" || ended || lineStart || /(^|[\s(\[])["'\u201c]$/.test(pre);
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length, sentenceStart });
  }
  return out;
}

function countSentences(body: string): number {
  return body.split(/[.!?]+(?=["')\]]*(?:\s|$))/).filter((s) => /[A-Za-z0-9]/.test(s)).length;
}

const isCap = (s: string) => /^[A-Z]/.test(s);
const hasDigit = (s: string) => /\d/.test(s);

/** 소문자 단어의 원형 후보(겉모양 포함, 중복 없음) */
function candidates(w: string): string[] {
  const c = [w, lemmatizer.noun(w), lemmatizer.verb(w), lemmatizer.adjective(w)];
  if (FUNCTION_FORMS[w]) c.push(FUNCTION_FORMS[w]);
  return [...new Set(c)];
}

/** 사전에 있는 후보 중 가장 낮은 레벨. 없으면 대표 원형과 null */
function resolve(w: string, lex: Lexicon): { lemma: string; level: ReadingLevel | null; known: boolean; capHeadword: boolean; keys: string[] } {
  const c = candidates(w);
  const keys = c.filter((k) => lex.level.has(k));
  let best: { lemma: string; level: ReadingLevel } | null = null;
  for (const k of c) {
    const lv = lex.level.get(k);
    if (lv && (!best || levelRank(lv) < levelRank(best.level))) best = { lemma: k, level: lv };
  }
  const capHeadword = c.some((k) => lex.capitalized.has(k));
  if (best) return { ...best, known: true, capHeadword, keys };
  const lemma = c.find((k) => k !== w && k.length < w.length) ?? w;
  return { lemma, level: null, known: false, capHeadword, keys };
}

/** 축약형을 나눈 부분(소문자). 사전에 그대로 있는 모양(o'clock)은 나누지 않는다 */
function splitContraction(lower: string, lex: Lexicon): string[] {
  if (!lower.includes("'") || lex.level.has(lower)) return [lower];
  const nt = /^(.+)n't$/.exec(lower);
  if (nt) {
    const base = { ca: "can", wo: "will", sha: "shall", ai: "be" }[nt[1]] ?? nt[1];
    return [base, "not"];
  }
  const m = /^(.+)'(s|re|ve|ll|d|m)$/.exec(lower);
  if (m) {
    const [, base, tail] = m;
    if (tail === "s") {
      if (base === "let") return ["let", "us"];
      return S_AS_VERB.has(base) ? [base, "be"] : [base];
    }
    return [base, { re: "be", ve: "have", ll: "will", d: "would", m: "be" }[tail]!];
  }
  return lower.split("'").filter(Boolean);
}

/** 측정 옵션. names: 같은 이야기의 다른 장처럼, 문장 중간 대문자 이름을 함께 찾을 글(고유명사 판별 문맥) */
export interface MeasureOptions {
  names?: string[];
  /** 길이 목표(단어 수). 없으면 짧은 글의 레벨 길이(TARGET_WORDS) */
  lengthTarget?: number;
  /** 큰따옴표 안 단어를 센다. 문단 끝에서 따옴표가 열려 있으면 입력 오류 */
  dialogue?: boolean;
}

/** 큰따옴표("…", “…”) 안의 구간 [시작, 끝]. 작은따옴표는 아포스트로피와 구별할 수 없어 세지 않는다.
 * 따옴표는 문단(빈 줄로 나뉜 덩어리) 안에서 닫혀야 한다. 짝이 밀려 비율이 조용히 틀리지 않게 하기 위해서다 */
function quoteSpans(body: string): [number, number][] {
  const spans: [number, number][] = [];
  let start = 0;
  body.split(/(\r?\n[ \t]*\r?\n)/).forEach((part, k) => {
    if (k % 2 === 0) {
      const para = k / 2 + 1;
      let open = -1;
      for (let i = 0; i < part.length; i++) {
        const c = part[i];
        // 둥근 따옴표는 방향이 있으므로, 방향이 어긋나면 짝이 밀린 것으로 보고 멈춘다
        if ((c === "\u201c" && open >= 0) || (c === "\u201d" && open < 0)) throw new InputError(`${para}번째 문단에서 둥근 큰따옴표의 짝이 맞지 않습니다`);
        if (open < 0 && (c === '"' || c === "\u201c")) open = i;
        else if (open >= 0 && (c === '"' || c === "\u201d")) {
          spans.push([start + open, start + i]);
          open = -1;
        }
      }
      if (open >= 0) throw new InputError(`${para}번째 문단에서 큰따옴표가 닫히지 않았습니다(대사는 문단마다 닫습니다)`);
    }
    start += part.length;
  });
  return spans;
}

/** 표기를 맞추고, 남은 영어 밖 글자가 있으면 입력 오류 */
function prepare(rawBody: string): string {
  const body = foldText(rawBody);
  // 맞춘 뒤에도 남은 영어 밖 글자(키릴 문자, 한자 등)는 단어를 조각내 다른 단어처럼 세게 하므로 받지 않는다
  for (const ch of body) {
    if (ch > "\x7f" && /\p{L}/u.test(ch)) throw new InputError(`영어 밖 글자가 있습니다: ${ch}`);
  }
  return body;
}

/** 문장 중간에 대문자로 나온 단어의 첫 부분(하이픈·축약·소유격을 뗀 것) 소문자. 문장 첫 단어의 고유명사 판별에 쓴다 */
function midCapitalHeads(tokens: Token[], lex: Lexicon): string[] {
  return tokens.filter((t) => !t.sentenceStart && isCap(t.text)).map((t) => splitContraction(t.text.split("-")[0].toLowerCase(), lex)[0]);
}

/** 여러 글의 본문에서 문장 중간에 대문자로 나온 이름의 첫 부분(소문자) */
export function nameHeads(texts: string[], lex: Lexicon): Set<string> {
  return new Set(texts.flatMap((t) => midCapitalHeads(tokenize(prepare(t)), lex)));
}

/** 제목을 문장처럼 바꾼다: 대문자로 시작하는 단어 중 이름(names)이 아닌 것은 소문자로. 제목식 대문자 단어가 고유명사로 빠져 재지 않은 채 남지 않게 한다 */
export function sentenceCaseTitle(title: string, names: Set<string>, lex: Lexicon): string {
  return title.replace(TOKEN, (w) => {
    if (!isCap(w) || HONORIFICS.has(w)) return w;
    const h = splitContraction(w.split("-")[0].toLowerCase(), lex)[0];
    return names.has(h) ? w : w.toLowerCase();
  });
}

export function measure(rawBody: string, level: ReadingLevel, lex: Lexicon, opts: MeasureOptions = {}): Measurement {
  const body = prepare(rawBody);
  const tokens = tokenize(body);
  const totalWords = tokens.length;

  const capMid = new Set(midCapitalHeads(tokens, lex));
  for (const other of opts.names ?? []) for (const h of midCapitalHeads(tokenize(prepare(other)), lex)) capMid.add(h);
  const covers = new Set<string>();

  const types = new Map<string, { level: ReadingLevel | null; forms: Set<string> }>();
  const properNouns = new Set<string>();
  const addType = (lemma: string, lv: ReadingLevel | null, form: string) => {
    const t = types.get(lemma) ?? { level: lv, forms: new Set<string>() };
    t.forms.add(form);
    types.set(lemma, t);
  };

  /** 단어 하나(축약·하이픈을 나눈 뒤)를 센다. surface: 본문에 쓴 모양, first: 문장 첫 단어의 첫 부분인지 */
  const countWord = (part: string, surface: string, original: string, first: boolean) => {
    const r = resolve(part.toLowerCase(), lex);
    // 다른 곳에서 이름으로 쓰인 단어가 문장 첫머리에 오면 측정에는 세되(엄격하게), 그 단어를 덮지는 않는다(이름이 일반 단어를 덮지 않게)
    let nameAtStart = false;
    if (isCap(part) && !r.capHeadword) {
      if (!first) return void properNouns.add(surface);
      if (capMid.has(part.toLowerCase())) {
        if (!r.known) return void properNouns.add(surface);
        nameAtStart = true;
      }
    }
    if (!nameAtStart) for (const k of r.keys) covers.add(k);
    addType(r.lemma, r.level, original);
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // 띄어 쓴 표제어(ice cream): 단어 사이가 공백뿐일 때만
    const hit = lex.multi.find((words) => {
      if (i + words.length > tokens.length) return false;
      return words.every((w, j) => {
        const tk = tokens[i + j];
        if (tk.text.toLowerCase() !== w) return false;
        return j === 0 || /^\s+$/.test(body.slice(tokens[i + j - 1].end, tk.start));
      });
    });
    if (hit) {
      const key = hit.join(" ");
      covers.add(key);
      addType(key, lex.level.get(key)!, tokens.slice(i, i + hit.length).map((x) => x.text).join(" "));
      i += hit.length - 1;
      continue;
    }
    if (HONORIFICS.has(t.text)) {
      properNouns.add(t.text);
      continue;
    }
    const whole = wordKey(t.text);
    if (t.text.includes("-") && !hasDigit(t.text) && lex.level.has(whole)) {
      const r = resolve(whole, lex);
      if (isCap(t.text) && !r.capHeadword && !t.sentenceStart) properNouns.add(t.text);
      else {
        for (const k of r.keys) covers.add(k);
        addType(r.lemma, r.level, t.text);
      }
      continue;
    }
    t.text.split("-").forEach((seg, si) => {
      // 숫자 조각(3, 2026, 1st, 2020's)은 세지 않는다. 글자와 숫자가 붙은 조각 중 대문자가 있는 약어(CO2, G7)는 고유명사처럼 빼고,
      // 소문자만 있는 것(zebra2)은 목록에 없는 단어로 센다
      if (hasDigit(seg)) {
        const bare = seg.replace(/'s$/i, "");
        if (/^\d+[a-z]{0,2}$/i.test(bare)) return;
        if (/[A-Z]/.test(bare)) {
          if (!(t.sentenceStart && si === 0)) properNouns.add(bare);
          return;
        }
        addType(bare.toLowerCase(), null, t.text);
        return;
      }
      const pieces = splitContraction(seg.toLowerCase(), lex);
      pieces.forEach((p, pi) => {
        // 대소문자는 원래 모양을 따른다(나눈 첫 부분만 원래 대문자를 가진다)
        const shaped = pi === 0 && isCap(seg) ? p.charAt(0).toUpperCase() + p.slice(1) : p;
        countWord(shaped, pi === 0 ? seg.split("'")[0] : p, t.text, t.sentenceStart && si === 0 && pi === 0);
      });
    });
  }

  const target = levelRank(level);
  const above: AboveWord[] = [...types]
    .filter(([, v]) => v.level === null || levelRank(v.level) > target)
    .map(([lemma, v]) => ({ lemma, forms: [...v.forms], level: v.level }))
    .sort((a, b) => a.lemma.localeCompare(b.lemma));
  const countedTypes = types.size;
  const range = opts.lengthTarget ? rangeAround(opts.lengthTarget) : lengthRange(level);
  let dialogueWords: number | undefined;
  if (opts.dialogue) {
    const spans = quoteSpans(body);
    dialogueWords = tokens.filter((t) => spans.some(([a, b]) => t.start > a && t.end <= b)).length;
  }
  const reasons: string[] = [];
  if (countedTypes === 0) reasons.push("센 단어가 없습니다");
  else if (!withinRatio(above.length, countedTypes)) reasons.push(`넘는 단어 비율 ${(above.length / countedTypes * 100).toFixed(1)}%가 한도 5%를 넘습니다`);
  if (totalWords < range[0] || totalWords > range[1]) reasons.push(`전체 단어 수 ${totalWords}가 범위 ${range[0]}~${range[1]} 밖입니다`);
  const sentences = countSentences(body);
  return {
    level,
    pass: reasons.length === 0,
    ratio: countedTypes ? above.length / countedTypes : 0,
    aboveTypes: above.length,
    countedTypes,
    totalWords,
    lengthRange: range,
    reasons,
    above,
    properNouns: [...properNouns].sort(),
    covers: [...covers].sort(),
    sentences,
    avgSentenceLength: sentences ? Math.round((totalWords / sentences) * 10) / 10 : 0,
    ...(dialogueWords === undefined ? {} : { dialogueWords }),
  };
}
