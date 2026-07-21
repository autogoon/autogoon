import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { checkAccess } from "@/lib/companions/access-check";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!checkAccess(request).ok) {
    return Response.json({ error: "access denied" }, { status: 401 });
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key)
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set" },
      { status: 503 },
    );

  const { text, voiceId } = (await request.json()) as {
    text?: string;
    voiceId?: string;
  };
  if (!text || !voiceId)
    return Response.json(
      { error: "text and voiceId required" },
      { status: 400 },
    );

  const client = new ElevenLabsClient({ apiKey: key });
  const audio = await client.textToSpeech.stream(voiceId, {
    modelId: "eleven_v3",
    text,
    outputFormat: "mp3_44100_128",
  });

  return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
}
