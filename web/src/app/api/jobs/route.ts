import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DEFAULT_PARAMS,
  CFG_MAX,
  CFG_MIN,
  GGUF_TEXT_ENCODER_SUPPORTS_EDIT,
  isGgufTextEncoder,
  KNOWN_TEXT_ENCODERS,
  MAX_BATCH,
  MAX_BATCH_REFERENCES,
  MAX_REFERENCES,
  round32,
  STEPS_MAX,
  STEPS_MIN,
} from "@/lib/presets";
import type { CreateJobsRequest, GenerationParams, Job } from "@/lib/types";
import { removeJobFiles } from "@/lib/server/files";
import { publishEngineStatus, worker } from "@/lib/server/queue";
import { store } from "@/lib/server/store";
import { uploadExists } from "@/lib/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: store.list() });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function normalize(input: Partial<GenerationParams>, maxReferences = MAX_REFERENCES): GenerationParams {
  const p = { ...DEFAULT_PARAMS, ...input };
  const prompt = String(p.prompt ?? "").trim();
  if (!prompt) throw new Error("프롬프트를 입력하세요.");
  const engine = p.engine === "mflux" ? "mflux" : "comfyui";
  const seed =
    p.seed === null || p.seed === undefined || Number.isNaN(Number(p.seed))
      ? null
      : clamp(Math.floor(Number(p.seed)), 0, 2_147_483_647);
  const quantize = p.quantize === null ? null : clamp(Math.round(Number(p.quantize) || 8), 3, 8);
  const references = (Array.isArray(p.references) ? p.references : [])
    .filter((r): r is string => typeof r === "string" && uploadExists(r))
    .slice(0, maxReferences);
  let textEncoder = String(p.textEncoder || DEFAULT_PARAMS.textEncoder);
  if (engine === "comfyui" && references.length > 0 && isGgufTextEncoder(textEncoder) && !GGUF_TEXT_ENCODER_SUPPORTS_EDIT) {
    // GGUF 인코더로는 참조 이미지를 읽을 수 없을 때 safetensors 인코더로 처리한다.
    textEncoder = KNOWN_TEXT_ENCODERS[0];
  }
  return {
    prompt,
    negativePrompt: String(p.negativePrompt ?? "").trim(),
    width: round32(Number(p.width) || 1024),
    height: round32(Number(p.height) || 1024),
    steps: clamp(Math.round(Number(p.steps) || 40), STEPS_MIN, STEPS_MAX),
    cfg: clamp(Math.round((Number(p.cfg) || 1) * 10) / 10, CFG_MIN, CFG_MAX),
    seed,
    sampler: String(p.sampler || "euler"),
    scheduler: String(p.scheduler || "simple"),
    engine,
    gguf: String(p.gguf || DEFAULT_PARAMS.gguf),
    textEncoder,
    quantize,
    references,
    followReferenceSize: p.followReferenceSize !== false,
    imageStrength: clamp(Number(p.imageStrength ?? 0.6) || 0.6, 0.05, 1),
    presetId: p.presetId,
    ratioId: p.ratioId,
    styleId: p.styleId,
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

export async function POST(req: Request) {
  let body: CreateJobsRequest;
  try {
    body = (await req.json()) as CreateJobsRequest;
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다." }, { status: 400 });
  }
  const count = clamp(Math.round(Number(body.count) || 1), 1, MAX_BATCH);

  // 작업별 파라미터 목록. 배치 편집이면 참조 한 장마다 하나, 아니면 하나.
  let variants: GenerationParams[];
  try {
    if (body.perReference) {
      const batch = normalize(body.params ?? {}, MAX_BATCH_REFERENCES);
      if (batch.references.length === 0) throw new Error("배치 편집에는 참조 이미지가 필요합니다.");
      variants = batch.references.map((id) => ({ ...batch, references: [id] }));
    } else {
      variants = [normalize(body.params ?? {})];
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  const jobs: Job[] = [];
  const base = Date.now();
  let i = 0;
  for (const params of variants) {
    for (let k = 0; k < count; k++, i++) {
      const seed = params.seed === null ? randomSeed() : (params.seed + i) % 2_147_483_647;
      const job: Job = {
        id: randomUUID(),
        createdAt: base + i,
        status: "queued",
        params: { ...params, seed },
        progress: { step: 0, total: params.steps, phase: "queued" },
      };
      store.upsert(job);
      jobs.push(job);
    }
  }
  worker.kick();
  void publishEngineStatus();
  return NextResponse.json({ jobs }, { status: 201 });
}

/** 여러 작업을 한 번에 삭제한다. 실행 중인 작업은 먼저 취소한다. */
export async function DELETE(req: Request) {
  let ids: string[] = [];
  try {
    const body = (await req.json()) as { ids?: string[] };
    ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  } catch {
    return NextResponse.json({ error: "요청 본문이 JSON 이 아닙니다." }, { status: 400 });
  }
  const deleted: string[] = [];
  for (const id of ids) {
    const job = store.get(id);
    if (!job) continue;
    if (job.status === "running" || job.status === "queued") await worker.cancel(id);
    removeJobFiles(job);
    store.remove(id);
    deleted.push(id);
  }
  void publishEngineStatus();
  return NextResponse.json({ deleted });
}
