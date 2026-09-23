import type { ServerEvent } from "@/lib/types";
import { onShutdown, subscribe } from "@/lib/server/events";
import { engineStatus } from "@/lib/server/queue";
import { store } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let offShutdown: (() => void) | undefined;
  let ping: NodeJS.Timeout | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ServerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send({ type: "snapshot", jobs: store.list() });
      void engineStatus().then((status) => send({ type: "engine", status }));
      unsubscribe = subscribe(send);
      // 15초마다 엔진 상태를 함께 보내 연결 유지와 상태 갱신을 겸한다.
      ping = setInterval(() => {
        void engineStatus()
          .then((status) => send({ type: "engine", status }))
          .catch(() => send({ type: "ping" }));
      }, 15_000);
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        offShutdown?.();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      };
      req.signal.addEventListener("abort", close);
      // 서버가 내려갈 때 연결을 끊어 종료가 막히지 않게 한다. 브라우저는 EventSource 로 다시 붙는다.
      offShutdown = onShutdown(close);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      offShutdown?.();
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
