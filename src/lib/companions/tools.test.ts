import { describe, it, expect } from "@jest/globals";
import { toRequestTools, type CompanionTool } from "./tools";

describe("toRequestTools", () => {
  it("maps CompanionTools to the OpenAI function-tool request shape", () => {
    const tools: CompanionTool[] = [
      { name: "start", description: "Start the device.", run: () => "started" },
      { name: "stop", description: "Stop the device.", run: () => "stopped" },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: "function",
        function: {
          name: "start",
          description: "Start the device.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "stop",
          description: "Stop the device.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("passes a declared parameter schema through unchanged", () => {
    const tools: CompanionTool[] = [
      {
        name: "intensity",
        description: "Set intensity.",
        parameters: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["warmup", "low", "medium", "high"],
              description: "warmup = gentlest",
            },
          },
          required: ["level"],
        },
        run: (args) => `intensity → ${String(args.level)}`,
      },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: "function",
        function: {
          name: "intensity",
          description: "Set intensity.",
          parameters: {
            type: "object",
            properties: {
              level: {
                type: "string",
                enum: ["warmup", "low", "medium", "high"],
                description: "warmup = gentlest",
              },
            },
            required: ["level"],
          },
        },
      },
    ]);
  });

  it("returns [] for no tools", () => {
    expect(toRequestTools([])).toEqual([]);
  });
});
