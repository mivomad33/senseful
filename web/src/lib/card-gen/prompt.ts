// 카드 생성 프롬프트. 2-3-3에서 검증한 eval/card-gen/gen-prompt.ts를 옮겨 왔다.
// 프롬프트 문구를 바꾸면 검증 결과와 달라지므로, 고칠 때는 eval 쪽도 같이 고치고 다시 검증한다.
import { z } from "zod";

export interface GenItem {
  kind: "word" | "phrase" | "idiom" | "phrasal_verb";
  headword: string;
  pos: string | null;
  level: string;
  shortcut: string | null;
  grammar: string | null;
  labels: string | null;
  def: string;
}

export const GenCardSchema = z.object({
  id: z.number().int().describe("입력 항목 번호"),
  sense_ko: z.string(),
  example_en: z.string(),
  example_ko: z.string(),
});
export const GenOutputSchema = z.object({ cards: z.array(GenCardSchema) });
export type GenCard = z.infer<typeof GenCardSchema>;

const KIND_KO: Record<GenItem["kind"], string> = {
  word: "단어",
  phrase: "구",
  idiom: "관용구",
  phrasal_verb: "구동사",
};

export const GEN_SYSTEM = `당신은 한국인 학습자를 위한 영어 학습 카드를 만든다. 학습 항목 목록을 받아 항목마다 카드 하나를 만든다.
학습자는 카드의 영어 예문을 한국어로 번역하며 복습한다. 카드는 검토 없이 바로 저장되므로, 틀린 내용이 하나도 없어야 한다.

## 입력
항목마다 번호, 종류(단어/구/관용구/구동사), 표기, 품사, 레벨(CEFR), 학습자용 영영사전의 뜻풀이가 주어진다.
구분 표시, 문법 표시, 사용역 표시가 함께 주어질 수 있다.
- 카드의 뜻은 **주어진 뜻풀이의 뜻**이다. 그 단어의 다른 뜻으로 바꾸거나 넓히지 않는다.
- 구의 뜻풀이는 그 구가 들어 있는 단어 뜻의 뜻풀이여서 구보다 넓을 수 있다. 구 카드는 **구 표기 전체의 뜻**으로 만들되, 뜻풀이와 어긋나지 않게 한다.
  예: "get off"의 뜻풀이가 get의 "어느 곳으로/에서 이동하다"이면 한국어 뜻은 "(탈것에서) 내리다"다.
- 표기의 sb(somebody), sth(something), …, 괄호는 자리 표시다. 예문에서는 알맞은 말로 채운다.

## 카드 필드
- id: 입력 항목 번호
- sense_ko: 이 뜻의 한국어 뜻. 사전 표제처럼 짧게 쓰되, 같은 단어의 다른 뜻과 구분되도록 필요하면 괄호로 쓰임을 덧붙인다.
  예: "(시험에서 점수를) 받다", "(~을) 담당하는"
- example_en: 이 뜻으로 쓰인 영어 예문 한 문장.
  - 항목의 표기(활용형 가능)를 그대로 쓰고, 문맥만으로 이 뜻임이 드러나게 쓴다. 다른 뜻으로도 읽힐 수 있는 문장은 쓰지 않는다.
  - 문법이 정확하고 원어민이 실제로 쓸 법한 자연스러운 문장으로 쓴다. 품사와 문법 표시(가산/불가산, 타동/자동 등)를 지킨다.
  - 해당 레벨 학습자가 이해할 수 있는 쉬운 어휘로 쓴다. 너무 짧아 문맥이 없거나 너무 긴 문장은 피한다.
- example_ko: 예문의 한국어 번역. 의미를 빠짐없이 정확히 옮기되, 직역투가 아닌 자연스러운 한국어로 쓴다.

## 출력
입력 항목마다 정확히 카드 하나를, 입력 순서대로 출력한다. 항목을 빼거나 합치거나 더하지 않는다.`;

export function genMessage(items: GenItem[]): string {
  return items
    .map((it, i) => {
      const lines = [`${i}. [${KIND_KO[it.kind]}] ${it.headword}${it.pos && it.pos !== "phrasal verb" ? ` (${it.pos})` : ""} — ${it.level.toUpperCase()}`];
      if (it.shortcut) lines.push(`   구분 표시: ${it.shortcut}`);
      if (it.grammar) lines.push(`   문법: ${it.grammar}`);
      if (it.labels) lines.push(`   사용역: ${it.labels}`);
      lines.push(`   뜻풀이: ${it.def}`);
      return lines.join("\n");
    })
    .join("\n");
}
