import { Recording, Landmarks } from './recorder';

export function sample(rec: Recording, t: number): Landmarks {
  const frames = rec.frames;

  if (frames.length === 0) {
    // Return empty array if recording has no frames
    return new Float32Array(132);
  }

  if (t <= frames[0].t) {
    return frames[0].lm;
  }

  if (t >= rec.duration || t >= frames[frames.length - 1].t) {
    // Echo freezes at the last frame
    return frames[frames.length - 1].lm;
  }

  // Binary search to find i such that frames[i].t <= t < frames[i+1].t
  let left = 0;
  let right = frames.length - 1;
  let i = 0;

  while (left <= right) {
    const mid = (left + right) >> 1;
    if (frames[mid].t <= t) {
      i = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const frameA = frames[i];
  const frameB = frames[i + 1];

  if (!frameB) {
    return frameA.lm;
  }

  if (frameA.lost) {
    // If tracking was lost, return last known frame without interpolation
    return frameA.lm;
  }

  // Linear interpolation (lerp) on all 132 numbers
  const dt = frameB.t - frameA.t;
  const progress = dt > 0 ? (t - frameA.t) / dt : 0;

  const result = new Float32Array(132);
  const lmA = frameA.lm;
  const lmB = frameB.lm;

  for (let j = 0; j < 132; j++) {
    result[j] = lmA[j] + (lmB[j] - lmA[j]) * progress;
  }

  return result;
}
