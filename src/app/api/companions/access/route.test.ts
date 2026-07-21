import { describe, it, expect, afterEach } from "@jest/globals";
import { POST } from "./route";
import { ACCESS_HEADER } from "@/lib/companions/access";

const req = (id?: string): Request =>
  new Request("http://localhost/api/companions/access", {
    method: "POST",
    headers: id === undefined ? {} : { [ACCESS_HEADER]: id },
  });

describe("POST /api/companions/access", () => {
  afterEach(() => {
    delete process.env.COMPANIONS_ACCESS_IDS;
  });

  it("200s and reports gate off when no ids are configured", async () => {
    delete process.env.COMPANIONS_ACCESS_IDS;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gated: false, ok: true });
  });

  it("200s for a matching id", async () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a,bob-9c21";
    const res = await POST(req("bob-9c21"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ gated: true, ok: true });
  });

  it("401s for a missing or wrong id", async () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a";
    expect((await POST(req())).status).toBe(401);
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ gated: true, ok: false });
  });
});
