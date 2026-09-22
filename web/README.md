# Qwen Image Studio 웹 앱

Next.js 16 + shadcn/ui 로 만든 Qwen-Image-2.1 생성 UI 입니다. 설치와 실행 방법, 구조 설명은 저장소 루트의 [README](../README.md) 에 있습니다.

```bash
npm install
npm run dev -- --port 3210   # 개발 모드
npm run build && npm run start -- --port 3210
```

환경변수: `PORT`, `COMFY_URL`(기본 http://127.0.0.1:8188), `COMFY_AUTOSTART`(0 이면 자동 시작 끔), `QWEN_ROOT`(기본 상위 폴더).
