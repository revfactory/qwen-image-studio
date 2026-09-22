import fs from "node:fs";

/** PNG 헤더(IHDR)에서 가로·세로를 읽는다. PNG 가 아니면 0 을 돌려준다. */
export function readPngSize(file: string): { width: number; height: number } {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    const isPng = buf.readUInt32BE(0) === 0x89504e47;
    if (!isPng) return { width: 0, height: 0 };
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}
