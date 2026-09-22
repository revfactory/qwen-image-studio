import type { GenerationParams } from "@/lib/types";

export interface QualityPreset {
  id: string;
  name: string;
  description: string;
  steps: number;
  megapixels: number;
  /** ComfyUI 에서 우선 선택할 GGUF 양자화 (파일 이름에 포함된 문자열) */
  gguf?: string;
  /** ComfyUI 에서 우선 선택할 텍스트 인코더 (파일 이름에 포함된 문자열). 없으면 현재 선택을 유지 */
  textEncoder?: string;
  /** mflux 양자화 비트 */
  quantize?: number;
}

export const QUALITY_PRESETS: QualityPreset[] = [
  {
    id: "turbo",
    name: "초고속 초안",
    description: "12스텝 · 640px",
    steps: 12,
    megapixels: 0.39,
    gguf: "Q8_0",
    textEncoder: "heretic",
  },
  { id: "draft", name: "빠른 초안", description: "20스텝 · 0.5MP", steps: 20, megapixels: 0.5 },
  { id: "standard", name: "표준", description: "40스텝 · 1MP", steps: 40, megapixels: 1 },
  { id: "high", name: "고해상도", description: "40스텝 · 2.25MP", steps: 40, megapixels: 2.25 },
  {
    id: "lowmem",
    name: "저메모리",
    description: "Q4 · 30스텝 · 1MP",
    steps: 30,
    megapixels: 1,
    gguf: "Q4_K_M",
    quantize: 4,
  },
];

export interface AspectRatio {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: "1:1", label: "1:1", w: 1, h: 1 },
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "9:16", label: "9:16", w: 9, h: 16 },
  { id: "4:3", label: "4:3", w: 4, h: 3 },
  { id: "3:4", label: "3:4", w: 3, h: 4 },
  { id: "3:2", label: "3:2", w: 3, h: 2 },
  { id: "2:3", label: "2:3", w: 2, h: 3 },
  { id: "21:9", label: "21:9", w: 21, h: 9 },
];

export interface StylePreset {
  id: string;
  name: string;
  suffix: string;
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", name: "없음", suffix: "" },
  {
    id: "photo",
    name: "사진",
    suffix:
      "photorealistic photograph, natural lighting, realistic skin and material texture, shot on a full-frame camera",
  },
  {
    id: "cinematic",
    name: "영화 장면",
    suffix: "cinematic still, dramatic lighting, shallow depth of field, anamorphic lens, subtle film grain",
  },
  {
    id: "illustration",
    name: "일러스트",
    suffix: "digital illustration, clean line art, flat shading, vibrant color palette",
  },
  {
    id: "watercolor",
    name: "수채화",
    suffix: "watercolor painting on textured paper, soft edges, pigment blooms, light washes",
  },
  {
    id: "3d",
    name: "3D 렌더",
    suffix: "3D render, soft studio lighting, subsurface scattering, high detail materials",
  },
  {
    id: "poster",
    name: "포스터",
    suffix: "graphic poster design, bold typography, strong composition, print-ready layout",
  },
];

export const SIZE_MIN = 256;
export const SIZE_MAX = 2048;
export const STEPS_MIN = 1;
export const STEPS_MAX = 80;
export const CFG_MIN = 1;
export const CFG_MAX = 10;
export const MAX_BATCH = 8;
export const MAX_REFERENCES = 3;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const KNOWN_GGUF_FILES = ["qwen-image-2.1-Q8_0.gguf", "qwen-image-2.1-Q4_K_M.gguf"];
export const KNOWN_TEXT_ENCODERS = ["qwen3vl_8b_int8_convrot.safetensors", "qwen3vl_8b_bf16.safetensors"];
export const HERETIC_TEXT_ENCODER = "qwen3vl_8b_heretic-Q4_K_M.gguf";
/**
 * GGUF 텍스트 인코더로 참조 이미지 편집이 가능한지. ComfyUI/custom_nodes/qwen-studio-gguf-qwen3vl 보완 모듈이
 * mmproj(비전 타워)를 붙여 주므로 true. false 로 두면 편집 작업은 safetensors 인코더로 자동 대체한다.
 */
export const GGUF_TEXT_ENCODER_SUPPORTS_EDIT = true;

