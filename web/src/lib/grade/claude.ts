// Claude API로 답안을 판정한다. 모델과 effort는 2-5 검증과 같게 둔다(Opus 5.5 v2, medium).
// 시스템 프롬프트는 호출마다 같으므로 캐싱한다(개요 문서 7장). 캐시 적중은 사용량 로그의 cache_read로 확인한다.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/config";
import { GRADE_SYSTEM, GradeSchema, gradeMessage, type Grade, type GradeInput } from "./prompt";

export type Grader = (input: GradeInput) => Promise<Grade>;

export const claudeGrade: Grader = async (input) => {
  const client = new Anthropic();
  const res = await client.messages.parse(
    {
      model: config.gradeModel,
      max_tokens: 8000,
      system: [{ type: "text", text: GRADE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: gradeMessage(input) }],
      output_config: { effort: "medium", format: zodOutputFormat(GradeSchema) },
    },
    { timeout: 2 * 60 * 1000 },
  );
  if (res.stop_reason !== "end_turn" || !res.parsed_output) {
    throw new Error(`응답이 끝나지 않음(stop_reason=${res.stop_reason})`);
  }
  const u = res.usage;
  console.log(
    `[판정] ${config.gradeModel} 입력 ${u.input_tokens} / 캐시 쓰기 ${u.cache_creation_input_tokens ?? 0} / 캐시 읽기 ${u.cache_read_input_tokens ?? 0} / 출력 ${u.output_tokens} 토큰`,
  );
  return res.parsed_output;
};
