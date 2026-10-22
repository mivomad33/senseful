// 배포 결과물 검사(문서 4.6-8, 4.8-12). vercel build가 만든 .vercel/output과, 함수가 참조해 함께 올라가는 파일(filePathMap)을 본다.
// 사용: tsx scripts/checks/output-check.ts [프로젝트 폴더(기본 web/)]  — 배포 명령이 업로드 전에 자동으로 부른다.
// 찾은 문자열은 출력하지 않고 종류와 파일만 알린다.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BasisMissingError, loadBasis, patternFile, WEB, type Basis } from "./basis";
import { checkJsonLd, checkPublicPage, checkRobots, checkSitemap, DEV_LOGIN_MARKER, iconHrefs, isNoindex, PUBLIC_PATHS } from "./page-rules";

const BINARY = /\.(png|ico|jpe?g|gif|webp|avif|woff2?|ttf|otf|wasm|node|br|gz|zip)$/i;

/** 디렉터리 아래 모든 파일(심볼릭 링크를 따라간다) */
function walk(dir: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const go = (d: string) => {
    const real = fs.realpathSync(d);
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of fs.readdirSync(d)) {
      const p = path.join(d, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) go(p);
      else out.push(p);
    }
  };
  go(dir);
  return out;
}

/** 함수가 참조하는 프로젝트 파일(업로드 대상). filePathMap의 값은 프로젝트 폴더 기준 경로다. */
function mappedFiles(project: string, output: string): string[] {
  const out = new Set<string>();
  for (const f of walk(path.join(output, "functions"))) {
    if (path.basename(f) !== ".vc-config.json") continue;
    const c = JSON.parse(fs.readFileSync(f, "utf8")) as { filePathMap?: Record<string, string> };
    for (const v of Object.values(c.filePathMap ?? {})) {
      const p = path.resolve(project, v);
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) walk(p).forEach((x) => out.add(x));
      else out.add(p);
    }
  }
  return [...out];
}

/**
 * 여러 파일에서 패턴 파일의 문자열이 들어 있는 파일 목록. 패턴이 만 개 넘게 많아 git grep(--no-index)의 빠른 고정 문자열 검색을 쓴다.
 * 파일은 임시 폴더에 복사하지 않고 그 자리에서 본다(git grep은 작업 폴더 밖 경로를 받지 않아 부모 폴더 기준 상대 경로로 넘긴다).
 */