export function isGgufTextEncoder(file: string): boolean {
  return file.toLowerCase().endsWith(".gguf");
}

/** 텍스트 인코더 파일 이름을 사람이 읽을 라벨로 바꾼다. */
export function textEncoderLabel(file: string): string {
  const lower = file.toLowerCase();
  const quant = /-(q\d[^.]*)\.gguf$/i.exec(file)?.[1]?.toUpperCase();
  if (lower.includes("heretic")) return `Heretic ${quant ?? ""} (GGUF · 거부 완화)`.replace("  ", " ");
  if (lower.endsWith(".gguf")) return `${file.replace(/\.gguf$/i, "")} (GGUF)`;
  if (lower.includes("int8")) return "Qwen3-VL 8B · int8 (9.4GB)";
  if (lower.includes("bf16")) return "Qwen3-VL 8B · bf16 (17.5GB)";
  if (lower.includes("w4a8")) return "Qwen3-VL 8B · w4a8 (6.3GB)";
  return file;
}
export const FALLBACK_SAMPLERS = ["euler", "euler_ancestral", "res_multistep", "dpmpp_2m", "dpmpp_2m_sde", "uni_pc", "ddim"];
export const FALLBACK_SCHEDULERS = ["simple", "normal", "beta", "sgm_uniform", "karras", "exponential"];
export const MFLUX_QUANTIZE_OPTIONS: { value: number | null; label: string }[] = [
  { value: 8, label: "8비트 (권장)" },
  { value: 6, label: "6비트" },
  { value: 4, label: "4비트" },
  { value: null, label: "양자화 없음 (bf16, 메모리 많이 사용)" },
];

export function round32(n: number): number {
  const v = Math.round(n / 32) * 32;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, v));
}

export function resolutionFor(ratioId: string, megapixels: number): { width: number; height: number } {
  const ratio = ASPECT_RATIOS.find((r) => r.id === ratioId) ?? ASPECT_RATIOS[0];
  const pixels = megapixels * 1024 * 1024;
  const r = ratio.w / ratio.h;
  return { width: round32(Math.sqrt(pixels * r)), height: round32(Math.sqrt(pixels / r)) };
}

/** 사용 가능한 파일 목록에서 프리셋이 원하는 양자화가 들어간 파일을 고른다. */
export function pickGguf(files: string[], prefer?: string): string {
  const list = files.length ? files : KNOWN_GGUF_FILES;
  if (prefer) {
    const hit = list.find((f) => f.includes(prefer));
    if (hit) return hit;
  }
  return list.find((f) => f.includes("Q8_0")) ?? list[0];
}

export function pickTextEncoder(files: string[], prefer?: string): string {
  const list = files.length ? files : KNOWN_TEXT_ENCODERS;
  if (prefer) {
    const hit = list.find((f) => f.toLowerCase().includes(prefer.toLowerCase()));
    if (hit) return hit;
  }
  return list.find((f) => f.includes("int8")) ?? list[0];
}

export const DEFAULT_PARAMS: GenerationParams = {
  prompt: "",
  negativePrompt: "",
  width: 1024,
  height: 1024,
  steps: 40,
  cfg: 1,
  seed: null,
  sampler: "euler",
  scheduler: "simple",
  engine: "comfyui",
  gguf: KNOWN_GGUF_FILES[0],
  textEncoder: KNOWN_TEXT_ENCODERS[0],
  quantize: 8,
  references: [],
  followReferenceSize: true,
  imageStrength: 0.6,
  presetId: "standard",
  ratioId: "1:1",
  styleId: "none",
};

export const SAMPLE_PROMPTS: string[] = [
  'A neon shop sign that reads "QWEN IMAGE 2.1", rainy night, reflections on wet pavement',
  "한지 위에 그린 수묵화 느낌의 호랑이, 여백을 살린 구성, 붓 터치가 살아 있는 먹의 농담",
  "A cozy Seoul alley cafe at dusk, warm window light, a cat sleeping on a wooden bench, gentle rain",
  "Product photo of a matte black ceramic coffee mug on a concrete slab, soft top light, minimal composition",
  "Isometric illustration of a tiny floating island with a lighthouse, pastel palette, clean vector style",
  'A vintage travel poster for Jeju Island with the text "JEJU" in bold letters, tangerine trees and the sea',
];
