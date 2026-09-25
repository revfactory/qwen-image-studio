import fs from "node:fs";
import path from "node:path";
import type { Job } from "@/lib/types";
import { WEB_IMAGES_DIR } from "./paths";

/** 생성 이미지 폴더(outputs/web)의 PNG 를 기록 유무와 상관없이 모두 지운다. 지운 수를 돌려준다. */
export function removeAllJobImages(): number {
  if (!fs.existsSync(WEB_IMAGES_DIR)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(WEB_IMAGES_DIR)) {
    if (!name.toLowerCase().endsWith(".png")) continue;
    try {
      fs.unlinkSync(path.join(WEB_IMAGES_DIR, name));
      n++;
    } catch (err) {
      console.error(`[jobs] 파일 삭제 실패 ${name}:`, err);
    }
  }
  return n;
}

export function removeJobFiles(job: Job): void {
  const file = job.image?.file;
  if (file && fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (err) {
      console.error(`[jobs] 파일 삭제 실패 ${file}:`, err);
    }
  }
}
