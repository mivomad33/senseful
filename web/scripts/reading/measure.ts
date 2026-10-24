// 읽기 글 명령(src/lib/reading/cli.ts). web 폴더에서 npm run reading:measure 로 실행한다.
import { runMeasure } from "@/lib/reading/cli";

process.exitCode = runMeasure(process.argv.slice(2), { out: (s) => console.log(s), err: (s) => console.error(s) });
