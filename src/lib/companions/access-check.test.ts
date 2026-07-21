import { describe, it, expect, afterEach } from "@jest/globals";
import { checkAccess } from "./access-check";
import { ACCESS_HEADER } from "./access";

const req = (id?: string): Request =>
  new Request("http://localhost/api/companions/access", {
    headers: id === undefined ? {} : { [ACCESS_HEADER]: id },
  });

describe("checkAccess", () => {
  afterEach(() => {
    delete process.env.COMPANIONS_ACCESS_IDS;
  });

  it("is ungated (ok, gated:false) when no ids are configured", () => {
    delete process.env.COMPANIONS_ACCESS_IDS;
    expect(checkAccess(req())).toEqual({ gated: false, ok: true });
    process.env.COMPANIONS_ACCESS_IDS = "   ";
    expect(checkAccess(req())).toEqual({ gated: false, ok: true });
  });

  it("accepts a header matching any configured id", () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a,bob-9c21";
    expect(checkAccess(req("alice-7f3a"))).toEqual({ gated: true, ok: true });
    expect(checkAccess(req("bob-9c21"))).toEqual({ gated: true, ok: true });
  });

  it("rejects a missing or wrong header when gated", () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a,bob-9c21";
    expect(checkAccess(req())).toEqual({ gated: true, ok: false });
    expect(checkAccess(req(""))).toEqual({ gated: true, ok: false });
    expect(checkAccess(req("nope"))).toEqual({ gated: true, ok: false });
  });
});
