export class StateStabilizer {
    framesRequired: number;
    currentStableValue: any;
    candidateValue: any;
    consecutiveCount: number;

    constructor(framesRequired: number, initialValue: any = null) {
        this.framesRequired = framesRequired;
        this.currentStableValue = initialValue;
        this.candidateValue = initialValue;
        this.consecutiveCount = 0;
    }
    update(newValue: any) {
        if (newValue === this.candidateValue) {
            this.consecutiveCount++;
            if (this.consecutiveCount >= this.framesRequired) {
                this.currentStableValue = this.candidateValue;
            }
        } else {
            this.candidateValue = newValue;
            this.consecutiveCount = 1;
        }
        return this.currentStableValue;
    }
}

export function isFist(landmarks: any[]) {
    const tips = [8, 12, 16, 20];
    const joints = [6, 10, 14, 18];
    for (let i = 0; i < 4; i++) {
        if (landmarks[tips[i]].y <= landmarks[joints[i]].y) return false;
    }
    return true;
}

export function isOpenPalm(landmarks: any[]) {
    const tips = [8, 12, 16, 20];
    const joints = [6, 10, 14, 18];
    let straight = 0;
    for(let i = 0; i < 4; i++) {
        if (landmarks[tips[i]].y < landmarks[joints[i]].y) straight++;
    }
    return straight === 4 && landmarks[0].y < 0.8;
}

export function isPinching(landmarks: any[]) {
    const thumb = landmarks[4];
    const index = landmarks[8];
    return Math.sqrt(Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2)) < 0.08;
}

// UI click: thumb tip touching the middle fingertip. Measured relative to hand
// size (wrist → middle knuckle) so it works at any distance from the camera.
// Hysteresis keeps one touch from flickering into several clicks.
export const THUMB_MIDDLE_ON = 0.3;
export const THUMB_MIDDLE_OFF = 0.45;
export function thumbMiddleRatio(landmarks: any[]) {
    const d = (a: number, b: number) => Math.hypot(landmarks[a].x - landmarks[b].x, landmarks[a].y - landmarks[b].y);
    return d(4, 12) / Math.max(d(0, 9), 1e-6);
}
export function isThumbMiddleTouch(landmarks: any[], wasTouching = false) {
    if (!landmarks || landmarks.length < 21) return false;
    const ratio = thumbMiddleRatio(landmarks);
    // An index pinch brings the thumb closer to the index tip; don't count it.
    const nearerIndex = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y)
        < Math.hypot(landmarks[4].x - landmarks[12].x, landmarks[4].y - landmarks[12].y);
    if (nearerIndex) return false;
    return ratio < (wasTouching ? THUMB_MIDDLE_OFF : THUMB_MIDDLE_ON);
}

// 4th gesture: index finger pointing ( указательный палец )
// Index finger extended above its PIP joint, middle/ring/pinky curled below theirs.
export function isPointing(landmarks: any[]) {
    if (!landmarks || landmarks.length < 21) return false;
    const indexExtended = landmarks[8].y < landmarks[6].y;
    const curled: [number, number][] = [[12, 10], [16, 14], [20, 18]];
    for (const [tip, joint] of curled) {
        if (landmarks[tip].y <= landmarks[joint].y) return false;
    }
    return indexExtended;
}

export function drawUnmirroredText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string) {
    ctx.save();
    ctx.translate(x, y);
    // Counter-flip only while the canvas itself is CSS-mirrored, so labels stay readable either way.
    if (ctx.canvas?.classList?.contains?.('mirrored') ?? true) ctx.scale(-1, 1);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}
