import { EventEmitter } from "node:events";
import type { ServerEvent } from "@/lib/types";

type Listener = (event: ServerEvent) => void;

const g = globalThis as unknown as { __qwenEvents?: EventEmitter };
const emitter = (g.__qwenEvents ??= new EventEmitter());
emitter.setMaxListeners(200);

export function publish(event: ServerEvent): void {
  emitter.emit("event", event);
}

export function subscribe(listener: Listener): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

/**
 * 서버 종료 알림. SSE 같은 장기 연결은 이를 받아 스스로 닫아야 한다.
 * Next 는 진행 중인 요청이 끝나길 기다리므로, 열린 SSE 가 남아 있으면 Ctrl+C 로 종료되지 않는다.
 */
export function onShutdown(listener: () => void): () => void {
  emitter.on("shutdown", listener);
  return () => emitter.off("shutdown", listener);
}

export function triggerShutdown(): void {
  emitter.emit("shutdown");
}
