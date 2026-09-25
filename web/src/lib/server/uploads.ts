import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { UploadEntry, UploadInfo } from "@/lib/types";
import { ensureDirs, UPLOADS_DIR } from "./paths";
import { readPngSize } from "./png";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUploadId(id: string): boolean {
  return ID_RE.test(id);
}

export function uploadPath(id: string): string {
  return path.join(UPLOADS_DIR, `${id}.png`);
}

export function uploadExists(id: string): boolean {
  return isUploadId(id) && fs.existsSync(uploadPath(id));
}

/** 어떤 형식의 이미지든 PNG 로 변환해 저장한다. 너무 큰 이미지는 긴 변 2048 로 줄인다. */
export async function saveUpload(buffer: Buffer): Promise<UploadInfo> {
  ensureDirs();
  const id = randomUUID();
  const file = uploadPath(id);
  await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toFile(file);
  const { width, height } = readPngSize(file);
  return { id, width, height, bytes: fs.statSync(file).size };
}

/** 이미 있는 PNG 파일(예: 생성 결과)을 업로드 폴더로 복사한다. */
export function copyToUploads(src: string): UploadInfo {
  ensureDirs();
  const id = randomUUID();
  const file = uploadPath(id);
  fs.copyFileSync(src, file);
  const { width, height } = readPngSize(file);
  return { id, width, height, bytes: fs.statSync(file).size };
}

export function uploadInfo(id: string): UploadInfo | null {
  if (!uploadExists(id)) return null;
  const file = uploadPath(id);
  const { width, height } = readPngSize(file);
  return { id, width, height, bytes: fs.statSync(file).size };
}

/** 업로드 폴더의 모든 이미지를 최신순으로 나열한다. */
export function listUploads(): UploadEntry[] {
  ensureDirs();
  const entries: UploadEntry[] = [];
  for (const name of fs.readdirSync(UPLOADS_DIR)) {
    if (!name.endsWith(".png")) continue;
    const id = name.slice(0, -4);
    if (!isUploadId(id)) continue;
    const file = path.join(UPLOADS_DIR, name);
    try {
      const stat = fs.statSync(file);
      const { width, height } = readPngSize(file);
      entries.push({ id, width, height, bytes: stat.size, createdAt: stat.mtimeMs });
    } catch {
      /* 쓰는 중이거나 손상된 파일은 건너뛴다 */
    }
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/** 업로드 폴더의 모든 이미지를 지운다. 지운 파일 수를 돌려준다. */
export function removeAllUploads(): number {
  let n = 0;
  for (const e of listUploads()) {
    try {
      fs.unlinkSync(uploadPath(e.id));
      n++;
    } catch (err) {
      console.error(`[uploads] 파일 삭제 실패 ${e.id}:`, err);
    }
  }
  return n;
}

export function removeUpload(id: string): boolean {
  if (!uploadExists(id)) return false;
  fs.unlinkSync(uploadPath(id));
  return true;
}
