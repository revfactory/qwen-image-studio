"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ActiveJobs } from "@/components/active-jobs";
import { Gallery } from "@/components/gallery";
import { GeneratorForm, type LoadRequest, type ReferenceRequest } from "@/components/generator-form";
import { api } from "@/lib/client-api";
import { Header } from "@/components/header";
import { useJobs } from "@/hooks/use-jobs";
import type { GenerationParams, Job } from "@/lib/types";

export default function Home() {
  const { active, finished, previews, engine, connected, loaded, createJobs, cancelJob, deleteJobs, startComfy } =
    useJobs();
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const [referenceRequest, setReferenceRequest] = useState<ReferenceRequest | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    async (params: GenerationParams, count: number, perReference = false) => {
      try {
        await createJobs(params, count, perReference);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "작업을 추가하지 못했습니다");
      }
    },
    [createJobs],
  );

  const handleLoadParams = useCallback((params: GenerationParams) => {
    setLoadRequest({ params, nonce: Date.now() });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("설정을 불러왔습니다. 필요한 값을 고친 뒤 생성을 시작하세요.");
  }, []);

  /** 갤러리 이미지를 참조 이미지로 넘긴다. add 는 현재 목록에 덧붙이고, replace 는 그 이미지로 바꾼다. */
  const handleReferences = useCallback(async (jobs: Job[], mode: "add" | "replace") => {
    if (jobs.length === 0) return;
    try {
      const ids: string[] = [];
      for (const job of jobs) {
        const info = await api.uploadFromJob(job.id);
        ids.push(info.id);
      }
      setReferenceRequest({ ids, mode, nonce: Date.now() });
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "참조 이미지로 추가하지 못했습니다");
    }
  }, []);

  const handleRegenerate = useCallback(
    (params: GenerationParams, keepSeed: boolean) => {
      void handleSubmit({ ...params, seed: keepSeed ? params.seed : null }, 1);
    },
    [handleSubmit],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Header engine={engine} connected={connected} onStartComfy={() => void startComfy()} />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
          <div
            ref={formRef}
            className="scroll-mt-20 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1"
          >
            <GeneratorForm
              engine={engine}
              loadRequest={loadRequest}
              referenceRequest={referenceRequest}
              onSubmit={handleSubmit}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <ActiveJobs jobs={active} previews={previews} onCancel={(id) => void cancelJob(id)} />
            <Gallery
              jobs={finished}
              loaded={loaded}
              onDelete={(ids) => void deleteJobs(ids)}
              onLoadParams={handleLoadParams}
              onRegenerate={handleRegenerate}
              onAddReferences={(jobs) => void handleReferences(jobs, "add")}
              onEditImage={(job) => void handleReferences([job], "replace")}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
