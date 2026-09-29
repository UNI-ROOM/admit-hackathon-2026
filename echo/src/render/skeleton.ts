import { P } from '../tracking/poseState';

export function drawSkeleton(ctx: CanvasRenderingContext2D, lm: Float32Array, alpha: number, color: string) {
    const width = 1000;
    const height = 600;

    const getPt = (idx: number) => ({
        x: lm[idx * 4] * width,
        y: lm[idx * 4 + 1] * height,
        vis: lm[idx * 4 + 3]
    });

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLine = (p1: number, p2: number) => {
        const pt1 = getPt(p1);
        const pt2 = getPt(p2);
        if (pt1.vis > 0.5 && pt2.vis > 0.5) {
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
        }
    };

    // Shoulders - elbows - wrists
    drawLine(P.L_SHOULDER, P.L_ELBOW);
    drawLine(P.L_ELBOW, P.L_WRIST);
    drawLine(P.R_SHOULDER, P.R_ELBOW);
    drawLine(P.R_ELBOW, P.R_WRIST);

    // Shoulders - hips
    drawLine(P.L_SHOULDER, P.R_SHOULDER);
    drawLine(P.L_SHOULDER, P.L_HIP);
    drawLine(P.R_SHOULDER, P.R_HIP);

    // Hips - knees - ankles
    drawLine(P.L_HIP, P.R_HIP);
    drawLine(P.L_HIP, P.L_KNEE);
    drawLine(P.L_KNEE, P.L_ANKLE);
    drawLine(P.R_HIP, P.R_KNEE);
    drawLine(P.R_KNEE, P.R_ANKLE);

    // Draw head
    const nose = getPt(P.NOSE);
    const lShoulder = getPt(P.L_SHOULDER);
    const rShoulder = getPt(P.R_SHOULDER);
    const lHip = getPt(P.L_HIP);
    const rHip = getPt(P.R_HIP);
    
    if (nose.vis > 0.5 && lShoulder.vis > 0.5 && rShoulder.vis > 0.5 && lHip.vis > 0.5 && rHip.vis > 0.5) {
        const midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
        
        const torso = Math.sqrt(Math.pow(midShoulder.x - midHip.x, 2) + Math.pow(midShoulder.y - midHip.y, 2));
        
        const headRadius = torso * 0.2;
        const headCenterY = nose.y - 0.15 * torso;

        ctx.beginPath();
        ctx.arc(nose.x, headCenterY, headRadius, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (nose.vis > 0.5) {
        ctx.beginPath();
        ctx.arc(nose.x, nose.y, 20, 0, 2 * Math.PI);
        ctx.stroke();
    }

    ctx.restore();
}
