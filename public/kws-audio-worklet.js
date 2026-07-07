// Audio capture worklet for keyword spotting. Runs on the audio thread,
// accumulates the incoming mono signal into ~4096-sample chunks, and ships
// each chunk to the main thread where vosk's recognizer consumes it. This
// replaces the deprecated ScriptProcessorNode path.

const CHUNK = 4096;

class KwsCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK);
    this.offset = 0;
  }

  process(inputs) {
    // First input, first channel — getUserMedia is requested as mono.
    const channel = inputs[0]?.[0];
    if (channel != null) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.offset++] = channel[i];
        if (this.offset === CHUNK) {
          // Transfer ownership so no copy is made, then start a fresh buffer.
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(CHUNK);
          this.offset = 0;
        }
      }
    }
    // Keep the processor alive; we never write to outputs, so its output is
    // silence.
    return true;
  }
}

registerProcessor("kws-capture", KwsCaptureProcessor);
