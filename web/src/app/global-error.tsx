"use client";

// 루트 레이아웃까지 실패했을 때의 오류 화면. 전역 스타일이 없으므로 모양을 직접 정한다.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f1f2f5", color: "#16181d", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>문제가 생겼습니다</h1>
          <p style={{ margin: 0, color: "#5b606b" }}>잠시 연결이 원활하지 않았습니다. 다시 시도해 주세요.</p>
          <button onClick={() => retry()} style={{ height: 52, borderRadius: 14, border: 0, background: "#16181d", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
