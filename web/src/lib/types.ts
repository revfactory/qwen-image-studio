export type Engine = "comfyui" | "mflux";
export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type Phase =
  | "queued"
  | "starting"
  | "loading"
  | "encoding"
  | "sampling"
  | "decoding"
  | "saving"
  | "finished";

export interface GenerationParams {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  /** 고정 시드. null 이면 작업 생성 시 무작위로 정한다. */
  seed: number | null;
  sampler: string;
  scheduler: string;
  engine: Engine;
  /** ComfyUI: diffusion_models 폴더의 GGUF 파일 이름 */
  gguf: string;
  /** ComfyUI: text_encoders 폴더의 파일 이름 */
  textEncoder: string;
  /** mflux: 트랜스포머 양자화 비트 (null 이면 bf16) */
  quantize: number | null;
  /** 참조(편집 원본) 이미지의 업로드 ID 목록. 비어 있으면 텍스트→이미지 생성 */
  references: string[];
  /** 참조 이미지가 있을 때 출력 크기를 첫 참조 이미지에 맞출지 (ComfyUI) */
  followReferenceSize: boolean;
  /**
   * 참조 이미지를 다루는 방식. combined: 모든 참조를 한 작업에 넣어 합성/편집한다 (최대 MAX_REFERENCES).
   * each: 참조 한 장마다 같은 프롬프트를 적용한 작업을 따로 만든다 (배치 편집, 최대 MAX_BATCH_REFERENCES).
   * 서버는 이 값을 저장하지 않고 요청의 perReference 로만 받는다.
   */
  referenceMode?: "combined" | "each";
  /** mflux img2img 변경 강도 (0~1). 1 에 가까울수록 원본에서 멀어진다 */
  imageStrength: number;
  presetId?: string;
  ratioId?: string;
  styleId?: string;
}

export interface JobProgress {
  step: number;
  total: number;
  phase: Phase;
  etaMs?: number;
}

export interface JobImage {
  file: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Job {
  id: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: JobStatus;
  params: GenerationParams & { seed: number };
  progress: JobProgress;
  image?: JobImage;
  error?: string;
  promptId?: string;
}

export interface ComfyStatus {
  reachable: boolean;
  starting: boolean;
  version?: string;
  ggufFiles: string[];
  textEncoders: string[];
  samplers: string[];
  schedulers: string[];
  queueRemaining?: number;
  error?: string;
}

export interface EngineStatus {
  comfy: ComfyStatus;
  mflux: { available: boolean; path?: string };
  worker: { runningJobId?: string; queued: number };
}

export type ServerEvent =
  | { type: "snapshot"; jobs: Job[] }
  | { type: "job"; job: Job }
  | { type: "job-removed"; id: string }
  | { type: "preview"; id: string; dataUrl: string }
  | { type: "engine"; status: EngineStatus }
  | { type: "ping" };

export interface UploadInfo {
  id: string;
  width: number;
  height: number;
  bytes: number;
}

export interface CreateJobsRequest {
  params: GenerationParams;
  /** 작업 수. perReference 면 참조 이미지 한 장당 작업 수 */
  count?: number;
  /** true 면 params.references 의 각 이미지마다 별도 작업을 만든다 (배치 편집) */
  perReference?: boolean;
}

export interface UploadEntry extends UploadInfo {
  /** 업로드 시각 (파일 수정 시각, ms) */
  createdAt: number;
}
