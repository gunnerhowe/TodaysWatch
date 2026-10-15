"use client";

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const postJson = <T,>(path: string, body: unknown) => getJson<T>(path, { method: "POST", body: JSON.stringify(body) });

let cached: { token: string; url: string; at: number } | null = null;

/** Short-lived token for streams that go straight to the API. Refreshed every 4 minutes. */
export async function streamToken(): Promise<{ token: string; url: string }> {
  if (cached && Date.now() - cached.at < 4 * 60_000) return cached;
  const res = await fetch("/api/stream-token", { method: "POST" });
  if (!res.ok) throw new Error("Couldn't start a stream");
  const j = (await res.json()) as { token: string; url: string };
  cached = { ...j, at: Date.now() };
  return cached;
}

/** Parse an SSE body from fetch (used for POST /v1/agent/chat). */
export async function* readSse(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) {
        try {
          yield { event, data: JSON.parse(data) };
        } catch {
          /* skip malformed */
        }
      }
    }
  }
}
