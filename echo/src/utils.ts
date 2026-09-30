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
    if (!landmarks || landmarks.length < 21) return false;
    const toWrist = (i: number) => Math.hypot(landmarks[i].x - landmarks[0].x, landmarks[i].y - landmarks[0].y);
    const tips = [8, 12, 16, 20];
    const joints = [6, 10, 14, 18];
    for (let i = 0; i < 4; i++) {
        if (toWrist(tips[i]) >= toWrist(joints[i])) return false;
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

export function isPinching(landmarks: any[] | null, wasPinching = false) {
    if (!landmarks || landmarks.length < 21) return false;
    const distance = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
    const palm = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    const threshold = palm > 0.01
        ? Math.min(wasPinching ? 0.12 : 0.08, palm * (wasPinching ? 0.7 : 0.45))
        : wasPinching ? 0.11 : 0.08;
    return distance < threshold;
}

export const THUMB_MIDDLE_ON = 0.3;
export const THUMB_MIDDLE_OFF = 0.45;
export function thumbMiddleRatio(landmarks: any[]) {
    const d = (a: number, b: number) => Math.hypot(landmarks[a].x - landmarks[b].x, landmarks[a].y - landmarks[b].y);
    return d(4, 12) / Math.max(d(0, 9), 1e-6);
}
export function isThumbMiddleTouch(landmarks: any[], wasTouching = false) {
    if (!landmarks || landmarks.length < 21) return false;
    const ratio = thumbMiddleRatio(landmarks);
    const nearerIndex = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y)
        < Math.hypot(landmarks[4].x - landmarks[12].x, landmarks[4].y - landmarks[12].y);
    if (nearerIndex) return false;
    return ratio < (wasTouching ? THUMB_MIDDLE_OFF : THUMB_MIDDLE_ON);
}

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
    if (ctx.canvas?.classList?.contains?.('mirrored') ?? true) ctx.scale(-1, 1);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}
