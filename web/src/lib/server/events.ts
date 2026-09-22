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
