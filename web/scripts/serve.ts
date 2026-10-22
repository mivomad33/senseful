// 운영 서버. 사용: npm start (먼저 npm run build)
// next start 대신 Next를 직접 띄워, 요청이 SENSEFUL_IDLE_MINUTES 동안 없으면 스스로 끈다.
// 쓸 때만 켜고(Dock의 Senseful.app) 안 쓸 때 메모리를 쓰지 않기 위해서다. 이 맥에서만 접속을 받는다.
import "./env";
import { createServer } from "node:http";
import next from "next";
import { config } from "@/config";
import { migrateDb } from "@/db/migrate";

const host = "127.0.0.1";
const idleMs = config.idleMinutes * 60_000;

async function main() {
  // 코드를 바꾸며 스키마가 바뀌어도 잊지 않게, 켤 때 마이그레이션을 적용한다(이미 적용한 것은 건너뛴다).
  migrateDb(config.dbPath);

  const app = next({ dev: false, hostname: host, port: config.port });
  const handle = app.getRequestHandler();
  await app.prepare();

  let lastActive = Date.now();
  let inFlight = 0;
  const server = createServer((req, res) => {
    inFlight++;
    lastActive = Date.now();
    res.on("close", () => {
      inFlight--;
      lastActive = Date.now();
    });
    handle(req, res);
  });
  server.listen(config.port, host, () => {
    const idle = idleMs > 0 ? `${config.idleMinutes}분 동안 요청이 없으면 종료` : "자동 종료 없음";
    console.log(`> http://localhost:${config.port} (${idle})`);
  });

  if (idleMs > 0) {
    setInterval(() => {
      // 판정·생성처럼 오래 걸리는 요청이 진행 중이면 기다린다.
      if (inFlight > 0 || Date.now() - lastActive < idleMs) return;
      console.log(`> ${config.idleMinutes}분 동안 요청이 없어 종료한다`);
      process.exit(0);
    }, Math.min(30_000, idleMs)).unref();
  }
}

main();
