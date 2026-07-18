import { describe, it, expect, beforeEach, jest } from "@jest/globals";

describe("POST /api/stt-token", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "sk_test_key";
  });

  it("returns a token from the upstream single-use-token endpoint", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(JSON.stringify({ token: "sutkn_abc" }), { status: 200 }),
    );
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "sutkn_abc" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/v1/single-use-token/realtime_scribe");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(
      "sk_test_key",
    );
  });

  it("503s when the key is missing without calling upstream", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
