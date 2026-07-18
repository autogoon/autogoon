// public/companion-audio-worklet.js
// Captures mono mic audio and posts { samples, rms } frames (~20ms of raw
// input-rate audio) to the main thread, which downsamples/encodes via
// audio-encoding.ts. Mirrors kws-audio-worklet.js.
class CompanionCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    // 20ms at the input rate. sampleRate is a global in AudioWorkletGlobalScope.
    this._frameSamples = Math.round(globalThis.sampleRate * 0.02);
  }

  process(inputs) {
    // First input, first channel — getUserMedia is requested as mono.
    const ch = inputs[0]?.[0];
    if (ch != null) {
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._frameSamples) {
        const frame = Float32Array.from(
          this._buf.splice(0, this._frameSamples),
        );
        let sumSq = 0;
        for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i];
        const rms = Math.sqrt(sumSq / frame.length);
        // Transfer the buffer so no copy is made on the way to the main thread.
        this.port.postMessage({ samples: frame, rms }, [frame.buffer]);
      }
    }
    // Keep the processor alive; we never write to outputs, so its output is
    // silence, which keeps the graph pulling this node.
    return true;
  }
}

registerProcessor("companion-capture", CompanionCapture);
