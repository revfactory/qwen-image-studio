"use client";

import { cn } from "cn";
import {
  ArrowLeftRightIcon,
  ChevronDownIcon,
  DicesIcon,
  EraserIcon,
  ImagePlusIcon,
  LightbulbIcon,
  Loader2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, uploadUrl } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ASPECT_RATIOS,
  CFG_MAX,
  CFG_MIN,
  DEFAULT_PARAMS,
  FALLBACK_SAMPLERS,
  FALLBACK_SCHEDULERS,
  KNOWN_GGUF_FILES,
  KNOWN_TEXT_ENCODERS,
  MAX_BATCH,
  MAX_REFERENCES,
  MFLUX_QUANTIZE_OPTIONS,
  pickGguf,
  pickTextEncoder,
  QUALITY_PRESETS,
  resolutionFor,
  round32,
  SAMPLE_PROMPTS,
  SIZE_MAX,
  SIZE_MIN,
  STEPS_MAX,
  GGUF_TEXT_ENCODER_SUPPORTS_EDIT,
  isGgufTextEncoder,
  STEPS_MIN,
  STYLE_PRESETS,
  textEncoderLabel,
} from "@/lib/presets";
import type { Engine, EngineStatus, GenerationParams } from "@/lib/types";

const STORAGE_KEY = "qwen21.form.v1";

export interface LoadRequest {
  params: GenerationParams;
  nonce: number;
}

export interface ReferenceRequest {
  /** 업로드 ID */
  id: string;
  nonce: number;
}

interface Props {
  engine: EngineStatus | null;
  loadRequest: LoadRequest | null;
  referenceRequest: ReferenceRequest | null;
  onSubmit: (params: GenerationParams, count: number) => Promise<unknown>;
}

const ENGINE_ITEMS: { value: Engine; label: string }[] = [
  { value: "comfyui", label: "ComfyUI · GGUF (PyTorch MPS)" },
  { value: "mflux", label: "mflux · MLX (bf16 원본)" },
];

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function ggufLabel(file: string): string {
  const m = /-(Q\d[^.]*)\.gguf$/i.exec(file);
  return m ? m[1] : file;
}


const noopSubscribe = () => () => {};

function readSavedRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface Saved {
  form?: Partial<GenerationParams>;
  count?: number;
}

function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Saved;
  } catch {
    return null;
  }
}

