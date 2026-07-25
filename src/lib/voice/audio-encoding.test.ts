import { describe, it, expect } from '@jest/globals';
import {
  downsampleTo16k,
  floatTo16BitPcm,
  pcm16ToBase64,
} from './audio-encoding';

describe('audio-encoding', () => {
  it('returns input unchanged when already 16k', () => {
    const buf = new Float32Array([0, 0.5, -0.5]);
    expect(downsampleTo16k(buf, 16000)).toBe(buf);
  });

  it('halves the sample count from 32k to 16k', () => {
    const buf = new Float32Array(320); // 10ms @ 32k
    const out = downsampleTo16k(buf, 32000);
    expect(out.length).toBe(160); // 10ms @ 16k
  });

  it('downsamples 48k → 16k at a 1/3 ratio', () => {
    const out = downsampleTo16k(new Float32Array(480), 48000);
    expect(out.length).toBe(160);
  });

  it('clamps and scales floats to int16', () => {
    const out = floatTo16BitPcm(new Float32Array([0, 1, -1, 2, -2]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
    expect(out[3]).toBe(32767); // clamped
    expect(out[4]).toBe(-32768); // clamped
  });

  it('base64-encodes little-endian pcm16', () => {
    // 0x0100 little-endian = bytes [0x00, 0x01]
    expect(pcm16ToBase64(new Int16Array([256]))).toBe(
      Buffer.from([0, 1]).toString('base64'),
    );
  });
});
