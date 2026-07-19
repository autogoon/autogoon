// Proxy for the companion's LLM. The browser's openai SDK POSTs here (same-origin,
// so no CORS / OLLAMA_ORIGINS juggling); we inject LLM_MODEL server-side (the host
// and model stay off the client) and stream Ollama's SSE response straight back.
// Abortable: the request's signal is forwarded to the upstream fetch, so a client
// abort (barge-in / Stop) tears down the generation. Intentionally unauthenticated
// for the local experiment — see the design's "Pre-deployment hardening" note.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const url = process.env.LLM_URL;
  const model = process.env.LLM_MODEL;
  if (!url || !model) {
    return Response.json(
      { error: "LLM_URL and LLM_MODEL not set" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  body.model = model; // override — model detail stays server-side

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch {
    return Response.json(
      { error: "LLM upstream unreachable" },
      { status: 502 },
    );
  }

  if (!upstream.ok || upstream.body === null) {
    return Response.json({ error: "LLM upstream error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream" },
  });
}
