import { describe, it, expect } from "@jest/globals";
import {
  appendUser,
  appendAssistant,
  appendTool,
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

  it("appendUser/appendAssistant do not mutate a non-empty thread", () => {
    const base: Thread = [{ role: "user", content: "first" }];
    const snapshot: Thread = JSON.parse(JSON.stringify(base)) as Thread;
    const afterUser = appendUser(base, "second");
    expect(base).toEqual(snapshot);
    expect(afterUser).toEqual([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
    ]);
    const afterAsst = appendAssistant(base, "reply");
    expect(base).toEqual(snapshot);
    expect(afterAsst[afterAsst.length - 1]!).toEqual({
      role: "assistant",
      content: "reply",
    });
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

describe("tool turns", () => {
  it("appendTool appends a linked tool turn without mutating the input", () => {
    const base: Thread = [{ role: "user", content: "start it" }];
    const after = appendTool(base, "start", "started", "call_1");
    expect(base).toEqual([{ role: "user", content: "start it" }]);
    expect(after[after.length - 1]!).toEqual({
      role: "tool",
      name: "start",
      result: "started",
      toolCallId: "call_1",
    });
  });

  it("appendAssistant carries toolCalls only when provided", () => {
    const calls = [{ id: "call_1", name: "start", arguments: "{}" }];
    const withCalls = appendAssistant([], "", undefined, calls);
    expect(withCalls).toEqual([
      { role: "assistant", content: "", toolCalls: calls },
    ]);
    const without = appendAssistant([], "hi");
    expect("toolCalls" in without[0]!).toBe(false);
  });

  it("toLlmMessages replays the agentic sequence (assistant call → tool result)", () => {
    const calls = [{ id: "call_1", name: "start", arguments: "{}" }];
    const thread: Thread = [
      { role: "user", content: "start it" },
      { role: "assistant", content: "", toolCalls: calls },
      { role: "tool", name: "start", result: "started", toolCallId: "call_1" },
      { role: "assistant", content: "it's on" },
    ];
    const msgs = toLlmMessages(thread, "SYS", true);
    expect(msgs).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "start it" },
      { role: "assistant", content: "", toolCalls: calls },
      { role: "tool", content: "started", toolCallId: "call_1" },
      { role: "assistant", content: "it's on" },
    ]);
  });

  it("serialize/parse round-trips the agentic sequence", () => {
    const calls = [{ id: "call_1", name: "start", arguments: "{}" }];
    const thread: Thread = [
      { role: "user", content: "start it" },
      { role: "assistant", content: "", toolCalls: calls },
      { role: "tool", name: "start", result: "started", toolCallId: "call_1" },
    ];
    expect(parse(serialize(thread))).toEqual(thread);
  });

  it("parse rejects a tool turn missing name, result, or toolCallId", () => {
    expect(
      parse('[{"role":"tool","name":"start","result":"started"}]'),
    ).toEqual([]); // no toolCallId (legacy, pre-agentic) → discard
    expect(parse('[{"role":"tool","name":"start","toolCallId":"c1"}]')).toEqual(
      [],
    );
    expect(
      parse('[{"role":"tool","result":"started","toolCallId":"c1"}]'),
    ).toEqual([]);
  });

  it("parse rejects an assistant turn whose toolCalls is not an array", () => {
    expect(
      parse('[{"role":"assistant","content":"","toolCalls":"nope"}]'),
    ).toEqual([]);
  });
});
