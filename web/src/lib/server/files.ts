import fs from "node:fs";
import type { Job } from "@/lib/types";

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
