#!/usr/bin/env zsh
# Qwen-Image-2.1 텍스트→이미지 생성 스크립트 (mflux / Apple MLX)
#
# 사용법:
#   ./generate.sh "프롬프트" [출력파일.png] [mflux 추가 옵션...]
#
# 예시:
#   ./generate.sh "비 내리는 밤 네온 간판, 'QWEN IMAGE 2.1' 문구" outputs/neon.png
#   ./generate.sh "고양이" outputs/cat.png --seed 42 --width 1280 --height 720
#
# 환경변수로 기본값 조정:
#   QWEN_Q=8   트랜스포머 양자화 비트 (3/4/5/6/8). 메모리 부족 시 6 또는 4 로 낮추기
#   STEPS=40   샘플링 스텝 (공식 권장 40)
#   WIDTH/HEIGHT=1024   해상도 (16의 배수)
set -euo pipefail

PROMPT="${1:?프롬프트를 첫 번째 인자로 넘겨주세요}"
shift
OUT="${1:-outputs/$(date +%Y%m%d-%H%M%S).png}"
[[ $# -gt 0 ]] && shift
mkdir -p "$(dirname "$OUT")"

exec mflux-generate-qwen-2.1 \
  --model qwen-image-2.1 \
  --quantize "${QWEN_Q:-8}" \
  --low-ram \
  --steps "${STEPS:-40}" \
  --width "${WIDTH:-1024}" \
  --height "${HEIGHT:-1024}" \
  --prompt "$PROMPT" \
  --output "$OUT" \
  "$@"
