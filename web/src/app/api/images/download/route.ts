import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { store } from "@/lib/server/store";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let ids: string[];
  try {
    const form = await req.formData();
    ids = [...new Set(form.getAll("id").filter((value): value is string => typeof value === "string"))];
  } catch {
    return NextResponse.json({ error: "다운로드 요청을 읽을 수 없습니다." }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: "다운로드할 이미지를 선택하세요." }, { status: 400 });

  const jobs = ids
    .map((id) => store.get(id))
    .filter((job): job is Job => Boolean(job && job.status === "done" && job.image?.file && fs.existsSync(job.image.file)));
  if (jobs.length !== ids.length) {
    return NextResponse.json({ error: "선택한 완료 이미지 중 일부를 찾을 수 없습니다. 새로고침 후 다시 선택하세요." }, { status: 404 });
  }
  if (jobs.length === 0) return NextResponse.json({ error: "선택한 완료 이미지를 찾을 수 없습니다." }, { status: 404 });

  let tempDir: string | undefined;
  try {
    const workingDir = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-gallery-"));
    tempDir = workingDir;
    const names: string[] = [];
    for (const job of jobs) {
      const image = job.image;
      if (!image) continue;
      const name = `qwen21-${job.params.seed}-${job.id.slice(0, 8)}.png`;
      fs.symlinkSync(path.resolve(image.file), path.join(workingDir, name));
      names.push(name);
    }

    const zip = spawn("zip", ["-q", "-0", "-j", "-", "-@"], { cwd: workingDir, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let finished = false;
    let cancelled = false;
    let cleaned = false;
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      fs.rmSync(workingDir, { recursive: true, force: true });
    };

    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        zip.stdout.on("data", (chunk: Buffer) => {
          if (cancelled) return;
          const target = controller;
          target?.enqueue(new Uint8Array(chunk));
          if (target?.desiredSize !== null && target?.desiredSize !== undefined && target.desiredSize <= 0) {
            zip.stdout.pause();
          }
        });
        zip.stderr.setEncoding("utf8");
        zip.stderr.on("data", (chunk: string) => {
          stderr = (stderr + chunk).slice(-2000);
        });
        zip.on("error", (error) => {
          if (finished || cancelled) return;
          finished = true;
          cleanup();
          controller?.error(error);
        });
        zip.on("close", (code) => {
          if (finished) return;
          finished = true;
          cleanup();
          if (cancelled) return;
          if (code === 0) controller?.close();
          else controller?.error(new Error(stderr || `ZIP 생성 실패 (${code})`));
        });
      },
      pull() {
        if (!cancelled) zip.stdout.resume();
      },
      cancel() {
        cancelled = true;
        if (!finished) zip.kill("SIGTERM");
        cleanup();
      },
    });

    zip.stdin.on("error", () => {
      // The child can close stdin after rejecting a malformed archive request.
    });
    zip.stdin.end(`${names.join("\n")}\n`);

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="qwen21-images.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    console.error("[gallery-download] ZIP 생성 실패:", error);
    return NextResponse.json({ error: "ZIP 파일을 만들지 못했습니다." }, { status: 500 });
  }
}
