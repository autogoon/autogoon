import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const streamMock = jest.fn();
jest.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    textToSpeech = { stream: streamMock };
  },
}));

// The real SDK's textToSpeech.stream resolves to a web ReadableStream<Uint8Array>,
// so the fake mimics that shape.
function fakeAudio(): ReadableStream<Uint8Array> {
  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/tts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/tts", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "sk_test_key";
    streamMock.mockReset();
  });

  it("streams mp3 audio for the given text and voice", async () => {
    streamMock.mockReturnValue(fakeAudio());
    const { POST } = await import("./route");
    const res = await POST(
      req({ text: "hi", voiceId: "exHJXWRRhHzWYCoZrSF1" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    const [voiceArg, optionsArg] = streamMock.mock.calls[0] as [
      string,
      { modelId: string },
    ];
    expect(voiceArg).toBe("exHJXWRRhHzWYCoZrSF1");
    expect(optionsArg.modelId).toBe("eleven_v3");
  });

  it("400s when text is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ voiceId: "x" }));
    expect(res.status).toBe(400);
  });
});
