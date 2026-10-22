// 스크립트에서도 개발 서버처럼 web/.env*를 읽는다. 다른 import보다 먼저 가져온다.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
