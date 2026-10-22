// Neon API(개인 API 키 NEON_API_KEY)로 브랜치를 다룬다. 개발 DB 초기화와 테스트 DB 준비에 쓴다.
// production·dev 브랜치는 지우지 않는다. 지우는 것은 테스트용으로 만든 브랜치뿐이다.
const API = "https://console.neon.tech/api/v2";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name}이 없습니다(web/.env.local)`);
  return v;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/projects/${env("NEON_PROJECT_ID")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env("NEON_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Neon API ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

interface Branch {
  id: string;
  name: string;
  parent_id?: string;
}

export async function listBranches(): Promise<Branch[]> {
  return (await call<{ branches: Branch[] }>("GET", "/branches")).branches;
}

/** 진행 중인 작업(브랜치 생성 등)이 끝날 때까지 기다린다. */
async function waitOperations(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { operations } = await call<{ operations: { status: string }[] }>("GET", "/operations?limit=20");
    if (!operations.some((o) => ["scheduling", "running"].includes(o.status))) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Neon 작업이 1분 안에 끝나지 않았습니다");
}

/** 이름으로 브랜치를 찾고, 없으면 parentId에서 새로 만든다(읽기·쓰기 엔드포인트 포함). */
export async function ensureBranch(name: string, parentId: string): Promise<Branch> {
  const found = (await listBranches()).find((b) => b.name === name);
  if (found) return found;
  const { branch } = await call<{ branch: Branch }>("POST", "/branches", { branch: { name, parent_id: parentId }, endpoints: [{ type: "read_write" }] });
  await waitOperations();
  return branch;
}

/** 브랜치의 접속 주소. pooled면 풀링 주소다. */
export async function connectionUri(branchId: string, pooled = false): Promise<string> {
  const q = new URLSearchParams({ branch_id: branchId, database_name: "neondb", role_name: "neondb_owner", pooled: String(pooled) });
  return (await call<{ uri: string }>("GET", `/connection_uri?${q}`)).uri;
}

/** 브랜치를 부모(sourceId)의 지금 상태로 되돌린다. 되돌리기 전 상태는 남기지 않는다. */
export async function restoreBranch(branchId: string, sourceId: string): Promise<void> {
  await call("POST", `/branches/${branchId}/restore`, { source_branch_id: sourceId });
  await waitOperations();
}

export async function deleteBranch(branchId: string): Promise<void> {
  if ([process.env.NEON_PROD_BRANCH_ID, process.env.NEON_DEV_BRANCH_ID].includes(branchId)) throw new Error("production·dev 브랜치는 지우지 않습니다");
  await call("DELETE", `/branches/${branchId}`);
  await waitOperations();
}
