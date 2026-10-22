// Claude API로 카드를 만든다. 모델과 effort는 2-3-3 검증과 같게 둔다(Opus 5.5, high).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "@/config";
import type { Generate } from "./create";
import { GEN_SYSTEM, GenOutputSchema, genMessage } from "./prompt";

export const claudeGenerate: Generate = async (items) => {
  const client = new Anthropic();
  const res = await client.messages.parse(
    {
      model: config.genModel,
      max_tokens: 32000,
      system: GEN_SYSTEM,
      messages: [{ role: "user", content: genMessage(items) }],
      output_config: { effort: "high", format: zodOutputFormat(GenOutputSchema) },
    },
    { timeout: 15 * 60 * 1000 },
  );
  if (res.stop_reason !== "end_turn" || !res.parsed_output) {
    throw new Error(`응답이 끝나지 않음(stop_reason=${res.stop_reason})`);
  }
  console.log(`[카드 생성] ${config.genModel} 입력 ${res.usage.input_tokens} / 출력 ${res.usage.output_tokens} 토큰`);
  return res.parsed_output.cards;
};