export function GeneratorForm({ engine, loadRequest, referenceRequest, onSubmit }: Props) {
  // 서버 렌더링에서는 기본값, 브라우저에서는 마지막에 저장한 설정으로 시작한다.
  const savedRaw = useSyncExternalStore(noopSubscribe, readSavedRaw, () => null);
  const saved = useMemo(() => parseSaved(savedRaw), [savedRaw]);
  const [formOverride, setFormOverride] = useState<GenerationParams | null>(null);
  const [countOverride, setCountOverride] = useState<number | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);
  const [appliedRefNonce, setAppliedRefNonce] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useMemo<GenerationParams>(
    () => formOverride ?? { ...DEFAULT_PARAMS, ...(saved?.form ?? {}) },
    [formOverride, saved],
  );
  const count = countOverride ?? saved?.count ?? 1;
  const setCount = setCountOverride;

  const ggufFiles = engine?.comfy.ggufFiles.length ? engine.comfy.ggufFiles : KNOWN_GGUF_FILES;
  const textEncoders = engine?.comfy.textEncoders.length ? engine.comfy.textEncoders : KNOWN_TEXT_ENCODERS;
  const samplers = engine?.comfy.samplers.length ? engine.comfy.samplers : FALLBACK_SAMPLERS;
  const schedulers = engine?.comfy.schedulers.length ? engine.comfy.schedulers : FALLBACK_SCHEDULERS;

  // 갤러리에서 "설정 불러오기": 렌더 중에 파생 상태를 맞춘다.
  if (loadRequest && loadRequest.nonce !== appliedNonce) {
    setAppliedNonce(loadRequest.nonce);
    setFormOverride({ ...DEFAULT_PARAMS, ...loadRequest.params });
    setAdvancedOpen(true);
  }

  // 갤러리에서 "참조 이미지로 사용"
  if (referenceRequest && referenceRequest.nonce !== appliedRefNonce) {
    setAppliedRefNonce(referenceRequest.nonce);
    setFormOverride({
      ...form,
      references: [...form.references.filter((r) => r !== referenceRequest.id), referenceRequest.id].slice(
        -MAX_REFERENCES,
      ),
    });
  }

  // 마지막 설정 저장 (사용자가 무언가 바꾼 뒤에만)
  useEffect(() => {
    if (formOverride === null && countOverride === null) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, count }));
      } catch {
        /* 저장 공간이 없으면 건너뛴다 */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form, count, formOverride, countOverride]);

  const set = (patch: Partial<GenerationParams>) => setFormOverride({ ...form, ...patch });
  const patchFn = (fn: (f: GenerationParams) => Partial<GenerationParams>) =>
    setFormOverride((prev) => {
      const base = prev ?? { ...DEFAULT_PARAMS, ...(saved?.form ?? {}) };
      return { ...base, ...fn(base) };
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_REFERENCES - form.references.length;
    if (room <= 0) {
      toast.error(`참조 이미지는 최대 ${MAX_REFERENCES}장까지 넣을 수 있습니다`);
      return;
    }
    const list = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        try {
          const info = await api.upload(file);
          patchFn((f) => ({ references: [...f.references, info.id].slice(0, MAX_REFERENCES) }));
        } catch (err) {
          toast.error(`${file.name}: ${err instanceof Error ? err.message : "업로드 실패"}`);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeReference = (id: string) => patchFn((f) => ({ references: f.references.filter((r) => r !== id) }));
  const editing = form.references.length > 0;

  const applyQuality = (id: string) => {
    const preset = QUALITY_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    const ratioId = form.ratioId && form.ratioId !== "custom" ? form.ratioId : "1:1";
    const { width, height } = resolutionFor(ratioId, preset.megapixels);
    set({
      presetId: id,
      ratioId,
      steps: preset.steps,
      width,
      height,
      gguf: pickGguf(ggufFiles, preset.gguf),
      // 프리셋이 원하는 인코더가 설치돼 있으면 그것을, 아니면 지금 선택을 유지한다.
      textEncoder: preset.textEncoder
        ? pickTextEncoder(textEncoders, preset.textEncoder)
        : textEncoders.includes(form.textEncoder)
          ? form.textEncoder
          : pickTextEncoder(textEncoders),
      quantize: preset.quantize ?? 8,
    });
  };

  const applyRatio = (id: string) => {
    const preset = QUALITY_PRESETS.find((p) => p.id === form.presetId);
    const megapixels = preset ? preset.megapixels : (form.width * form.height) / (1024 * 1024);
    const { width, height } = resolutionFor(id, megapixels);
    set({ ratioId: id, width, height });
  };

  const setSize = (patch: { width?: number; height?: number }) => {
    set({ ...patch, ratioId: "custom", presetId: "custom" });
  };

  const finalPrompt = useMemo(() => {
    const style = STYLE_PRESETS.find((s) => s.id === form.styleId);
    const base = form.prompt.trim();
    return style?.suffix && base ? `${base}, ${style.suffix}` : base;
  }, [form.prompt, form.styleId]);

  const canSubmit = form.prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(
        {
          ...form,
          prompt: finalPrompt,
          gguf: form.gguf || pickGguf(ggufFiles),
          textEncoder: form.textEncoder || pickTextEncoder(textEncoders),
        },
        count,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modelSummary =
    form.engine === "comfyui" ? `GGUF ${ggufLabel(form.gguf)}` : form.quantize ? `mflux ${form.quantize}bit` : "mflux bf16";

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" />
          이미지 생성
        </CardTitle>
        <CardDescription>프롬프트를 쓰고 프리셋을 고르면 바로 생성할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* 프롬프트 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="prompt">프롬프트</Label>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => set({ prompt: SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)] })}
                    />
                  }
                >
                  <LightbulbIcon data-icon="inline-start" />
                  예시
                </TooltipTrigger>
                <TooltipContent>예시 프롬프트를 무작위로 채웁니다</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="xs" disabled={!form.prompt} onClick={() => set({ prompt: "" })}>
                <EraserIcon data-icon="inline-start" />
                지우기
              </Button>
            </div>
          </div>
          <Textarea
            id="prompt"
            value={form.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void handleSubmit();
            }}
            placeholder='예: A neon shop sign that reads "QWEN IMAGE 2.1", rainy night, reflections on wet pavement'
            className="min-h-28 resize-y text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {editing
                ? "참조 이미지를 어떻게 바꿀지 지시문으로 쓰세요. 여러 장이면 \"첫 번째\", \"두 번째\"로 가리킵니다."
                : "영어·한국어 모두 가능합니다. 글자를 넣고 싶으면 따옴표로 감싸세요."}
            </span>
            <span className="tabular-nums">{form.prompt.length}자</span>
          </div>
        </div>

        {/* 참조 이미지 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>
              참조 이미지 <span className="font-normal text-muted-foreground">(선택 · 이미지 편집)</span>
            </Label>
            <Button
              variant="ghost"
              size="xs"
              disabled={uploading || form.references.length >= MAX_REFERENCES}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <ImagePlusIcon data-icon="inline-start" />
              )}
              이미지 추가
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-lg border border-dashed p-2 transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            {form.references.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                이미지를 끌어다 놓거나 [이미지 추가]를 누르세요. 최대 {MAX_REFERENCES}장. 넣으면 프롬프트를 편집 지시로
                해석합니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {form.references.map((id, i) => (
                  <div key={id} className="group relative size-20 overflow-hidden rounded-md border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadUrl(id)} alt={`참조 이미지 ${i + 1}`} className="size-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] tabular-nums text-white">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      aria-label="참조 이미지 제거"
                      onClick={() => removeReference(id)}
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {editing ? (
            form.engine === "comfyui" ? (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">출력 크기를 첫 참조 이미지에 맞추기</span>
                  <Switch
                    size="sm"
                    checked={form.followReferenceSize}
                    onCheckedChange={(checked) => set({ followReferenceSize: checked })}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  예: &quot;배경을 노을 지는 해변으로 바꿔줘&quot;, &quot;두 번째 이미지의 옷을 첫 번째 인물에게 입혀줘&quot;.
                  참조가 많을수록 메모리를 더 씁니다.
                </p>
                {isGgufTextEncoder(form.textEncoder) && !GGUF_TEXT_ENCODER_SUPPORTS_EDIT ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    GGUF 텍스트 인코더는 참조 이미지 편집에 쓸 수 없어 이 작업은 int8 인코더로 자동 대체됩니다.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">변경 강도 (mflux 는 첫 이미지만 img2img 로 사용)</span>
                  <span className="tabular-nums">{form.imageStrength.toFixed(2)}</span>
                </div>
                <Slider
                  value={[form.imageStrength]}
                  min={0.05}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => set({ imageStrength: Array.isArray(v) ? v[0] : v })}
                />
              </div>
            )
          ) : null}
        </div>

        {/* 스타일 */}
        <div className="flex flex-col gap-2">
          <Label>스타일</Label>
          <ToggleGroup
            value={[form.styleId ?? "none"]}
            onValueChange={(v) => v[0] && set({ styleId: String(v[0]) })}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {STYLE_PRESETS.map((s) => (
              <ToggleGroupItem key={s.id} value={s.id} aria-label={s.name}>
                {s.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* 품질 프리셋 */}
        <div className="flex flex-col gap-2">
          <Label>품질 프리셋</Label>
          <ToggleGroup
            value={[form.presetId ?? "custom"]}
            onValueChange={(v) => v[0] && applyQuality(String(v[0]))}
            variant="outline"
            className="grid w-full grid-cols-2 sm:grid-cols-3"
          >
            {QUALITY_PRESETS.map((p) => (
              <ToggleGroupItem
                key={p.id}
                value={p.id}
                className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{p.description}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* 비율 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>화면 비율</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {form.width} × {form.height}
            </span>
          </div>
          <ToggleGroup
            value={[form.ratioId ?? "custom"]}
            onValueChange={(v) => v[0] && applyRatio(String(v[0]))}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {ASPECT_RATIOS.map((r) => {
              const w = r.w >= r.h ? 16 : Math.round((16 * r.w) / r.h);
              const h = r.h >= r.w ? 16 : Math.round((16 * r.h) / r.w);
              return (
                <ToggleGroupItem key={r.id} value={r.id} aria-label={`비율 ${r.label}`} className="gap-1.5">
                  <span
                    className="inline-block rounded-[2px] border border-current opacity-70"
                    style={{ width: w, height: h }}
                  />
                  {r.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        {/* 고급 설정 */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="-mx-2 w-[calc(100%+1rem)] justify-between" />}
          >
            <span className="flex items-center gap-2">
              고급 설정
              <Badge variant="secondary" className="font-normal">
                {modelSummary} · {form.steps}스텝 · CFG {form.cfg} · {form.seed === null ? "무작위 시드" : `시드 ${form.seed}`}
              </Badge>
            </span>
            <ChevronDownIcon className={"transition-transform " + (advancedOpen ? "rotate-180" : "")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-5 pt-3">
            {/* 엔진 */}
            <div className="grid gap-2">
              <Label htmlFor="engine">실행 엔진</Label>
              <Select
                value={form.engine}
                onValueChange={(v) => v && set({ engine: v as Engine })}
                items={ENGINE_ITEMS}
              >
                <SelectTrigger id="engine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGINE_ITEMS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.engine === "comfyui"
                  ? "GGUF 양자화 모델을 ComfyUI 로 실행합니다. 모델이 메모리에 남아 있어 연속 생성이 빠릅니다."
                  : engine?.mflux.available
                    ? "bf16 원본 가중치를 MLX 로 실행합니다. 실행마다 모델을 다시 불러오므로 첫 스텝까지 1~2분 걸립니다."
                    : "mflux 명령을 찾을 수 없습니다. `uv tool install mflux` 로 설치하세요."}
              </p>
            </div>

            {form.engine === "comfyui" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="gguf">디퓨전 모델 (GGUF)</Label>
                  <Select
                    value={ggufFiles.includes(form.gguf) ? form.gguf : ggufFiles[0]}
                    onValueChange={(v) => v && set({ gguf: String(v), presetId: "custom" })}
                    items={ggufFiles.map((f) => ({ value: f, label: ggufLabel(f) }))}
                  >
                    <SelectTrigger id="gguf" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ggufFiles.map((f) => (
                        <SelectItem key={f} value={f}>
                          {ggufLabel(f)}
                          <span className="ml-2 text-xs text-muted-foreground">{f}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="te">텍스트 인코더</Label>
                  <Select
                    value={textEncoders.includes(form.textEncoder) ? form.textEncoder : textEncoders[0]}
                    onValueChange={(v) => v && set({ textEncoder: String(v) })}
                    items={textEncoders.map((f) => ({ value: f, label: textEncoderLabel(f) }))}
                  >
                    <SelectTrigger id="te" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {textEncoders.map((f) => (
                        <SelectItem key={f} value={f}>
                          {textEncoderLabel(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="quantize">트랜스포머 양자화</Label>
                <Select
                  value={form.quantize === null ? "none" : String(form.quantize)}
                  onValueChange={(v) => v && set({ quantize: v === "none" ? null : Number(v), presetId: "custom" })}
                  items={MFLUX_QUANTIZE_OPTIONS.map((o) => ({
                    value: o.value === null ? "none" : String(o.value),
                    label: o.label,
                  }))}
                >
                  <SelectTrigger id="quantize" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MFLUX_QUANTIZE_OPTIONS.map((o) => (
                      <SelectItem key={String(o.value)} value={o.value === null ? "none" : String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  텍스트 인코더(17.5GB)는 항상 bf16 으로 실행됩니다. 36GB 장비에서는 8비트를 권장합니다.
                </p>
              </div>
            )}

            <Separator />

            {/* 스텝 */}
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="steps">샘플링 스텝</Label>
                <Input
                  id="steps"
                  type="number"
                  min={STEPS_MIN}
                  max={STEPS_MAX}
                  value={form.steps}
                  onChange={(e) =>
                    set({
                      steps: Math.min(STEPS_MAX, Math.max(STEPS_MIN, Number(e.target.value) || STEPS_MIN)),
                      presetId: "custom",
                    })
                  }
                  className="h-7 w-20 text-right tabular-nums"
                />
              </div>
              <Slider
                value={[form.steps]}
                min={STEPS_MIN}
                max={STEPS_MAX}
                step={1}
                onValueChange={(v) => set({ steps: Array.isArray(v) ? v[0] : v, presetId: "custom" })}
              />
              <p className="text-xs text-muted-foreground">공식 권장값은 40입니다. 20 정도면 속도가 두 배 빨라지지만 세부 묘사가 줄어듭니다.</p>
            </div>

            {/* CFG + 부정 프롬프트 */}
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="cfg">CFG (가이던스)</Label>
                <Input
                  id="cfg"
                  type="number"
                  min={CFG_MIN}
                  max={CFG_MAX}
                  step={0.1}
                  value={form.cfg}
                  onChange={(e) =>
                    set({ cfg: Math.min(CFG_MAX, Math.max(CFG_MIN, Number(e.target.value) || CFG_MIN)) })
                  }
                  className="h-7 w-20 text-right tabular-nums"
                />
              </div>
              <Slider
                value={[form.cfg]}
                min={CFG_MIN}
                max={CFG_MAX}
                step={0.1}
                onValueChange={(v) => set({ cfg: Math.round((Array.isArray(v) ? v[0] : v) * 10) / 10 })}
              />
              <div className="grid gap-2">
                <Label htmlFor="negative" className="text-muted-foreground">
                  부정 프롬프트
                </Label>
                <Textarea
                  id="negative"
                  value={form.negativePrompt}
                  onChange={(e) => set({ negativePrompt: e.target.value })}
                  placeholder="blurry, low quality, watermark"
                  className="min-h-16 resize-y text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {form.cfg <= 1
                    ? "Qwen-Image-2.1 은 가이던스 없이(CFG 1) 쓰도록 학습되었습니다. 부정 프롬프트를 쓰려면 CFG 를 2~4 로 올리세요."
                    : "CFG 가 1보다 크면 한 스텝에 두 번 계산하므로 생성 시간이 약 두 배가 됩니다."}
                </p>
              </div>
            </div>

            <Separator />

            {/* 시드 */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="seed">시드</Label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">매번 무작위</span>
                  <Switch
                    checked={form.seed === null}
                    onCheckedChange={(checked) => set({ seed: checked ? null : randomSeed() })}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Input
                  id="seed"
                  type="number"
                  min={0}
                  max={2_147_483_647}
                  disabled={form.seed === null}
                  value={form.seed ?? ""}
                  placeholder="무작위"
                  onChange={(e) => set({ seed: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                  className="tabular-nums"
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="새 시드"
                        onClick={() => set({ seed: randomSeed() })}
                      />
                    }
                  >
                    <DicesIcon />
                  </TooltipTrigger>
                  <TooltipContent>새 시드를 뽑아 고정합니다</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">
                여러 장을 연속 생성하면 고정 시드에서 1씩 증가한 값을 씁니다.
              </p>
            </div>

            {/* 크기 */}
            <div className="grid gap-2">
              <Label>크기 (픽셀)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  aria-label="가로"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step={32}
                  value={form.width}
                  onChange={(e) => setSize({ width: Number(e.target.value) || SIZE_MIN })}
                  onBlur={() => setSize({ width: round32(form.width) })}
                  className="tabular-nums"
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  type="number"
                  aria-label="세로"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step={32}
                  value={form.height}
                  onChange={(e) => setSize({ height: Number(e.target.value) || SIZE_MIN })}
                  onBlur={() => setSize({ height: round32(form.height) })}
                  className="tabular-nums"
                />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="가로세로 바꾸기"
                        onClick={() => setSize({ width: form.height, height: form.width })}
                      />
                    }
                  >
                    <ArrowLeftRightIcon />
                  </TooltipTrigger>
                  <TooltipContent>가로와 세로를 바꿉니다</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">
                32의 배수로 맞춰집니다 ({SIZE_MIN}~{SIZE_MAX}). 2048 급은 메모리를 많이 써서 느려질 수 있습니다.
              </p>
            </div>

            {/* 샘플러 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sampler">샘플러</Label>
                <Select
                  value={samplers.includes(form.sampler) ? form.sampler : samplers[0]}
                  onValueChange={(v) => v && set({ sampler: String(v) })}
                  disabled={form.engine === "mflux"}
                  items={samplers.map((s) => ({ value: s, label: s }))}
                >
                  <SelectTrigger id="sampler" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {samplers.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scheduler">스케줄러</Label>
                <Select
                  value={schedulers.includes(form.scheduler) ? form.scheduler : schedulers[0]}
                  onValueChange={(v) => v && set({ scheduler: String(v) })}
                  disabled={form.engine === "mflux"}
                  items={schedulers.map((s) => ({ value: s, label: s }))}
                >
                  <SelectTrigger id="scheduler" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {schedulers.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.engine === "mflux" ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">mflux 는 euler 샘플러와 선형 스케줄러만 지원합니다.</p>
              ) : null}
            </div>

            {/* 생성 수 */}
            <div className="grid gap-2">
              <Label>연속 생성 수</Label>
              <ToggleGroup
                value={[String(count)]}
                onValueChange={(v) => v[0] && setCount(Number(v[0]))}
                variant="outline"
                size="sm"
              >
                {[1, 2, 4, MAX_BATCH].map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="min-w-12">
                    {n}장
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
            {count > 1 ? `${count}장 생성 시작` : "이미지 생성 시작"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {editing && form.followReferenceSize && form.engine === "comfyui"
              ? "참조 이미지 크기"
              : `${form.width} × ${form.height}`}{" "}
            · {form.steps}스텝 · {modelSummary}
            {editing ? ` · 편집(참조 ${form.references.length}장)` : ""} · ⌘/Ctrl + Enter 로도 시작할 수 있습니다
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
