// Proxy for the companion's LLM. The browser's openai SDK POSTs here (same-origin,
// so no CORS juggling); we inject the OpenRouter API key server-side (it never
// reaches the browser bundle) and stream OpenRouter's SSE response straight back.
// The MODEL is chosen per-companion by the client and is NOT overridden here — a
// multi-companion picker with differing models needs the client to name the model
// (model slugs aren't secret; only the key is). Abortable: the request's signal is
// forwarded upstream, so a client abort (barge-in / Stop) tears down generation.
// Intentionally unauthenticated for the local experiment — see the design's
// "Pre-deployment hardening" note (doubly relevant now it fronts a paid key).
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const url = process.env.LLM_URL;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!url || !apiKey) {
    return Response.json(
      { error: "LLM_URL and OPENROUTER_API_KEY not set" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        // OpenRouter attribution (optional; shows up on their dashboard).
        "HTTP-Referer": "http://localhost:8931",
        "X-Title": "Vacuglide Companions",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch {
    return Response.json({ error: "LLM upstream unreachable" }, { status: 502 });
  }

  if (!upstream.ok || upstream.body === null) {
    return Response.json({ error: "LLM upstream error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream" },
  });
}
