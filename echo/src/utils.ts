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
    ctx.scale(-1, 1);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();
}
