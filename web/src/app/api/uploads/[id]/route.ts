import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { removeUpload, uploadExists, uploadPath } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!uploadExists(id)) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  const file = uploadPath(id);
  const stat = fs.statSync(file);
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!removeUpload(id)) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