function grepFiles(files: string[], patterns: string, flags: string[]): string[] {
  const hits: string[] = [];
  const byRoot = new Map<string, string[]>();
  for (const f of files) {
    const root = f.includes("/node_modules/") ? f.slice(0, f.indexOf("/node_modules/")) : path.dirname(f);
    byRoot.set(root, [...(byRoot.get(root) ?? []), path.relative(root, f)]);
  }
  for (const [root, rel] of byRoot) {
    for (let i = 0; i < rel.length; i += 300) {
      try {
        const out = execFileSync("git", ["grep", "--no-index", "-l", "-F", ...flags, "-f", patterns, "--", ...rel.slice(i, i + 300)], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
        hits.push(...out.split("\n").filter(Boolean).map((r) => path.join(root, r)));
      } catch (e) {
        if ((e as { status?: number }).status !== 1) throw e;
      }
    }
  }
  return hits;
}

export function checkOutput(project: string, basis: Basis): { failures: string[]; scanned: number } {
  const output = path.join(project, ".vercel/output");
  if (!fs.existsSync(output)) return { failures: [`결과물이 없습니다: ${output}`], scanned: 0 };
  const failures: string[] = [];
  const rel = (f: string) => path.relative(project, f);
  const files = [...new Set([...walk(output), ...mappedFiles(project, output)])];

  // 1. 금지 파일: data/ 아래 파일, *.db, .env*(예시 파일 포함)
  for (const f of files) {
    const r = rel(f);
    const base = path.basename(f);
    if (!fs.existsSync(f)) failures.push(`참조한 파일이 없습니다: ${r}`);
    if (r.startsWith("data/") || (/(^|\/)data\//.test(r) && !r.includes("node_modules/"))) failures.push(`data/ 파일: ${r}`);
    if (/\.db(-\w+)?$/.test(base)) failures.push(`DB 파일: ${r}`);
    if (base.startsWith(".env")) failures.push(`환경 변수 파일: ${r}`);
  }

  // 2. 금지 내용: 금지 문자열, 원문 문자열, 비밀 값, 테스트 로그인 흔적
  const text = files.filter((f) => fs.existsSync(f) && !BINARY.test(f));
  const plain = patternFile(basis.patterns.filter((p) => !p.word).map((p) => p.text));
  const word = patternFile(basis.patterns.filter((p) => p.word).map((p) => p.text));
  const sources = patternFile(basis.sources);
  const secrets = patternFile(basis.secrets);
  const marker = patternFile([DEV_LOGIN_MARKER]);
  try {
    for (const f of grepFiles(text, plain.file, ["-i"])) failures.push(`금지 문자열: ${rel(f)}`);
    if (basis.patterns.some((p) => p.word)) for (const f of grepFiles(text, word.file, ["-i", "-w"])) failures.push(`금지 문자열: ${rel(f)}`);
    for (const f of grepFiles(text, sources.file, [])) failures.push(`원문 문자열: ${rel(f)}`);
    for (const f of grepFiles(files.filter((x) => fs.existsSync(x)), secrets.file, ["--text"])) failures.push(`비밀 값: ${rel(f)}`);
    for (const f of grepFiles(text, marker.file, [])) failures.push(`테스트 로그인 흔적: ${rel(f)}`);
  } finally {
    [plain, word, sources, secrets, marker].forEach((p) => p.cleanup());
  }

  // 3. 정적 페이지: 검색엔진이 수집하는(noindex가 없는) 페이지는 모두 규칙을 지킨다. 문서의 공개 페이지는 반드시 있다.
  const fn = path.join(output, "functions");
  const pages = fs
    .readdirSync(fn)
    .filter((f) => f.endsWith(".prerender-fallback.html") && !f.startsWith("_"))
    .map((f) => ({ route: f === "index.prerender-fallback.html" ? "/" : `/${f.replace(".prerender-fallback.html", "").replace(/\./g, "/")}`, html: fs.readFileSync(path.join(fn, f), "utf8") }));
  for (const p of PUBLIC_PATHS) if (!pages.some((x) => x.route === p)) failures.push(`정적 페이지가 없습니다: ${p}`);
  for (const p of pages) {
    if (isNoindex(p.html)) continue;
    for (const b of checkPublicPage(p.html, p.route)) failures.push(`${p.route}: ${b}`);
    if (p.route === "/") for (const b of checkJsonLd(p.html)) failures.push(`/: ${b}`);
    for (const href of iconHrefs(p.html)) {
      const name = href.split("?")[0].slice(1);
      if (!fs.existsSync(path.join(fn, `${name}.prerender-fallback.body`)) && !fs.existsSync(path.join(output, "static", name))) failures.push(`${p.route}: 아이콘 파일이 결과물에 없습니다(${name})`);
    }
  }
  if (!fs.existsSync(path.join(output, "static/og.png"))) failures.push("og:image 파일(og.png)이 결과물에 없습니다");

  // 4. robots.txt, sitemap.xml
  const body = (name: string) => {
    const f = path.join(fn, `${name}.prerender-fallback.body`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  };
  const robots = body("robots.txt");
  const sitemap = body("sitemap.xml");
  if (robots === null) failures.push("robots.txt가 결과물에 없습니다");
  else failures.push(...checkRobots(robots));
  if (sitemap === null) failures.push("sitemap.xml이 결과물에 없습니다");
  else failures.push(...checkSitemap(sitemap));

  return { failures, scanned: files.length };
}

function main() {
  const project = path.resolve(process.argv[2] || WEB);
  let basis: Basis;
  try {
    basis = loadBasis();
  } catch (e) {
    if (e instanceof BasisMissingError) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  const { failures, scanned } = checkOutput(project, basis);
  if (failures.length) {
    console.error(`✗ 배포 결과물 검사 실패: ${failures.length}건 (파일 ${scanned}개 검사)`);
    for (const f of failures.slice(0, 60)) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ 배포 결과물 검사 통과 (파일 ${scanned}개, 공개 페이지·robots·sitemap·아이콘 규칙)`);
}

main();
