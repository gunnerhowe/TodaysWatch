import type { FastifyReply } from "fastify";

/** Start a server-sent-events response on a hijacked reply, keeping CORS headers. */
export function startSse(reply: FastifyReply) {
  for (const [k, v] of Object.entries(reply.getHeaders())) if (v !== undefined) reply.raw.setHeader(k, v as string);
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  raw.write(": ok\n\n");
  const ping = setInterval(() => raw.write(": ping\n\n"), 15_000);
  let closed = false;
  raw.on("close", () => {
    closed = true;
    clearInterval(ping);
  });
  return {
    send(event: string, data: unknown) {
      if (closed) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      clearInterval(ping);
      if (!closed) raw.end();
      closed = true;
    },
    get closed() {
      return closed;
    },
    onClose(fn: () => void) {
      raw.on("close", fn);
    },
  };
}
