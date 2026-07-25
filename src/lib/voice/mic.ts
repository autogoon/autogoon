// Browser mic pipeline for Companions: open getUserMedia with AEC, load the
// capture worklet, and on each frame do the DSP on the main thread (via the
// single tested path in audio-encoding.ts), feed VAD + pre-roll, and emit
// events. Integration code — no unit test (needs a real mic + worklet);
// verified in the Task 13 acceptance run.
import {
  downsampleTo16k,
  floatTo16BitPcm,
  pcm16ToBase64,
} from './audio-encoding';
import { PreRollBuffer } from './pre-roll';
import { initVadState, vadStep, type VadConfig } from './vad';

export type MicEvents = {
  onFrame: (base64Pcm: string) => void; // 16k pcm frame, base64
  onRms: (rms: number) => void;
  onOnset: () => void;
  onOffset: () => void;
};

export type MicHandle = {
  preRoll: PreRollBuffer;
  stop: () => void;
};

// Empirically tuned on the hardware; the fields are commented on VadConfig.
const VAD_CONFIG: VadConfig = {
  onRms: 0.05,
  offRms: 0.02,
  attackFrames: 3,
  hangoverFrames: 5,
};

// One capture frame's worth of audio. Set by the worklet, which buffers
// `sampleRate * 0.02` samples before posting each frame (see
// public/companion-audio-worklet.js) — change it there and this must follow.
// Exported because anything counting frames to get a duration — how much audio
// a session actually streamed, say — needs it, and a wrong constant there is a
// silently wrong number.
export const FRAME_MS = 20;

// How long after you actually stop the VAD waits before declaring an offset.
// Anyone timing a run of voicing from the onset and offset events has to
// subtract this, or every run measures a tenth of a second longer than it was.
export const VAD_HANGOVER_MS = VAD_CONFIG.hangoverFrames * FRAME_MS;

// ~500 ms of pre-roll, so barge-in can flush the opening word.
const PRE_ROLL_FRAMES = Math.ceil(500 / FRAME_MS); // 25

type CaptureMessage = { samples: Float32Array; rms: number };

export async function startMic(events: MicEvents): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // getUserMedia has resolved, so the stream is live; if any of the setup below
  // throws (addModule rejecting, createMediaStreamSource, …) we must stop the
  // stream and close the context we opened, or the mic indicator stays lit.
  let audioContext: AudioContext | undefined;
  try {
    audioContext = new AudioContext();
    // Created outside a user gesture, the context can come up suspended; resume
    // it so audio actually flows.
    void audioContext.resume();

    await audioContext.audioWorklet.addModule('/companion-audio-worklet.js');
    const source = audioContext.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(audioContext, 'companion-capture');

    const preRoll = new PreRollBuffer(PRE_ROLL_FRAMES);
    let vad = initVadState();
    const ctx = audioContext;

    capture.port.onmessage = (e: MessageEvent<CaptureMessage>) => {
      const { samples, rms } = e.data;
      const pcm16 = floatTo16BitPcm(downsampleTo16k(samples, ctx.sampleRate));
      preRoll.push(pcm16);
      events.onRms(rms);
      const step = vadStep(vad, rms, VAD_CONFIG);
      vad = step.state;
      if (step.onset) events.onOnset();
      if (step.offset) events.onOffset();
      events.onFrame(pcm16ToBase64(pcm16));
    };

    source.connect(capture);
    // The worklet emits silence, but it must reach the destination to keep the
    // graph pulling this node.
    capture.connect(ctx.destination);

    const stop = () => {
      capture.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    };

    return { preRoll, stop };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    void audioContext?.close();
    throw err;
  }
}
