import { describe, it, expect } from "@jest/globals";
import { PreRollBuffer } from "./pre-roll";

const f = (n: number) => new Int16Array([n]);

describe("PreRollBuffer", () => {
  it("keeps only the most recent maxFrames", () => {
    const b = new PreRollBuffer(2);
    b.push(f(1));
    b.push(f(2));
    b.push(f(3)); // evicts f(1)
    expect(b.length).toBe(2);
    expect(b.flush().map((x) => x[0])).toEqual([2, 3]); // oldest-first
  });

  it("flush clears the buffer", () => {
    const b = new PreRollBuffer(4);
    b.push(f(1));
    expect(b.flush().map((x) => x[0])).toEqual([1]);
    expect(b.length).toBe(0);
    expect(b.flush()).toEqual([]);
  });
});
