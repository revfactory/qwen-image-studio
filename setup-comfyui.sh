#!/usr/bin/env zsh
# Qwen Image Studio 실행 환경 구성 (Apple Silicon)
#
# 하는 일 (이미 된 단계는 건너뛴다):
#   1. ComfyUI 와 leejet/ComfyUI-GGUF 커스텀 노드 클론
#   2. Python 3.12 가상환경(uv) 생성과 의존성 설치 (PyTorch MPS 포함)
#   3. GGUF 인코더용 보완 모듈(custom_nodes/qwen-studio-gguf-qwen3vl) 링크
#   4. 모델 다운로드: Qwen-Image-2.1 GGUF, 텍스트 인코더(int8), VAE
#   5. 웹 앱(web/) 의존성 설치
#
# 사용법:
#   ./setup-comfyui.sh                 # 기본: Q8_0 GGUF + int8 인코더 + VAE (약 18GB)
#   ./setup-comfyui.sh --q4            # Q4_K_M GGUF 도 함께 (+4.6GB)
#   ./setup-comfyui.sh --skip-models   # 코드·환경만 구성하고 모델은 받지 않음
#   ./setup-comfyui.sh --skip-web      # 웹 앱 의존성 설치 생략
#
# 필요: macOS(Apple Silicon), git, uv (brew install uv), Node.js 20 이상(웹 앱), 디스크 여유 25GB 이상
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
COMFY="$ROOT/ComfyUI"
PY_VERSION="3.12"
WITH_Q4=0
SKIP_MODELS=0
SKIP_WEB=0
for arg in "$@"; do
  case "$arg" in
    --q4) WITH_Q4=1 ;;
    --skip-models) SKIP_MODELS=1 ;;
    --skip-web) SKIP_WEB=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print "알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

info() { print -P "%F{blue}▸%f $*"; }
ok()   { print -P "%F{green}✓%f $*"; }
fail() { print -P "%F{red}✗%f $*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || print -P "%F{yellow}!%f Apple Silicon Mac 이 아닙니다. MPS 가속을 전제로 한 스크립트입니다."
command -v git >/dev/null 2>&1 || fail "git 이 필요합니다."
command -v uv  >/dev/null 2>&1 || fail "uv 가 필요합니다: brew install uv"

# ---- 1. 소스 ----
if [[ -d "$COMFY/.git" ]]; then
  ok "ComfyUI 이미 있음"
else
  info "ComfyUI 클론"
  git clone https://github.com/comfyanonymous/ComfyUI "$COMFY"
fi
if [[ -d "$COMFY/custom_nodes/ComfyUI-GGUF/.git" ]]; then
  ok "ComfyUI-GGUF 이미 있음"
else
  info "ComfyUI-GGUF (leejet 포크, Qwen-Image-2.1 지원) 클론"
  git clone https://github.com/leejet/ComfyUI-GGUF "$COMFY/custom_nodes/ComfyUI-GGUF"
fi

# ---- 2. 파이썬 환경 ----
if [[ -x "$COMFY/.venv/bin/python" ]] && "$COMFY/.venv/bin/python" -c "import torch, gguf" >/dev/null 2>&1; then
  ok "가상환경과 의존성 이미 있음 ($("$COMFY/.venv/bin/python" -c 'import torch; print("torch", torch.__version__)'))"
else
  info "가상환경 생성 (Python $PY_VERSION) 과 의존성 설치"
  uv venv --python "$PY_VERSION" "$COMFY/.venv"
  uv pip install --python "$COMFY/.venv/bin/python" torch torchvision torchaudio \
    -r "$COMFY/requirements.txt" -r "$COMFY/custom_nodes/ComfyUI-GGUF/requirements.txt"
  "$COMFY/.venv/bin/python" -c "import torch; assert torch.backends.mps.is_available(), 'MPS 사용 불가'; print('torch', torch.__version__, 'MPS OK')"
fi

# ---- 3. 보완 모듈 링크 ----
LINK="$COMFY/custom_nodes/qwen-studio-gguf-qwen3vl"
if [[ -L "$LINK" || -d "$LINK" ]]; then
  ok "보완 모듈 링크 이미 있음"
else
  ln -s ../../custom_nodes/qwen-studio-gguf-qwen3vl "$LINK"
  ok "보완 모듈 링크 생성: custom_nodes/qwen-studio-gguf-qwen3vl"
fi

# ---- 4. 모델 ----
if (( SKIP_MODELS )); then
  info "모델 다운로드 생략 (--skip-models)"
else
  mkdir -p "$COMFY/models/diffusion_models" "$COMFY/models/text_encoders" "$COMFY/models/vae"
  download() { # $1=repo $2=repo 안 경로 $3=대상 폴더
    local repo="$1" path="$2" dest="$3" name="${2##*/}"
    if [[ -f "$dest/$name" ]]; then ok "$name 이미 있음"; return; fi
    info "내려받기: $repo/$path"
    uvx --from "huggingface_hub[hf_xet]" hf download "$repo" "$path" --local-dir "$dest"
    # --local-dir 은 repo 안의 하위 폴더 구조를 그대로 만들므로 파일을 대상 폴더로 올린다
    if [[ "$path" == */* && -f "$dest/$path" ]]; then mv "$dest/$path" "$dest/$name"; rmdir "$dest/${path%/*}" 2>/dev/null || true; fi
    rm -rf "$dest/.cache"
  }
  download abenzerps/Qwen-Image-2.1-GGUF qwen-image-2.1-Q8_0.gguf "$COMFY/models/diffusion_models"
  (( WITH_Q4 )) && download abenzerps/Qwen-Image-2.1-GGUF qwen-image-2.1-Q4_K_M.gguf "$COMFY/models/diffusion_models"
  download Comfy-Org/Qwen-Image-2.1 text_encoders/qwen3vl_8b_int8_convrot.safetensors "$COMFY/models/text_encoders"
  download Comfy-Org/Qwen-Image-2.1 vae/qwen_image_2.1_vae_bf16.safetensors "$COMFY/models/vae"
fi

# ---- 5. 웹 앱 ----
if (( SKIP_WEB )); then
  info "웹 앱 의존성 설치 생략 (--skip-web)"
elif command -v npm >/dev/null 2>&1; then
  if [[ -d "$ROOT/web/node_modules" ]]; then ok "웹 앱 의존성 이미 있음"; else
    info "웹 앱 의존성 설치"; ( cd "$ROOT/web" && npm install )
  fi
else
  print -P "%F{yellow}!%f npm 이 없어 웹 앱 의존성을 건너뜁니다. Node.js 20 이상을 설치한 뒤 web/ 에서 npm install 을 실행하세요."
fi

print
ok "구성 완료"
cat <<GUIDE

다음 단계
  ./run-web.sh                          웹 앱 실행 → http://127.0.0.1:3210  (ComfyUI 는 자동으로 켜집니다)
  ./run-comfyui.sh                      ComfyUI 만 실행 → http://127.0.0.1:8188
  ./comfy-generate.py "프롬프트"         터미널에서 생성 (ComfyUI 가 켜져 있어야 함)
  ./install-text-encoder-heretic.sh     선택: 거부 완화 GGUF 텍스트 인코더 설치
GUIDE
