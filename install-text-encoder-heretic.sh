#!/usr/bin/env zsh
# Qwen-Image-2.1 용 Heretic(거부 완화) 텍스트 인코더 GGUF 설치 스크립트
#
# 출처: https://huggingface.co/pottokao/Qwen-Image-2.1-Text-Encoder-Heretic-GGUF
#   qwen3vl_8b_heretic-Q4_K_M.gguf       5.0GB  언어 모델(양자화). 텍스트→이미지에 필요
#   mmproj-qwen3vl_8b_heretic-f16.gguf   1.2GB  비전 타워(f16). 참조 이미지 편집에 필요
#
# 사용법:
#   ./install-text-encoder-heretic.sh              두 파일 모두 설치
#   ./install-text-encoder-heretic.sh --text-only  언어 모델만 설치
#   ./install-text-encoder-heretic.sh --force      이미 있어도 다시 내려받기
#   ./install-text-encoder-heretic.sh --check      설치 상태와 체크섬만 확인
#
# 설치 위치: ComfyUI/models/text_encoders/  (ComfyUI-GGUF 의 "CLIPLoader (GGUF)" 노드가 읽는 폴더)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="pottokao/Qwen-Image-2.1-Text-Encoder-Heretic-GGUF"
DEST="$ROOT/ComfyUI/models/text_encoders"
MAIN="qwen3vl_8b_heretic-Q4_K_M.gguf"
MMPROJ="mmproj-qwen3vl_8b_heretic-f16.gguf"

typeset -a FILES
FILES=("$MAIN" "$MMPROJ")
FORCE=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --text-only) FILES=("$MAIN") ;;
    --force) FORCE=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print "알 수 없는 옵션: $arg (--text-only | --force | --check)" >&2; exit 1 ;;
  esac
done

info() { print -P "%F{blue}▸%f $*"; }
ok()   { print -P "%F{green}✓%f $*"; }
warn() { print -P "%F{yellow}!%f $*"; }
fail() { print -P "%F{red}✗%f $*" >&2; exit 1; }

[[ -d "$ROOT/ComfyUI" ]] || fail "ComfyUI 폴더가 없습니다: $ROOT/ComfyUI  (README 의 '방법 2' 를 먼저 진행하세요)"
[[ -d "$ROOT/ComfyUI/custom_nodes/ComfyUI-GGUF" ]] || fail "ComfyUI-GGUF 커스텀 노드가 없습니다: $ROOT/ComfyUI/custom_nodes/ComfyUI-GGUF"
command -v uvx >/dev/null 2>&1 || fail "uv 가 필요합니다: brew install uv"
command -v python3 >/dev/null 2>&1 || fail "python3 가 필요합니다"
mkdir -p "$DEST"

# ---- 허깅페이스에서 파일 크기와 SHA256 조회 ----
info "허깅페이스에서 파일 정보를 가져옵니다: $REPO"
META="$(curl -sfL "https://huggingface.co/api/models/$REPO/tree/main?recursive=true")" || fail "허깅페이스 API 에 접근할 수 없습니다."

meta_field() { # $1=파일 이름  $2=size|oid
  print -r -- "$META" | python3 -c '
import sys, json
name, field = sys.argv[1], sys.argv[2]
for f in json.load(sys.stdin):
    if f.get("path") == name:
        lfs = f.get("lfs") or {}
        print(lfs.get("oid", "") if field == "oid" else (lfs.get("size") or f.get("size") or 0))
        break
' "$1" "$2"
}

verify() { # $1=파일 이름. 크기와 SHA256 이 맞으면 0
  local f="$DEST/$1"
  [[ -f "$f" ]] || { warn "$1 없음"; return 1; }
  local expect_size expect_sha actual_size actual_sha
  expect_size="$(meta_field "$1" size)"
  expect_sha="$(meta_field "$1" oid)"
  actual_size="$(stat -f%z "$f")"
  [[ "$actual_size" == "$expect_size" ]] || { warn "$1 크기 불일치 ($actual_size ≠ $expect_size)"; return 1; }
  if [[ -n "$expect_sha" ]]; then
    info "SHA256 확인 중: $1"
    actual_sha="$(shasum -a 256 "$f" | cut -d' ' -f1)"
    [[ "$actual_sha" == "$expect_sha" ]] || { warn "$1 SHA256 불일치"; return 1; }
  fi
  return 0
}

if (( CHECK_ONLY )); then
  check_failed=0
  for f in "${FILES[@]}"; do
    if verify "$f"; then ok "$f 정상"; else check_failed=1; fi
  done
  exit $check_failed
fi

# ---- 내려받을 파일 결정 ----
typeset -a TODO
TODO=()
need=0
for f in "${FILES[@]}"; do
  if (( ! FORCE )) && [[ -f "$DEST/$f" ]] && [[ "$(stat -f%z "$DEST/$f")" == "$(meta_field "$f" size)" ]]; then
    ok "$f 이미 있음 (건너뜀)"
  else
    TODO+=("$f")
    need=$(( need + $(meta_field "$f" size) ))
  fi
done

if (( ${#TODO} > 0 )); then
  avail=$(( $(df -k "$DEST" | awk 'NR==2{print $4}') * 1024 ))
  (( avail > need + 1024 * 1024 * 1024 )) || fail "디스크 여유가 부족합니다: 필요 $(( need / 1024 / 1024 / 1024 ))GB, 여유 $(( avail / 1024 / 1024 / 1024 ))GB"
  info "내려받기 ($(( need / 1024 / 1024 / 1024 + 1 ))GB): ${TODO[*]}"
  info "저장 위치: $DEST"
  typeset -a EXTRA
  EXTRA=()
  (( FORCE )) && EXTRA=(--force-download)
  uvx --from "huggingface_hub[hf_xet]" hf download "$REPO" "${TODO[@]}" --local-dir "$DEST" "${EXTRA[@]}"
  rm -rf "$DEST/.cache"
fi

for f in "${FILES[@]}"; do
  verify "$f" && ok "$f 검증 완료" || fail "$f 검증에 실패했습니다. --force 로 다시 내려받으세요."
done

print
ok "설치 완료: $DEST"
cat <<GUIDE

사용 방법
  웹 앱     고급 설정 → 텍스트 인코더에서 "Heretic Q4_K_M (GGUF)" 를 고르면 됩니다.
            ComfyUI 가 이미 켜져 있으면 목록은 15초 안에 갱신되고, 안 보이면 페이지를 새로 고치세요.
  터미널    ./comfy-generate.py "프롬프트" --text-encoder heretic
  ComfyUI   CLIPLoader 노드 대신 "CLIPLoader (GGUF)" 노드를 놓고 $MAIN 을 고른 뒤 type 을 qwen_image 로 둡니다.

참고
  · 편집(참조 이미지) 작업에는 비전 타워 $MMPROJ 가 함께 필요합니다.
  · 이 인코더는 원본 Qwen3-VL-8B 에서 거부 반응을 줄인 파생 모델이며 Apache-2.0 으로 배포됩니다.
GUIDE
