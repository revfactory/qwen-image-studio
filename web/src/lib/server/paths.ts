import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 프로젝트 루트 (generate.sh, run-comfyui.sh, outputs/ 가 있는 폴더). 기본은 web/ 의 상위. */
export const ROOT = process.env.QWEN_ROOT ? path.resolve(process.env.QWEN_ROOT) : path.resolve(process.cwd(), "..");
export const OUTPUTS_DIR = path.join(ROOT, "outputs");
export const WEB_IMAGES_DIR = path.join(OUTPUTS_DIR, "web");
export const DATA_DIR = path.join(process.cwd(), "data");
export const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export const COMFY_URL = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
export const COMFY_START_SCRIPT = path.join(ROOT, "run-comfyui.sh");
export const COMFY_LOG = path.join(ROOT, "comfyui.log");
export const COMFY_AUTOSTART = process.env.COMFY_AUTOSTART !== "0";

export const MFLUX_BIN = process.env.MFLUX_BIN ?? "mflux-generate-qwen-2.1";
export const EXTRA_PATH = [path.join(os.homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];

export function ensureDirs(): void {
  fs.mkdirSync(WEB_IMAGES_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function envWithPath(): NodeJS.ProcessEnv {
  const current = process.env.PATH ?? "";
  const parts = [...EXTRA_PATH, ...current.split(":")].filter((p, i, arr) => p && arr.indexOf(p) === i);
  return { ...process.env, PATH: parts.join(":") };
}
