// 카드를 만든다(문서 4.3-2). 관리자가 로컬 맥에서 실행한다. 뜻풀이가 로컬 수집 DB에만 있어 서버에서는 만들 수 없다.
// 사용: npm run cards:generate -- <장수> [--level a1|a2|b1|b2|c1] [--dev]
// - 장수는 이번 실행에서 새로 만들 장수다. 원격에서 카드가 없는 항목만 고르므로 끊긴 뒤 다시 실행해도 만든 카드를 다시 만들지 않는다.
// - 레벨을 주면 그 레벨에서만 고르고, 모자라면 있는 만큼만 만든다. 없으면 가장 낮은 레벨부터 고른다.
// - 카드 내용에 뜻풀이 원문이 그대로 들어가면 실패로 보고 한 번 다시 생성한다. 금지 문자열(출처 표시)은 카드에서 보지 않는다.
// 운영 DB(기본)면 먼저 백업한다. 생성 모델과 프롬프트는 앱 설정과 같다(Opus 5.5, high).
import "./env";
import { config } from "@/config";
import { openDb } from "@/db";
import { claudeGenerate, PRICE_PER_MTOK } from "@/lib/card-gen/claude";
import { BATCH_SIZE, createCards, sourceLeak } from "@/lib/card-gen/create";
import { LEVELS, type Level } from "@/lib/study/schedule";
import { loadSources } from "./checks/basis";
import { loadGenInputs, openLocal } from "./lib/local-db";
import { backupBeforeChange, target } from "./lib/target";

function args() {
  const a = process.argv.slice(2);
  const n = Number(a.find((x) => /^\d+$/.test(x)));
  const li = a.indexOf("--level");
  const level = li >= 0 ? a[li + 1]?.toLowerCase() : undefined;
  if (!Number.isInteger(n) || n <= 0) throw new Error("사용: npm run cards:generate -- <장수> [--level b1] [--dev]");
  if (level !== undefined && !LEVELS.includes(level as Level)) throw new Error(`레벨은 ${LEVELS.join(", ")} 중 하나입니다`);
  return { n, level: level as Level | undefined };
}

const cost = (u: { inputTokens: number; outputTokens: number }) => (u.inputTokens * PRICE_PER_MTOK.input + u.outputTokens * PRICE_PER_MTOK.output) / 1e6;

async function main() {
  const { n, level } = args();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY가 없습니다(web/.env.local)");
  const leak = sourceLeak(loadSources());
  const t = target();
  console.log(`${t.name} DB에 카드 ${n}장을 만듭니다${level ? `(${level.toUpperCase()}만)` : ""}. 모델 ${config.genModel}, ${BATCH_SIZE}장씩.`);
  await backupBeforeChange(t);

  const local = openLocal();
  const { db, pool } = openDb(t.url, 2);
  try {
    const r = await createCards(db, claudeGenerate, (ids) => loadGenInputs(local, ids), leak, n, {
      level,
      onBatch: (done, total, so) => console.log(`  ${done}/${total} 처리: 만든 카드 ${so.created}, 실패 ${so.failed.length}, 비용 약 $${cost(so.usage).toFixed(3)}`),
    });
    if (r.created === 0 && r.failed.length === 0) console.log("카드를 만들 항목이 남지 않았습니다.");
    for (const f of r.failed) console.log(`  실패 ${f.headword} (항목 ${f.itemId}): ${f.reason}`);
    console.log(`끝: 만든 카드 ${r.created}장, 실패 ${r.failed.length}개(다음 실행 때 다시 후보), 토큰 입력 ${r.usage.inputTokens} / 출력 ${r.usage.outputTokens}, 비용 약 $${cost(r.usage).toFixed(3)}`);
  } finally {
    local.close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`실패: ${(e as Error).message}`);
  process.exit(1);
});
