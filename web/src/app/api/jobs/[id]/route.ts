import { NextResponse } from "next/server";
import { removeJobFiles } from "@/lib/server/files";
import { publishEngineStatus, worker } from "@/lib/server/queue";
import { store } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = store.get(id);
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const job = store.get(id);
  if (!job) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  if (job.status === "running" || job.status === "queued") await worker.cancel(id);
  removeJobFiles(job);
  store.remove(id);
  void publishEngineStatus();
  return NextResponse.json({ ok: true });
}
