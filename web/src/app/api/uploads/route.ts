import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/presets";
import { listUploads, saveUpload } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"]);

/** 업로드한 참조 이미지 목록 (보관함) */
export async function GET() {
  return NextResponse.json({ uploads: listUploads() });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 형식이 아닙니다." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file 필드가 없습니다." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `이미지는 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.` }, { status: 413 });
  }
  if (file.type && !ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `지원하지 않는 형식입니다: ${file.type}` }, { status: 415 });
  }
  try {
    const info = await saveUpload(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(info, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: `이미지를 처리하지 못했습니다: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 });
  }
}
