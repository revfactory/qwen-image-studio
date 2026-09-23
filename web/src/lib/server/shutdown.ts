import { triggerShutdown } from "./events";
import { store } from "./store";

/** 정리 뒤 Next 가 스스로 끝나길 기다리는 최대 시간. 남은 요청은 짧으므로 길게 잡을 이유가 없다. */
const FORCE_EXIT_MS = 1_500;

/**
 * 종료 신호 처리. 열린 SSE 연결을 끊고 작업 기록을 저장한 뒤 Next 의 정상 종료에 맡긴다.
 * Next 는 진행 중 요청이 끝나길 기다리므로 SSE 가 열려 있으면 Ctrl+C 로 끝나지 않는다.
 * 그래도 끝나지 않으면 잠시 후 강제로 끝낸다.
 */
export function installShutdownHandlers(): void {
  const g = globalThis as unknown as { __qwenShutdownHooked?: boolean };
  if (g.__qwenShutdownHooked) return;
  g.__qwenShutdownHooked = true;

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} 수신: 연결을 정리하고 종료합니다.`);
    try {
      triggerShutdown();
      store.flush();
    } catch (err) {
      console.error("[server] 종료 정리 중 오류:", err);
    }
    setTimeout(() => {
      console.log(`[server] 정리를 마쳤습니다. 종료합니다.`);
      process.exit(0);
    }, FORCE_EXIT_MS).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
