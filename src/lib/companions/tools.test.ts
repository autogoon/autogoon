import { describe, it, expect } from '@jest/globals';
import { toRequestTools, type CompanionTool } from './tools';

describe('toRequestTools', () => {
  it('maps CompanionTools to the OpenAI function-tool request shape', () => {
    const tools: CompanionTool[] = [
      { name: 'start', description: 'Start the device.', run: () => 'started' },
      { name: 'stop', description: 'Stop the device.', run: () => 'stopped' },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: 'function',
        function: {
          name: 'start',
          description: 'Start the device.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'stop',
          description: 'Stop the device.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  it('passes a string-enum parameter schema through unchanged (variety)', () => {
    const tools: CompanionTool[] = [
      {
        name: 'variety',
        description: 'Set variety.',
        parameters: {
          type: 'object',
          properties: {
            level: {
              type: 'string',
              enum: ['off', 'low', 'medium', 'high'],
              description: 'off = steady drive',
            },
          },
          required: ['level'],
        },
        run: (args) => `variety → ${String(args.level)}`,
      },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: 'function',
        function: {
          name: 'variety',
          description: 'Set variety.',
          parameters: {
            type: 'object',
            properties: {
              level: {
                type: 'string',
                enum: ['off', 'low', 'medium', 'high'],
                description: 'off = steady drive',
              },
            },
            required: ['level'],
          },
        },
      },
    ]);
  });

  it('passes a bounded-integer parameter schema through unchanged (intensity)', () => {
    const tools: CompanionTool[] = [
      {
        name: 'intensity',
        description: 'Set intensity.',
        parameters: {
          type: 'object',
          properties: {
            percent: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: '0 = off, 100 = hardest',
            },
          },
          required: ['percent'],
        },
        run: (args) => `intensity → ${String(args.percent)}`,
      },
    ];
    expect(toRequestTools(tools)).toEqual([
      {
        type: 'function',
        function: {
          name: 'intensity',
          description: 'Set intensity.',
          parameters: {
            type: 'object',
            properties: {
              percent: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                description: '0 = off, 100 = hardest',
              },
            },
            required: ['percent'],
          },
        },
      },
    ]);
  });

  it('returns [] for no tools', () => {
    expect(toRequestTools([])).toEqual([]);
  });
});
