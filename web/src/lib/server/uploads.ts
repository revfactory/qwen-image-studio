import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { UploadInfo } from "@/lib/types";
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

export function removeUpload(id: string): boolean {
  if (!uploadExists(id)) return false;
  fs.unlinkSync(uploadPath(id));
  return true;
}
