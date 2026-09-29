export type Landmarks = Float32Array;

export interface Frame {
  t: number;
  lm: Landmarks;
  lost?: boolean;
}

export interface Recording {
  frames: Frame[];
  duration: number;
  echoIndex: number;
}

export class Recorder {
  private frames: Frame[] = [];
  private lastT: number = -Infinity;
  private lastKnownLm: Landmarks | null = null;

  constructor(public echoIndex: number) {}

  push(t: number, lm: Landmarks | null): void {
    if (t - this.lastT < 0.05) {
      return; // Limit to ≈20 fps
    }

    if (lm !== null) {
      // Copy the Float32Array so it is not mutated by the tracker in subsequent frames
      const lmCopy = new Float32Array(lm);
      this.frames.push({ t, lm: lmCopy });
      this.lastKnownLm = lmCopy;
      this.lastT = t;
    } else if (this.lastKnownLm !== null) {
      // Tracking lost, fallback to the last known frame
      this.frames.push({ t, lm: this.lastKnownLm, lost: true });
      this.lastT = t;
    }
  }

  getRecording(duration: number): Recording {
    return {
      frames: this.frames,
      duration,
      echoIndex: this.echoIndex,
    };
  }
}
