"use client";

import {
  BanIcon,
  CheckSquareIcon,
  DownloadIcon,
  ImageIcon,
  ImagePlusIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageDialog } from "@/components/image-dialog";
import { imageUrl } from "@/lib/client-api";
import { truncate } from "@/lib/format";
import { MAX_BATCH_REFERENCES, MAX_REFERENCES } from "@/lib/presets";
import type { GenerationParams, Job } from "@/lib/types";

type Filter = "all" | "done" | "failed";

interface Props {
  jobs: Job[];
  loaded: boolean;
  onDelete: (ids: string[]) => void;
  onLoadParams: (params: GenerationParams) => void;
  onRegenerate: (params: GenerationParams, keepSeed: boolean) => void;
  /** 선택한 이미지들을 현재 참조 목록에 덧붙인다 */
  onAddReferences: (jobs: Job[]) => void;
  /** 이 이미지 한 장을 참조로 삼아 편집을 시작한다 */
  onEditImage: (job: Job) => void;
}

export function Gallery({ jobs, loaded, onDelete, onLoadParams, onRegenerate, onAddReferences, onEditImage }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter === "done" && j.status !== "done") return false;
      if (filter === "failed" && j.status === "done") return false;
      if (q && !j.params.prompt.toLowerCase().includes(q) && !String(j.params.seed).includes(q)) return false;
      return true;
    });
  }, [jobs, query, filter]);

  const doneVisible = useMemo(() => visible.filter((j) => j.status === "done"), [visible]);
  const openIndex = openId ? doneVisible.findIndex((j) => j.id === openId) : -1;
  const openJob = openIndex >= 0 ? doneVisible[openIndex] : null;

  const navigate = useCallback(
    (dir: -1 | 1) => {
      const next = doneVisible[openIndex + dir];
      if (next) setOpenId(next.id);
    },
    [doneVisible, openIndex],
  );

  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const failedCount = jobs.filter((j) => j.status !== "done").length;
  const selectedDone = useMemo(
    () => visible.filter((j) => j.status === "done" && selected.has(j.id)),
    [visible, selected],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-base font-semibold">갤러리</h2>
        <Badge variant="secondary" className="tabular-nums">
          {jobs.filter((j) => j.status === "done").length}장
        </Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="프롬프트·시드 검색"
              className="h-8 w-48 pl-8 text-sm"
              aria-label="갤러리 검색"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">전체</TabsTrigger>
              <TabsTrigger value="done">완료</TabsTrigger>
              <TabsTrigger value="failed">
                실패·취소{failedCount ? <span className="tabular-nums text-muted-foreground">{failedCount}</span> : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {selectMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((j) => j.id)))
                }
              >
                {selected.size === visible.length ? <SquareIcon data-icon="inline-start" /> : <CheckSquareIcon data-icon="inline-start" />}
                {selected.size === visible.length ? "선택 해제" : "전체 선택"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedDone.length === 0 || selectedDone.length > MAX_BATCH_REFERENCES}
                title={
                  selectedDone.length > MAX_BATCH_REFERENCES
                    ? `참조 이미지는 최대 ${MAX_BATCH_REFERENCES}장까지 고를 수 있습니다`
                    : selectedDone.length > MAX_REFERENCES
                      ? `${MAX_REFERENCES}장을 넘으면 각 이미지에 프롬프트를 따로 적용하는 배치 편집으로 추가됩니다`
                      : "선택한 이미지를 생성 폼의 참조 이미지에 추가합니다"
                }
                onClick={() => {
                  onAddReferences(selectedDone);
                  exitSelectMode();
                }}
              >
                <ImagePlusIcon data-icon="inline-start" />
                {selectedDone.length > 0 ? `${selectedDone.length}장 ` : ""}참조로 추가
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => setConfirmIds([...selected])}
              >
                <Trash2Icon data-icon="inline-start" />
                {selected.size}개 삭제
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                완료
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" disabled={visible.length === 0} onClick={() => setSelectMode(true)}>
                <CheckSquareIcon data-icon="inline-start" />
                선택
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={visible.length === 0}
                title={filter === "all" ? "갤러리의 모든 항목을 삭제합니다" : "현재 필터에 보이는 항목을 모두 삭제합니다"}
                onClick={() => setConfirmIds(visible.map((j) => j.id))}
              >
                <Trash2Icon data-icon="inline-start" />
                전체 삭제{visible.length > 0 ? ` (${visible.length})` : ""}
              </Button>
            </>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <ImageIcon className="size-5 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-medium">{jobs.length === 0 ? "아직 생성한 이미지가 없습니다" : "조건에 맞는 항목이 없습니다"}</p>
            <p className="text-xs text-muted-foreground">
              {jobs.length === 0 ? "왼쪽에서 프롬프트를 입력하고 생성을 시작하세요." : "검색어나 필터를 바꿔 보세요."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((job) => {
            const p = job.params;
            const isSelected = selected.has(job.id);
            const ratio = job.image ? `${job.image.width} / ${job.image.height}` : `${p.width} / ${p.height}`;
            if (job.status !== "done") {
              return (
                <div
                  key={job.id}
                  className={
                    "relative flex flex-col gap-2 rounded-xl border border-dashed p-3 text-xs " +
                    (isSelected ? "border-primary bg-primary/5" : "border-border")
                  }
                  style={{ aspectRatio: ratio }}
                  onClick={() => selectMode && toggleSelected(job.id)}
                >
                  {selectMode ? (
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(job.id)} className="absolute top-2 left-2 bg-background" />
                  ) : null}
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {job.status === "failed" ? (
                      <TriangleAlertIcon className="size-3.5 text-destructive" />
                    ) : (
                      <BanIcon className="size-3.5" />
                    )}
                    <span className="font-medium">{job.status === "failed" ? "실패" : "취소됨"}</span>
                    <span className="ml-auto tabular-nums">시드 {p.seed}</span>
                  </div>
                  <p className="line-clamp-3 leading-snug" title={p.prompt}>
                    {truncate(p.prompt, 120)}
                  </p>
                  {job.error ? (
                    <p className="line-clamp-2 text-destructive" title={job.error}>
                      {job.error}
                    </p>
                  ) : null}
                  {!selectMode ? (
                    <div className="mt-auto flex gap-1.5">
                      <Button size="xs" variant="outline" onClick={() => onRegenerate(p, true)}>
                        <RefreshCwIcon data-icon="inline-start" />
                        다시 시도
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setConfirmIds([job.id])}>
                        <Trash2Icon data-icon="inline-start" />
                        삭제
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <div
                key={job.id}
                className={
                  "group relative overflow-hidden rounded-xl border bg-muted transition-shadow " +
                  (isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:shadow-md")
                }
                style={{ aspectRatio: ratio }}
              >
                <button
                  type="button"
                  className="absolute inset-0 size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label="이미지 크게 보기"
                  onClick={() => (selectMode ? toggleSelected(job.id) : setOpenId(job.id))}
                >
                  <Image
                    src={imageUrl(job.id)}
                    alt={truncate(p.prompt, 100)}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 20vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </button>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 pt-8 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="line-clamp-2 leading-snug">{p.prompt}</p>
                  <p className="mt-0.5 tabular-nums text-white/70">
                    {job.image?.width}×{job.image?.height} · 시드 {p.seed} · {p.steps}스텝
                    {p.references?.length ? ` · 편집(참조 ${p.references.length}장)` : ""}
                  </p>
                </div>

                {p.references?.length ? (
                  <span
                    className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground"
                    title="참조 이미지로 편집한 결과"
                  >
                    <PencilLineIcon className="size-3.5" />
                  </span>
                ) : null}
                {selectMode ? (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(job.id)}
                    aria-label="선택"
                    className="absolute top-2 left-2 size-5 bg-background/90"
                  />
                ) : (
                  <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="secondary" size="icon-sm" aria-label="더 보기" className="bg-background/90" />}
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAddReferences([job])}>
                          <ImagePlusIcon />
                          참조 이미지로 추가
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditImage(job)}>
                          <PencilLineIcon />
                          이 이미지 편집하기
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onLoadParams(p)}>
                          <SlidersHorizontalIcon />
                          설정 불러오기
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRegenerate(p, true)}>
                          <RefreshCwIcon />
                          같은 시드로 재생성
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRegenerate(p, false)}>
                          <RefreshCwIcon />
                          새 시드로 재생성
                        </DropdownMenuItem>
                        <DropdownMenuItem render={<a href={imageUrl(job.id, true)} download />}>
                          <DownloadIcon />
                          다운로드
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setConfirmIds([job.id])}>
                          <Trash2Icon />
                          삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ImageDialog
        job={openJob}
        hasPrev={openIndex > 0}
        hasNext={openIndex >= 0 && openIndex < doneVisible.length - 1}
        onNavigate={navigate}
        onClose={() => setOpenId(null)}
        onDelete={(id) => onDelete([id])}
        onLoadParams={(params) => {
          setOpenId(null);
          onLoadParams(params);
        }}
        onRegenerate={(params, keepSeed) => {
          setOpenId(null);
          onRegenerate(params, keepSeed);
        }}
        onAddReference={(job) => onAddReferences([job])}
        onEditImage={(job) => {
          setOpenId(null);
          onEditImage(job);
        }}
      />

      <AlertDialog open={confirmIds !== null} onOpenChange={(open) => !open && setConfirmIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmIds && confirmIds.length > 1 ? `${confirmIds.length}개 항목을 삭제할까요?` : "이 항목을 삭제할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>이미지 파일과 생성 기록이 함께 지워지며 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmIds) onDelete(confirmIds);
                setConfirmIds(null);
                exitSelectMode();
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
