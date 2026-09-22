"use client";

import { CheckSquareIcon, ImageIcon, ImagePlusIcon, Loader2Icon, SquareIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, uploadUrl } from "@/lib/client-api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { MAX_BATCH_REFERENCES, MAX_REFERENCES } from "@/lib/presets";
import type { UploadEntry } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이미 폼에 들어 있는 참조 ID. 목록에서 표시만 하고 다시 고르지 않게 한다 */
  current: string[];
  /** 고른 이미지들을 폼의 참조 목록에 덧붙인다 */
  onPick: (ids: string[]) => void;
}

/**
 * 업로드 폴더에 있는 참조 이미지 갤러리(보관함).
 * 여러 장을 골라 폼에 넣을 수 있고, 더는 쓰지 않는 파일은 서버에서 지울 수 있다.
 * 열릴 때만 본문을 마운트해 목록과 선택이 매번 새로 시작된다.
 */
export function UploadLibrary({ open, onOpenChange, current, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[min(960px,calc(100vw-2rem))]">
        {open ? <LibraryBody current={current} onPick={onPick} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LibraryBody({ current, onPick, onClose }: { current: string[]; onPick: (ids: string[]) => void; onClose: () => void }) {
  const [entries, setEntries] = useState<UploadEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 마운트 시 서버 목록을 읽는다.
  useEffect(() => {
    let cancelled = false;
    api
      .listUploads()
      .then((res) => {
        if (!cancelled) setEntries(res.uploads);
      })
      .catch((err) => {
        if (cancelled) return;
        setEntries([]);
        toast.error(err instanceof Error ? err.message : "보관함을 불러오지 못했습니다");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSet = useMemo(() => new Set(current), [current]);
  const pickable = useMemo(() => (entries ?? []).filter((e) => !currentSet.has(e.id)), [entries, currentSet]);
  const room = MAX_BATCH_REFERENCES - current.length;
  const selectedIds = [...selected];
  const overflow = selectedIds.length > room;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPickableSelected = pickable.length > 0 && pickable.every((e) => selected.has(e.id));
  const toggleAll = () =>
    setSelected(allPickableSelected ? new Set() : new Set(pickable.slice(0, Math.max(room, 0)).map((e) => e.id)));

  const pick = () => {
    if (selectedIds.length === 0 || overflow) return;
    // 목록 순서(최신순)대로 넣는다.
    const ordered = pickable.filter((e) => selected.has(e.id)).map((e) => e.id);
    onPick(ordered);
    onClose();
  };

  const remove = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => api.deleteUpload(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const removed = new Set(selectedIds.filter((_, i) => results[i].status === "fulfilled"));
      setEntries((list) => (list ?? []).filter((e) => !removed.has(e.id)));
      setSelected(new Set());
      if (failed) toast.error(`${failed}장은 삭제하지 못했습니다`);
      if (removed.size) toast(`보관함에서 ${removed.size}장을 삭제했습니다`);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <DialogHeader className="border-b p-4 pr-14">
        <DialogTitle className="flex items-center gap-2">
          참조 이미지 보관함
          {entries ? (
            <Badge variant="secondary" className="tabular-nums">
              {entries.length}장
            </Badge>
          ) : null}
        </DialogTitle>
        <DialogDescription>
          지금까지 올린 참조 이미지입니다. 여러 장을 골라 넣으면 {MAX_REFERENCES}장까지는 한 작업에서 합성하고, 그보다
          많으면 각 이미지에 프롬프트를 따로 적용하는 배치 편집으로 바뀝니다. 한 번에 최대 {MAX_BATCH_REFERENCES}장.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button variant="outline" size="sm" disabled={pickable.length === 0} onClick={toggleAll}>
          {allPickableSelected ? <SquareIcon data-icon="inline-start" /> : <CheckSquareIcon data-icon="inline-start" />}
          {allPickableSelected ? "선택 해제" : `전체 선택${room < pickable.length ? ` (${Math.max(room, 0)}장까지)` : ""}`}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {selectedIds.length > 0 ? `${selectedIds.length}장 선택` : "썸네일을 눌러 고르세요"}
          {current.length > 0 ? ` · 폼에 ${current.length}장 있음` : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive hover:text-destructive"
          disabled={selectedIds.length === 0 || deleting}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          {selectedIds.length > 0 ? `${selectedIds.length}장 ` : ""}파일 삭제
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {entries === null ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                <ImageIcon className="size-5 text-muted-foreground" />
              </span>
              <div>
                <p className="text-sm font-medium">아직 올린 참조 이미지가 없습니다</p>
                <p className="text-xs text-muted-foreground">
                  생성 폼의 [이미지 추가]로 올리거나, 갤러리에서 [참조 이미지로 추가]를 누르면 여기에 쌓입니다.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {entries.map((e) => {
                const inForm = currentSet.has(e.id);
                const isSelected = selected.has(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={inForm}
                    aria-pressed={isSelected}
                    aria-label={inForm ? "이미 폼에 있는 이미지" : isSelected ? "선택 해제" : "선택"}
                    title={`${e.width}×${e.height} · ${formatBytes(e.bytes)} · ${formatDateTime(e.createdAt)}`}
                    onClick={() => toggle(e.id)}
                    className={
                      "group relative aspect-square overflow-hidden rounded-lg border bg-muted text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring " +
                      (isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:shadow-md") +
                      (inForm ? " cursor-default opacity-50" : " cursor-pointer")
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadUrl(e.id)} alt="" className="size-full object-cover" />
                    {inForm ? (
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white">
                        폼에 있음
                      </span>
                    ) : (
                      <Checkbox
                        checked={isSelected}
                        tabIndex={-1}
                        aria-hidden
                        className={
                          "absolute top-1.5 left-1.5 size-5 bg-background/90 transition-opacity " +
                          (isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                        }
                      />
                    )}
                    <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] tabular-nums text-white">
                      {e.width}×{e.height}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="mx-0 mb-0 items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {overflow
            ? `폼에 넣을 수 있는 자리가 ${Math.max(room, 0)}장뿐입니다. 선택을 줄이거나 폼의 참조를 비우세요.`
            : selectedIds.length + current.length > MAX_REFERENCES
              ? `${selectedIds.length + current.length}장: 각 이미지에 프롬프트를 따로 적용하는 배치 편집으로 넣습니다.`
              : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button disabled={selectedIds.length === 0 || overflow} onClick={pick}>
            <ImagePlusIcon data-icon="inline-start" />
            {selectedIds.length > 0 ? `${selectedIds.length}장 ` : ""}참조로 넣기
          </Button>
        </div>
      </DialogFooter>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>참조 이미지 {selectedIds.length}장을 서버에서 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              업로드 파일이 지워지며 되돌릴 수 없습니다. 이 이미지를 참조한 과거 생성 기록에서는 참조 썸네일이 더 이상 보이지
              않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void remove()}>
              {deleting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
