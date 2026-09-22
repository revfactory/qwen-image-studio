import { NextResponse } from "next/server";
import { comfy } from "@/lib/server/comfy";
import { publishEngineStatus } from "@/lib/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ComfyUI 서버가 꺼져 있으면 시작한다. 준비되기까지 1~2분 걸리므로 바로 응답하고 진행 상황은 SSE 로 알린다. */
export async function POST() {
  if (await comfy.isReachable()) return NextResponse.json({ starting: false, reachable: true });
  void comfy
    .ensureRunning()
    .catch((err) => console.error("[status] ComfyUI 시작 실패:", err))
    .finally(() => void publishEngineStatus());
  return NextResponse.json({ starting: true, reachable: false });
}
