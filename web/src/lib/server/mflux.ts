import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Job, JobImage, JobProgress } from "@/lib/types";
import { CancelledError } from "./comfy";
import { envWithPath, MFLUX_BIN, ROOT, WEB_IMAGES_DIR } from "./paths";
import { readPngSize } from "./png";
import { uploadPath } from "./uploads";

type Updater = (update: Partial<JobProgress>) => void;

let availabilityCache: { at: number; result: { available: boolean; path?: string } } | null = null;

export async function mfluxAvailable(): Promise<{ available: boolean; path?: string }> {
  if (availabilityCache && Date.now() - availabilityCache.at < 60_000) return availabilityCache.result;
  const result = await new Promise<{ available: boolean; path?: string }>((resolve) => {
    execFile("which", [MFLUX_BIN], { env: envWithPath() }, (err, stdout) => {
      if (err || !stdout.trim()) resolve({ available: false });
      else resolve({ available: true, path: stdout.trim() });
    });
  });
  availabilityCache = { at: Date.now(), result };
  return result;
}

const PROGRESS_RE = /(\d+)\/(\d+)\s*\[/;

export async function runMflux(
  job: Job,
  update: Updater,
  onCancelReady: (cancel: () => Promise<void>) => void,
): Promise<JobImage> {
  const p = job.params;
  fs.mkdirSync(WEB_IMAGES_DIR, { recursive: true });
  const dest = path.join(WEB_IMAGES_DIR, `${job.id}.png`);

  const args = [
    "--model", "qwen-image-2.1",
    "--prompt", p.prompt,
    "--steps", String(p.steps),
    "--width", String(p.width),
    "--height", String(p.height),
    "--seed", String(p.seed),
    "--output", dest,
    "--low-ram",
  ];
  if (p.quantize) args.push("--quantize", String(p.quantize));
  // mflux 포트는 편집 변형을 지원하지 않으므로 첫 참조 이미지만 img2img 로 쓴다.
  const refs = p.references ?? [];
  if (refs.length > 0) {
    const ref = uploadPath(refs[0]);
    if (!fs.existsSync(ref)) throw new Error(`참조 이미지를 찾을 수 없습니다: ${refs[0]}`);
    args.push("--image", ref, String(p.imageStrength ?? 0.6));
  }
  if (p.negativePrompt.trim() && p.cfg > 1) {
    args.push("--negative-prompt", p.negativePrompt, "--guidance", String(p.cfg));
  }

  update({ phase: "loading", step: 0, total: p.steps });

  return new Promise<JobImage>((resolve, reject) => {
    const child = spawn(MFLUX_BIN, args, { cwd: ROOT, env: envWithPath() });
    let cancelled = false;
    const tail: string[] = [];
    let buffer = "";

    const handleChunk = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split(/\r|\n/);
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const text = line.trim();
        if (!text) continue;
        tail.push(text);
        if (tail.length > 30) tail.shift();
        const m = PROGRESS_RE.exec(text);
        if (m) {
          const step = Number(m[1]);
          const total = Number(m[2]);
          update({ phase: step >= total ? "decoding" : "sampling", step, total });
        }
      }
    };
    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    onCancelReady(async () => {
      cancelled = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5000);
    });

    child.on("error", (err) => {
      reject(new Error(`mflux 를 실행할 수 없습니다 (${MFLUX_BIN}): ${err.message}`));
    });
    child.on("close", (code) => {
      if (cancelled) return reject(new CancelledError());
      if (code !== 0) {
        return reject(new Error(`mflux 가 종료 코드 ${code} 로 끝났습니다.\n${tail.slice(-8).join("\n")}`));
      }
      if (!fs.existsSync(dest)) return reject(new Error("mflux 가 출력 파일을 만들지 않았습니다."));
      update({ phase: "saving" });
      const { width, height } = readPngSize(dest);
      resolve({ file: dest, width, height, bytes: fs.statSync(dest).size });
    });
  });
}
