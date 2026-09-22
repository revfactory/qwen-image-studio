import fs from "node:fs";
import { NextResponse } from "next/server";
import { store } from "@/lib/server/store";
import { copyToUploads } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 갤러리의 생성 결과를 참조 이미지로 쓰기 위해 업로드 폴더로 복사한다. */
export async function POST(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const job = store.get(jobId);
  const file = job?.image?.file;
  if (!job || !file || !fs.existsSync(file)) {
    return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(copyToUploads(file), { status: 201 });
}
