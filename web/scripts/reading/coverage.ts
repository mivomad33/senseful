// 읽기 글 명령(src/lib/reading/cli.ts). web 폴더에서 npm run reading:coverage 로 실행한다.
import { runCoverage } from "@/lib/reading/cli";

process.exitCode = runCoverage(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
