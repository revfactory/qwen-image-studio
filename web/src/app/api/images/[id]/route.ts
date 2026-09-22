import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { store } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = store.get(id);
  const file = job?.image?.file;
  if (!job || !file || !fs.existsSync(file)) {
    return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }
  const stat = fs.statSync(file);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Content-Length": String(stat.size),
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (download) {
    const name = `qwen21-${job.params.seed}-${id.slice(0, 8)}.png`;
    headers["Content-Disposition"] = `attachment; filename="${name}"`;
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers });
}
