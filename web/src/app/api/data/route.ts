import { NextResponse } from "next/server";
import { removeAllJobImages, removeJobFiles } from "@/lib/server/files";
import { publishEngineStatus, worker } from "@/lib/server/queue";
import { store } from "@/lib/server/store";
import { removeAllUploads } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모든 데이터를 지운다: 작업 기록(jobs.json), 생성 이미지(outputs/web), 참조 이미지(data/uploads).
 * 실행 중·대기 중 작업은 먼저 취소한다. reset-data.sh 가 서버가 켜져 있을 때 이 경로를 쓴다.
 * 되돌릴 수 없으므로 본문에 { "confirm": "ALL" } 을 요구한다.
 */
export async function DELETE(req: Request) {
  let confirm = "";
  try {
    const body = (await req.json()) as { confirm?: string };
    confirm = String(body.confirm ?? "");
  } catch {
    /* 본문이 없으면 아래에서 거절한다 */
  }
  if (confirm !== "ALL") {
    return NextResponse.json({ error: '모든 데이터를 지우려면 본문에 { "confirm": "ALL" } 을 넣으세요.' }, { status: 400 });
  }

  const jobs = store.list();
  let cancelled = 0;
  for (const job of jobs) {
    if (job.status === "running" || job.status === "queued") {
      await worker.cancel(job.id);
      cancelled++;
    }
  }
  for (const job of jobs) {
    removeJobFiles(job);
    store.remove(job.id);
  }
  // 기록에 없는 파일(중단된 작업의 중간 산출물 등)까지 폴더 단위로 지운다.
  const images = removeAllJobImages();
  const uploads = removeAllUploads();
  void publishEngineStatus();
  return NextResponse.json({ jobs: jobs.length, cancelled, images, uploads });
}
