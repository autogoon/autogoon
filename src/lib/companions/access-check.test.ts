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

  it("denies everything when no ids are configured (fail closed)", () => {
    delete process.env.COMPANIONS_ACCESS_IDS;
    expect(checkAccess(req())).toBe(false);
    expect(checkAccess(req("anything"))).toBe(false);
    process.env.COMPANIONS_ACCESS_IDS = "   ";
    expect(checkAccess(req("anything"))).toBe(false);
  });

  it("accepts a header matching any configured id", () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a,bob-9c21";
    expect(checkAccess(req("alice-7f3a"))).toBe(true);
    expect(checkAccess(req("bob-9c21"))).toBe(true);
  });

  it("rejects a missing or wrong header", () => {
    process.env.COMPANIONS_ACCESS_IDS = "alice-7f3a,bob-9c21";
    expect(checkAccess(req())).toBe(false);
    expect(checkAccess(req(""))).toBe(false);
    expect(checkAccess(req("nope"))).toBe(false);
  });
});
