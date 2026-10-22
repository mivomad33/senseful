#!/bin/bash
# Dock에 둘 실행 아이콘 앱(~/Applications/Senseful.app)을 만든다. 사용: npm run make-launcher
# 앱을 누르면 서버가 꺼져 있을 때만 켜고(빌드가 없으면 먼저 빌드) 브라우저로 연다.
# 서버는 요청이 SENSEFUL_IDLE_MINUTES 동안 없으면 스스로 꺼진다(scripts/serve.ts).
# 저장소 위치, node 경로, SENSEFUL_PORT가 바뀌면 다시 실행한다.
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
PORT="$(grep -E '^SENSEFUL_PORT=' "$WEB_DIR/.env.local" 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-4747}"
APP="$HOME/Applications/Senseful.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 앱 안에서 실행할 스크립트. Dock에서 실행하면 터미널의 PATH가 없으므로 만들 때의 node 경로를 박아 둔다.
cat > "$TMP/launch.sh" <<EOF
#!/bin/bash
export PATH="$NODE_BIN:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$WEB_DIR"
URL="http://localhost:$PORT"
LOG="$WEB_DIR/data/server.log"
mkdir -p "$WEB_DIR/data"

if ! curl -s -o /dev/null "\$URL"; then
  if [ ! -f .next/BUILD_ID ]; then
    npm run build >> "\$LOG" 2>&1 || { echo "빌드 실패. web/data/server.log를 확인하세요."; exit 1; }
  fi
  nohup npm start >> "\$LOG" 2>&1 < /dev/null &
  for i in \$(seq 1 60); do
    curl -s -o /dev/null "\$URL" && break
    sleep 0.5
  done
  curl -s -o /dev/null "\$URL" || { echo "서버가 뜨지 않았습니다. web/data/server.log를 확인하세요."; exit 1; }
fi
open "\$URL"
EOF

cat > "$TMP/main.applescript" <<'EOF'
try
  do shell script quoted form of (POSIX path of (path to resource "launch.sh"))
on error msg
  display alert "Senseful" message msg
end try
EOF

rm -rf "$APP"
mkdir -p "$(dirname "$APP")"
osacompile -o "$APP" "$TMP/main.applescript"
cp "$TMP/launch.sh" "$APP/Contents/Resources/launch.sh"
chmod +x "$APP/Contents/Resources/launch.sh"
# 묶음 내용을 바꿨으므로 다시 서명한다. 이 맥에서만 쓰므로 ad-hoc 서명으로 충분하다.
codesign --force --sign - "$APP"

echo "만들었다: $APP"
echo "Finder에서 이 앱을 Dock으로 끌어다 둔다."
