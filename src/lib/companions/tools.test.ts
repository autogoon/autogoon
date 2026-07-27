import { describe, it, expect } from '@jest/globals';
import { toRequestTools, type CompanionTool } from './tools';

describe('toRequestTools', () => {
  it('gives a tool with no parameters an empty-object schema', () => {
    const tools: CompanionTool[] = [
      { name: 'start', description: 'Start the device.', run: () => '' },
      { name: 'stop', description: 'Stop the device.', run: () => '' },
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

  it('forwards a declared parameter schema unchanged', () => {
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
        run: () => '',
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
