#!/usr/bin/env zsh
# ComfyUI 서버 실행 (Apple Silicon / MPS)
#
# 사용법:
#   ./run-comfyui.sh            # http://127.0.0.1:8188 에서 실행
#   ./run-comfyui.sh --lowvram  # 메모리 부족 시 추가 옵션 전달
#
# 종료: Ctrl+C
set -euo pipefail
cd "$(dirname "$0")/ComfyUI"

# MPS 에서 지원하지 않는 연산은 CPU 로 자동 폴백
export PYTORCH_ENABLE_MPS_FALLBACK=1

exec .venv/bin/python main.py \
  --listen 127.0.0.1 --port 8188 \
  --preview-method auto \
  --output-directory "$(dirname "$PWD")/outputs" \
  "$@"
