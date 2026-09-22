"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  PencilLineIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { imageUrl, uploadUrl } from "@/lib/client-api";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { textEncoderLabel } from "@/lib/presets";
import type { GenerationParams, Job } from "@/lib/types";

interface Props {
  job: Job | null;
  hasPrev: boolean;
  hasNext: boolean;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onLoadParams: (params: GenerationParams) => void;
  onRegenerate: (params: GenerationParams, keepSeed: boolean) => void;
  onUseAsReference: (job: Job) => void;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}을 복사했습니다`);
  } catch {
    toast.error("클립보드에 복사하지 못했습니다");
  }
}

export function ImageDialog({
  job,
  hasPrev,
  hasNext,
  onNavigate,
  onClose,
  onDelete,
  onLoadParams,
  onRegenerate,
  onUseAsReference,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!job) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(-1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [job, hasPrev, hasNext, onNavigate]);

  const p = job?.params;
  const duration = job?.startedAt && job.finishedAt ? job.finishedAt - job.startedAt : undefined;

  return (
    <>
      <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-[min(1200px,calc(100vw-2rem))]">
          {job && p ? (
            <div className="grid max-h-[92vh] md:grid-cols-[minmax(0,1fr)_360px]">
              <div className="relative flex items-center justify-center bg-black/90 md:min-h-[60vh]">
                {job.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(job.id)}
                    alt={p.prompt}
                    width={job.image.width}
                    height={job.image.height}
                    className="max-h-[50vh] w-full object-contain md:max-h-[92vh]"
                  />
                ) : (
                  <p className="p-10 text-sm text-muted-foreground">이미지가 없습니다.</p>
                )}
                {hasPrev ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="이전 이미지"
                    className="absolute top-1/2 left-2 -translate-y-1/2 opacity-80"
                    onClick={() => onNavigate(-1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                ) : null}
                {hasNext ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="다음 이미지"
                    className="absolute top-1/2 right-2 -translate-y-1/2 opacity-80"
                    onClick={() => onNavigate(1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="max-h-[42vh] md:max-h-[92vh]">
                <div className="flex flex-col gap-4 p-5 pr-12">
                  <DialogHeader>
                    <DialogTitle>이미지 정보</DialogTitle>
                    <DialogDescription>
                      {formatDateTime(job.finishedAt ?? job.createdAt)}
                      {job.image ? ` · ${job.image.width}×${job.image.height} · ${formatBytes(job.image.bytes)}` : ""}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">프롬프트</span>
                      <Button variant="ghost" size="xs" onClick={() => void copy(p.prompt, "프롬프트")}>
                        <CopyIcon data-icon="inline-start" />
                        복사
                      </Button>
                    </div>
                    <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {p.prompt}
                    </p>
                  </div>

                  {p.negativePrompt ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">부정 프롬프트</span>
                      <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
                        {p.negativePrompt}
                      </p>
                    </div>
                  ) : null}

                  {p.references?.length ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">참조 이미지 {p.references.length}장</span>
                      <div className="flex flex-wrap gap-2">
                        {p.references.map((id, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={id}
                            src={uploadUrl(id)}
                            alt={`참조 이미지 ${i + 1}`}
                            className="size-16 rounded-md border object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <Separator />

                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">엔진</dt>
                    <dd>{p.engine === "comfyui" ? "ComfyUI · GGUF" : "mflux · MLX"}</dd>
                    <dt className="text-muted-foreground">모델</dt>
                    <dd className="break-all">
                      {p.engine === "comfyui" ? p.gguf : p.quantize ? `Qwen-Image-2.1 bf16 → ${p.quantize}bit` : "Qwen-Image-2.1 bf16"}
                    </dd>
                    {p.engine === "comfyui" ? (
                      <>
                        <dt className="text-muted-foreground">텍스트 인코더</dt>
                        <dd className="break-all">{textEncoderLabel(p.textEncoder)}</dd>
                      </>
                    ) : null}
                    <dt className="text-muted-foreground">크기</dt>
                    <dd className="tabular-nums">
                      {p.width} × {p.height}
                    </dd>
                    <dt className="text-muted-foreground">스텝 / CFG</dt>
                    <dd className="tabular-nums">
                      {p.steps} / {p.cfg}
                    </dd>
                    <dt className="text-muted-foreground">시드</dt>
                    <dd className="flex items-center gap-1 tabular-nums">
                      {p.seed}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="시드 복사"
                        onClick={() => void copy(String(p.seed), "시드")}
                      >
                        <CopyIcon />
                      </Button>
                    </dd>
                    <dt className="text-muted-foreground">샘플러</dt>
                    <dd>
                      {p.engine === "comfyui" ? `${p.sampler} · ${p.scheduler}` : "euler · linear"}
                    </dd>
                    <dt className="text-muted-foreground">소요 시간</dt>
                    <dd>{formatDuration(duration)}</dd>
                    <dt className="text-muted-foreground">상태</dt>
                    <dd>
                      <Badge variant={job.status === "done" ? "secondary" : "destructive"}>
                        {job.status === "done" ? "완료" : job.status === "failed" ? "실패" : "취소"}
                      </Badge>
                    </dd>
                  </dl>

                  {job.error ? (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs break-words text-destructive">
                      {job.error}
                    </p>
                  ) : null}

                  <Separator />

                  <div className="grid grid-cols-2 gap-2">
                    <Button className="col-span-2" onClick={() => onUseAsReference(job)}>
                      <PencilLineIcon data-icon="inline-start" />
                      이 이미지 편집하기
                    </Button>
                    <Button variant="outline" onClick={() => onLoadParams(p)}>
                      <SlidersHorizontalIcon data-icon="inline-start" />
                      설정 불러오기
                    </Button>
                    <Tooltip>
                      <TooltipTrigger render={<Button variant="outline" onClick={() => onRegenerate(p, true)} />}>
                        <RefreshCwIcon data-icon="inline-start" />
                        같은 시드로 재생성
                      </TooltipTrigger>
                      <TooltipContent>같은 설정과 시드로 다시 생성합니다</TooltipContent>
                    </Tooltip>
                    <Button variant="outline" onClick={() => onRegenerate(p, false)}>
                      <RefreshCwIcon data-icon="inline-start" />
                      새 시드로 재생성
                    </Button>
                    {job.image ? (
                      <Button variant="outline" render={<a href={imageUrl(job.id, true)} download />}>
                        <DownloadIcon data-icon="inline-start" />
                        다운로드
                      </Button>
                    ) : null}
                    <Button variant="destructive" className="col-span-2" onClick={() => setConfirmDelete(true)}>
                      <Trash2Icon data-icon="inline-start" />
                      삭제
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 이미지를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>이미지 파일과 생성 기록이 함께 지워지며 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (job) onDelete(job.id);
                setConfirmDelete(false);
                onClose();
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
