#!/usr/bin/env zsh
# Qwen Image 2.1 Studio 웹 앱 실행
#
# 사용법:
#   ./run-web.sh          # 프로덕션 모드. 빌드 결과가 없으면 먼저 빌드한다
#   ./run-web.sh dev      # 개발 모드 (코드 수정이 바로 반영)
#   ./run-web.sh build    # 빌드만 다시 한다
#
# 환경변수:
#   PORT=3210             웹 앱 포트
#   COMFY_URL=http://127.0.0.1:8188   ComfyUI 서버 주소
#   COMFY_AUTOSTART=1     ComfyUI 가 꺼져 있으면 자동으로 run-comfyui.sh 를 실행 (0 이면 끔)
set -euo pipefail
cd "$(dirname "$0")/web"
export PORT="${PORT:-3210}"
MODE="${1:-start}"

# npm 을 거치지 않고 next 를 직접 실행한다. npm 래퍼가 끼면 Ctrl+C 신호가 제대로 전달되지 않거나
# next-server 가 끝난 뒤에도 npm 프로세스가 남을 수 있다.
NEXT="./node_modules/.bin/next"
[[ -x "$NEXT" ]] || { echo "web/node_modules 가 없습니다. 먼저 ./setup-comfyui.sh 또는 (cd web && npm install) 을 실행하세요."; exit 1; }

case "$MODE" in
  dev)   exec "$NEXT" dev --port "$PORT" ;;
  build) exec "$NEXT" build ;;
  start)
    [[ -f .next/BUILD_ID ]] || "$NEXT" build
    exec "$NEXT" start --port "$PORT"
    ;;
  *) echo "알 수 없는 모드: $MODE (dev | build | start)"; exit 1 ;;
esac
