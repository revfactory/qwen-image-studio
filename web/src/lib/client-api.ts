import type { CreateJobsRequest, EngineStatus, Job, UploadInfo } from "@/lib/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  }
  return data as T;
}

export const api = {
  listJobs: () => request<{ jobs: Job[] }>("/api/jobs"),
  createJobs: (body: CreateJobsRequest) =>
    request<{ jobs: Job[] }>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  cancelJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  deleteJob: (id: string) => request<{ ok: true }>(`/api/jobs/${id}`, { method: "DELETE" }),
  deleteJobs: (ids: string[]) =>
    request<{ deleted: string[] }>("/api/jobs", { method: "DELETE", body: JSON.stringify({ ids }) }),
  status: () => request<EngineStatus>("/api/status"),
  upload: async (file: File): Promise<UploadInfo> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? `업로드 실패 (${res.status})`);
    return data as UploadInfo;
  },
  uploadFromJob: (jobId: string) =>
    request<UploadInfo>(`/api/uploads/from-job/${jobId}`, { method: "POST" }),
  deleteUpload: (id: string) => request<{ ok: true }>(`/api/uploads/${id}`, { method: "DELETE" }),
  startComfy: () => request<{ starting: boolean }>("/api/status/start", { method: "POST" }),
};

export function imageUrl(id: string, download = false): string {
  return `/api/images/${id}${download ? "?download=1" : ""}`;
}

export function uploadUrl(id: string): string {
  return `/api/uploads/${id}`;
}
