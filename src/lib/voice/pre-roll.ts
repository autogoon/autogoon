// A fixed-capacity ring of recent PCM frames, always recording so barge-in can
// flush the user's opening word into a freshly-opened STT socket.
export class PreRollBuffer {
  private frames: Int16Array[] = [];
  constructor(private readonly maxFrames: number) {}

  push(frame: Int16Array): void {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) this.frames.shift();
  }

  flush(): Int16Array[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }

  get length(): number {
    return this.frames.length;
  }
}
