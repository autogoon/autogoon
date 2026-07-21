import { describe, it, expect } from "@jest/globals";
import {
  appendUser,
  appendAssistant,
  toLlmMessages,
  serialize,
  parse,
  type Thread,
} from "./conversation";

describe("conversation thread builders", () => {
  it("appendUser returns a new thread and does not mutate the input", () => {
    const before: Thread = [];
    const after = appendUser(before, "hello");
    expect(before).toEqual([]);
    expect(after).toEqual([{ role: "user", content: "hello" }]);
  });

  it("appendAssistant stores reasoningDetails only when provided", () => {
    const withReasoning = appendAssistant([], "hi", [{ index: 0, text: "t" }]);
    expect(withReasoning).toEqual([
      {
        role: "assistant",
        content: "hi",
        reasoningDetails: [{ index: 0, text: "t" }],
      },
    ]);
    const without = appendAssistant([], "hi");
    expect(without).toEqual([{ role: "assistant", content: "hi" }]);
    expect("reasoningDetails" in without[0]!).toBe(false);
  });
});

describe("toLlmMessages", () => {
  const thread: Thread = [
    { role: "user", content: "hey" },
    {
      role: "assistant",
      content: "hi",
      reasoningDetails: [{ index: 0, text: "r" }],
    },
    { role: "user", content: "again" },
  ];

  it("puts the system message first, then every turn in order", () => {
    const msgs = toLlmMessages(thread, "SYS", false);
    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("emits reasoning_details on assistant turns only when passesReasoning", () => {
    const on = toLlmMessages(thread, "SYS", true);
    expect(on[2]).toEqual({
      role: "assistant",
      content: "hi",
      reasoningDetails: [{ index: 0, text: "r" }],
    });
    const off = toLlmMessages(thread, "SYS", false);
    expect(off[2]!).toEqual({ role: "assistant", content: "hi" });
    expect("reasoningDetails" in off[2]!).toBe(false);
  });

  it("never emits reasoningDetails for assistant turns that carry none", () => {
    const t: Thread = [{ role: "assistant", content: "hi" }];
    expect(toLlmMessages(t, "SYS", true)[1]!).toEqual({
      role: "assistant",
      content: "hi",
    });
  });
});

describe("serialize / parse", () => {
  it("round-trips a thread", () => {
    const thread: Thread = [
      { role: "user", content: "a" },
      {
        role: "assistant",
        content: "b",
        reasoningDetails: [{ index: 0, text: "x" }],
      },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it("returns [] for null, malformed, non-array, and partial/legacy shapes", () => {
    expect(parse(null)).toEqual([]);
    expect(parse("not json")).toEqual([]);
    expect(parse("{}")).toEqual([]);
    expect(parse('{"role":"user"}')).toEqual([]);
    expect(parse('[{"role":"user"}]')).toEqual([]); // missing content
    expect(parse('[{"role":"bot","content":"x"}]')).toEqual([]); // bad role
    expect(
      parse('[{"role":"assistant","content":"x","reasoningDetails":"nope"}]'),
    ).toEqual([]); // reasoning not an array
  });
});
