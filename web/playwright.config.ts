// E2E 테스트(문서 4.8-1). 테스트 DB(Neon test 브랜치)를 쓰는 개발 서버를 따로 띄워 테스트 로그인으로 들어간다.
// 판정은 가짜 판정(SENSEFUL_FAKE_GRADER)을 써 API 비용을 쓰지 않는다. 실행: npm run test:e2e
import { defineConfig, devices } from "@playwright/test";

const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error("E2E_DATABASE_URL이 없습니다. npm run test:e2e로 실행합니다");
const PORT = 3100;

export default defineConfig({
  testDir: "test/e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SENSEFUL_FAKE_GRADER: "1", NEXT_DIST_DIR: ".next-e2e", ANTHROPIC_API_KEY: "" },
  },
});
