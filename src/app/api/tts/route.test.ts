import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

// The SDK's textToSpeech.stream resolves to a web ReadableStream<Uint8Array>, so
// the fake is typed to resolve one — a dropped `await` in the route then shows.
const streamMock =
  jest.fn<
    (
      voiceId: string,
      options: { modelId: string; text: string; outputFormat: string },
    ) => Promise<ReadableStream<Uint8Array>>
  >();
let constructedApiKey: string | undefined;
jest.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToSpeech = { stream: streamMock };
    constructor(options: { apiKey?: string }) {
      constructedApiKey = options.apiKey;
    }
  },
}));

function fakeAudio(): ReadableStream<Uint8Array> {
  const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])];
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function req(body: unknown, accessId = 'test-key'): Request {
  return new Request('http://localhost/api/tts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-access-id': accessId },
  });
}

describe('POST /api/tts', () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'sk_test_key';
    // The gate is fail-closed: req() sends the matching x-access-id header.
    process.env.COMPANIONS_ACCESS_IDS = 'test-key';
    streamMock.mockReset();
    constructedApiKey = undefined;
  });
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.COMPANIONS_ACCESS_IDS;
  });

  it('streams mp3 audio for the given text and voice', async () => {
    streamMock.mockResolvedValue(fakeAudio());
    const { POST } = await import('./route');
    const res = await POST(
      req({ text: 'hi', voiceId: 'exHJXWRRhHzWYCoZrSF1' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    const call = streamMock.mock.calls[0];
    expect(call?.[0]).toBe('exHJXWRRhHzWYCoZrSF1');
    expect(call?.[1].modelId).toBe('eleven_v3');
  });

  it('constructs the ElevenLabsClient with ELEVENLABS_API_KEY', async () => {
    streamMock.mockResolvedValue(fakeAudio());
    const { POST } = await import('./route');
    await POST(req({ text: 'hi', voiceId: 'exHJXWRRhHzWYCoZrSF1' }));
    expect(constructedApiKey).toBe('sk_test_key');
  });

  it('400s when text is missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ voiceId: 'x' }));
    expect(res.status).toBe(400);
  });

  it('401s and never calls upstream when the access id is wrong', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      req({ text: 'hi', voiceId: 'exHJXWRRhHzWYCoZrSF1' }, 'not-a-key'),
    );
    expect(res.status).toBe(401);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('503s when ELEVENLABS_API_KEY is missing, without calling upstream', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { POST } = await import('./route');
    const res = await POST(
      req({ text: 'hi', voiceId: 'exHJXWRRhHzWYCoZrSF1' }),
    );
    expect(res.status).toBe(503);
    expect(streamMock).not.toHaveBeenCalled();
  });
});
