// 운영 배포(문서 4.6-8, 4.8-13). 사용: npm run deploy
// 순서: verify → 커밋된 파일만 임시 폴더로 꺼내기 → vercel build(Production) → 배포 결과물 검사 → vercel deploy --prebuilt --prod → 배포 뒤 점검.
// 앞 단계가 실패하면 멈춘다. 작업 폴더에서 빌드하지 않는 것은 함수가 참조하는 파일에 .env.local 같은 로컬 파일이 섞이지 않게 하고,
// 운영 배포의 코드가 커밋과 같게 하기 위해서다. 그래서 커밋하지 않은 변경이 있으면 배포하지 않는다.
import "./env";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SITE_URL } from "@/config";
import { ROOT, WEB } from "./checks/basis";

/** Vercel CLI 버전(README에도 적는다) */
export const VERCEL = "vercel@65.1.0";

function run(label: string, cmd: string, args: string[], cwd: string, capture = false): string {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd, stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit", encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`✗ ${label} 실패. 배포를 멈춥니다.`);
    process.exit(1);
  }
  return r.stdout ?? "";
}

function main() {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    console.error("✗ 커밋하지 않은 변경이 있어 배포하지 않습니다. 커밋한 뒤 다시 실행합니다.");
    process.exit(1);
  }
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  run("verify", "npm", ["run", "verify"], WEB);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `senseful-deploy-${sha}-`));
  const project = path.join(dir, "web");
  console.log(`\n▶ 커밋 ${sha}의 파일을 꺼냅니다: ${project}`);
  execFileSync("sh", ["-c", `git archive --format=tar HEAD web | tar -x -C "${dir}"`], { cwd: ROOT });
  fs.rmSync(path.join(project, ".env.example"), { force: true }); // 배포 결과물에는 .env* 파일을 두지 않는다
  fs.mkdirSync(path.join(project, ".vercel"));
  fs.copyFileSync(path.join(WEB, ".vercel/project.json"), path.join(project, ".vercel/project.json"));

  run("의존성 설치", "npm", ["ci", "--no-audit", "--no-fund"], project);
  run("Vercel 설정 받기", "npx", ["--yes", VERCEL, "pull", "--yes", "--environment=production"], project);
  run("vercel build (Production)", "npx", ["--yes", VERCEL, "build", "--prod"], project);
  run("배포 결과물 검사", "npx", ["tsx", path.join(WEB, "scripts/checks/output-check.ts"), project], WEB);
  const out = run("vercel deploy --prebuilt --prod", "npx", ["--yes", VERCEL, "deploy", "--prebuilt", "--prod"], project, true);
  console.log(out.trim());
  // 운영 주소가 새 배포로 바뀐 직후에는 잠깐 이전 배포의 HTML이 캐시에서 나가 JS·CSS가 404일 수 있다. 실패하면 기다렸다가 두 번까지 다시 점검한다.
  for (let attempt = 1; ; attempt++) {
    console.log(`\n▶ 배포 뒤 점검 (${attempt}번째)`);
    const ok = spawnSync("npx", ["tsx", path.join(WEB, "scripts/smoke.ts"), SITE_URL], { cwd: WEB, stdio: "inherit" }).status === 0;
    if (ok) break;
    if (attempt === 3) {
      console.error("✗ 배포 뒤 점검 실패.");
      process.exit(1);
    }
    console.log("20초 뒤 다시 점검합니다.");
    execFileSync("sleep", ["20"]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n✓ 배포 끝: ${SITE_URL} (커밋 ${sha})`);
}

main();
