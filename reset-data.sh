#!/usr/bin/env zsh
# Qwen Image 2.1 Studio 웹 앱의 데이터를 모두 지운다.
#   - 작업 기록      web/data/jobs.json
#   - 생성 이미지    outputs/web/*.png
#   - 참조 이미지    web/data/uploads/*.png
#
# 사용법:
#   ./reset-data.sh          # 지울 내용을 보여주고 확인을 받은 뒤 삭제
#   ./reset-data.sh --yes    # 확인 없이 삭제
#
# 웹 앱이 켜져 있으면 서버 API(DELETE /api/data)로 지워서 실행 중 작업 취소와 화면 갱신까지 처리한다.
# 꺼져 있으면 파일을 직접 지운다. 모델 파일과 ComfyUI 설치는 건드리지 않는다.
#
# 환경변수:
#   PORT=3210   웹 앱 포트
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-3210}"
YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg (--yes | --help)"; exit 1 ;;
  esac
done

JOBS_FILE="web/data/jobs.json"
UPLOADS_DIR="web/data/uploads"
IMAGES_DIR="outputs/web"

count_png() { [[ -d "$1" ]] && find "$1" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ' || echo 0; }
size_of()   { [[ -e "$1" ]] && du -sh "$1" | cut -f1 || echo "0B"; }

JOB_COUNT=0
if [[ -f "$JOBS_FILE" ]]; then
  JOB_COUNT=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1])).get("jobs", [])))' "$JOBS_FILE" 2>/dev/null || echo "?")
fi

echo "지울 데이터:"
echo "  작업 기록    $JOBS_FILE  (${JOB_COUNT}개)"
echo "  생성 이미지  $IMAGES_DIR/  ($(count_png "$IMAGES_DIR")장, $(size_of "$IMAGES_DIR"))"
echo "  참조 이미지  $UPLOADS_DIR/  ($(count_png "$UPLOADS_DIR")장, $(size_of "$UPLOADS_DIR"))"
echo

if [[ $YES -ne 1 ]]; then
  read -r "answer?되돌릴 수 없습니다. 모두 지우려면 ALL 을 입력하세요: "
  [[ "$answer" == "ALL" ]] || { echo "취소했습니다."; exit 1; }
fi

BASE="http://127.0.0.1:${PORT}"
if curl -sf -m 3 -o /dev/null "$BASE/api/status"; then
  echo "웹 앱이 켜져 있어 서버 API 로 지웁니다 ($BASE)..."
  HTTP=$(curl -s -m 180 -o /tmp/qwen-reset-response.json -w '%{http_code}' -X DELETE "$BASE/api/data" \
    -H 'Content-Type: application/json' -d '{"confirm":"ALL"}' || echo 000)
  BODY=$(cat /tmp/qwen-reset-response.json 2>/dev/null || true); rm -f /tmp/qwen-reset-response.json
  if [[ "$HTTP" != "200" ]]; then
    echo "서버 API 호출에 실패했습니다 (HTTP $HTTP). $BODY"
    if [[ "$HTTP" == "404" ]]; then
      echo "실행 중인 웹 앱이 이 기능이 없는 옛 빌드입니다. ./run-web.sh build 로 다시 빌드한 뒤 서버를 재시작하세요."
    fi
    echo "또는 웹 앱을 끄고 다시 실행하면 파일을 직접 지웁니다."
    exit 1
  fi
  echo "서버 응답: $BODY"
else
  echo "웹 앱이 꺼져 있어 파일을 직접 지웁니다..."
  rm -f "$JOBS_FILE"
  [[ -d "$UPLOADS_DIR" ]] && find "$UPLOADS_DIR" -maxdepth 1 -name '*.png' -delete
  [[ -d "$IMAGES_DIR" ]] && find "$IMAGES_DIR" -maxdepth 1 -name '*.png' -delete
fi

echo "완료. 남은 파일: 생성 이미지 $(count_png "$IMAGES_DIR")장, 참조 이미지 $(count_png "$UPLOADS_DIR")장"
