import type { EngineStatus, Job, JobProgress } from "@/lib/types";
import { CancelledError, comfy } from "./comfy";
import { publish } from "./events";
import { mfluxAvailable, runMflux } from "./mflux";
import { store } from "./store";

type ProgressUpdate = Partial<JobProgress> & { promptId?: string };

class Worker {
  runningId: string | undefined;
  private cancelFns = new Map<string, () => Promise<void>>();
  private timing = new Map<string, { samplingStartedAt: number; firstStep: number }>();
  private kicking = false;

  kick(): void {
    if (this.runningId || this.kicking) return;
    const next = store
      .list()
      .filter((j) => j.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    this.kicking = true;
    void this.run(next).finally(() => {
      this.kicking = false;
      setTimeout(() => this.kick(), 50);
    });
  }

  private async run(job: Job): Promise<void> {
    this.runningId = job.id;
    job.status = "running";
    job.startedAt = Date.now();
    job.progress = { step: 0, total: job.params.steps, phase: "starting" };
    store.upsert(job);
    void publishEngineStatus();

    const update = (u: ProgressUpdate) => this.applyUpdate(job.id, u);
    const onCancelReady = (fn: () => Promise<void>) => this.cancelFns.set(job.id, fn);

    try {
      const image =
        job.params.engine === "mflux"
          ? await runMflux(job, update, onCancelReady)
          : await comfy.run(job, update, onCancelReady);
      store.patch(job.id, (j) => {
        j.status = "done";
        j.image = image;
        j.finishedAt = Date.now();
        j.progress = { step: j.params.steps, total: j.params.steps, phase: "finished" };
      });
    } catch (err) {
      const cancelled = err instanceof CancelledError;
      store.patch(job.id, (j) => {
        j.status = cancelled ? "cancelled" : "failed";
        j.error = cancelled ? undefined : err instanceof Error ? err.message : String(err);
        j.finishedAt = Date.now();
      });
      if (!cancelled) console.error(`[worker] 작업 ${job.id} 실패:`, err);
    } finally {
      this.cancelFns.delete(job.id);
      this.timing.delete(job.id);
      this.runningId = undefined;
      comfy.invalidateStatus();
      void publishEngineStatus();
    }
  }

  private applyUpdate(jobId: string, u: ProgressUpdate): void {
    store.patch(jobId, (j) => {
      if (j.status !== "running") return;
      if (u.promptId) j.promptId = u.promptId;
      const prev = j.progress;
      const next: JobProgress = {
        step: u.step ?? prev.step,
        total: u.total ?? prev.total,
        phase: u.phase ?? prev.phase,
      };
      if (next.phase === "sampling" && next.step > 0) {
        const t = this.timing.get(jobId);
        if (!t) {
          this.timing.set(jobId, { samplingStartedAt: Date.now(), firstStep: next.step });
        } else if (next.step > t.firstStep) {
          const perStep = (Date.now() - t.samplingStartedAt) / (next.step - t.firstStep);
          next.etaMs = Math.max(0, perStep * (next.total - next.step));
        }
      }
      j.progress = next;
    });
  }

  async cancel(id: string): Promise<Job | undefined> {
    const job = store.get(id);
    if (!job) return undefined;
    if (job.status === "queued") {
      return store.patch(id, (j) => {
        j.status = "cancelled";
        j.finishedAt = Date.now();
      });
    }
    if (job.status === "running") {
      const fn = this.cancelFns.get(id);
      if (fn) await fn();
      else {
        // 아직 엔진이 취소 함수를 등록하기 전이면 실패로 표시만 한다.
        return store.patch(id, (j) => {
          j.status = "cancelled";
          j.finishedAt = Date.now();
        });
      }
    }
    return store.get(id);
  }

  queuedCount(): number {
    return store.list().filter((j) => j.status === "queued").length;
  }
}

const g = globalThis as unknown as { __qwenWorker?: Worker };
export const worker: Worker = (g.__qwenWorker ??= new Worker());

export async function engineStatus(): Promise<EngineStatus> {
  const [comfyStatus, mflux] = await Promise.all([comfy.getStatus(), mfluxAvailable()]);
  return {
    comfy: { ...comfyStatus, starting: comfy.starting },
    mflux,
    worker: { runningJobId: worker.runningId, queued: worker.queuedCount() },
  };
}

export async function publishEngineStatus(): Promise<void> {
  try {
    publish({ type: "engine", status: await engineStatus() });
  } catch (err) {
    console.error("[worker] 엔진 상태 전송 실패:", err);
  }
}

// 서버가 시작될 때 대기 중이던 작업을 이어서 처리한다.
setTimeout(() => worker.kick(), 500);
