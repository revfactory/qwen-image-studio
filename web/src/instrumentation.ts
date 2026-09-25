/** 서버 인스턴스가 뜰 때 한 번 실행된다 (Next instrumentation 관례). Node 런타임에서만 종료 처리를 건다. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installShutdownHandlers } = await import("@/lib/server/shutdown");
  installShutdownHandlers();
}
