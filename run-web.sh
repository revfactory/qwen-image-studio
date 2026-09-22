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

case "$MODE" in
  dev)   exec npm run dev -- --port "$PORT" ;;
  build) exec npm run build ;;
  start)
    [[ -d .next ]] || npm run build
    exec npm run start -- --port "$PORT"
    ;;
  *) echo "알 수 없는 모드: $MODE (dev | build | start)"; exit 1 ;;
esac
