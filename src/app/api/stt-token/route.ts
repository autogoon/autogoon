export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set" },
      { status: 503 },
    );
  }
  const upstream = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    { method: "POST", headers: { "xi-api-key": key } },
  );
  if (!upstream.ok) {
    return Response.json({ error: "token mint failed" }, { status: 500 });
  }
  const { token } = (await upstream.json()) as { token: string };
  return Response.json({ token });
}
