import { describe, it, expect } from '@jest/globals';
import {
  downsampleTo16k,
  floatTo16BitPcm,
  pcm16ToBase64,
} from './audio-encoding';

describe('audio-encoding', () => {
  it('downsampleTo16k returns the input unchanged when already 16k', () => {
    const buf = new Float32Array([0, 0.5, -0.5]);
    expect(downsampleTo16k(buf, 16000)).toBe(buf);
  });

  it('downsampleTo16k rejects a rate it would have to upsample', () => {
    expect(() => downsampleTo16k(new Float32Array(80), 8000)).toThrow(
      'inputRate 8000 below 16000',
    );
  });

  it('downsampleTo16k averages 2-sample windows from 32k to 16k', () => {
    const out = downsampleTo16k(new Float32Array([0, 1, 0.25, 0.75]), 32000);
    expect(Array.from(out)).toEqual([0.5, 0.5]);
  });

  it('downsampleTo16k averages 3-sample windows from 48k to 16k', () => {
    const out = downsampleTo16k(
      new Float32Array([0, 0.5, 1, 0, 0.25, 0.5]),
      48000,
    );
    expect(Array.from(out)).toEqual([0.5, 0.25]);
  });

  // 882 samples is one 20ms frame at 44.1k, the rate whose 2.75625 ratio makes
  // the averaging windows alternate between 2 and 3 samples wide.
  it('downsampleTo16k averages uneven windows from 44.1k to 16k', () => {
    const out = downsampleTo16k(new Float32Array(882).fill(1), 44100);
    expect(Array.from(out)).toEqual(new Array(320).fill(1));
  });

  it('floatTo16BitPcm maps ±1.0 to the full int16 range', () => {
    const out = floatTo16BitPcm(new Float32Array([0, 1, -1]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
  });

  it('floatTo16BitPcm clamps floats outside ±1.0 to the int16 limits', () => {
    const out = floatTo16BitPcm(new Float32Array([2, -2]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
  });

  // 0x0100 little-endian = bytes [0x00, 0x01]. Nothing writes that order: the
  // source reinterprets the Int16Array's own buffer, so the byte order is the
  // host's, and this asserts the host agrees with the little-endian wire format
  // the socket asks for (`audio_format=pcm_16000`, in the realtime STT socket
  // URL stt.ts builds).
  it('pcm16ToBase64 encodes the samples little-endian', () => {
    expect(pcm16ToBase64(new Int16Array([256]))).toBe(
      Buffer.from([0, 1]).toString('base64'),
    );
  });
});
