import { P } from './poseState';

export interface Calibration {
    standHipY: number;
    torso: number;
    legsVisible: boolean;
    standShoulderY: number;
}

/**
 * Calibrates the pose from an initial set of landmarks.
 * @param lm Landmarks as a flat Float32Array (33 * 4)
 * @returns Calibration object or null if not enough points are visible
 */
export function calibrate(lm: Float32Array): Calibration | null {
    const isVis = (idx: number) => lm[idx * 4 + 3] > 0.5;

    // We need at least shoulders
    if (!isVis(P.L_SHOULDER) || !isVis(P.R_SHOULDER)) {
        return null;
    }

    const lShoulderX = lm[P.L_SHOULDER * 4 + 0];
    const rShoulderX = lm[P.R_SHOULDER * 4 + 0];
    const lShoulderY = lm[P.L_SHOULDER * 4 + 1];
    const rShoulderY = lm[P.R_SHOULDER * 4 + 1];

    const midShoulderX = (lShoulderX + rShoulderX) / 2;
    const midShoulderY = (lShoulderY + rShoulderY) / 2;

    let midHipY = midShoulderY + 0.3; // fallback if hips not visible
    let torso = Math.abs(lShoulderX - rShoulderX) * 1.5; // fallback estimate based on shoulder width

    const hipsVis = isVis(P.L_HIP) && isVis(P.R_HIP);
    if (hipsVis) {
        const lHipY = lm[P.L_HIP * 4 + 1];
        const rHipY = lm[P.R_HIP * 4 + 1];
        const lHipX = lm[P.L_HIP * 4 + 0];
        const rHipX = lm[P.R_HIP * 4 + 0];
        
        midHipY = (lHipY + rHipY) / 2;
        const midHipX = (lHipX + rHipX) / 2;
        
        const dx = midShoulderX - midHipX;
        const dy = midShoulderY - midHipY;
        torso = Math.sqrt(dx * dx + dy * dy);
    }

    const legsVisible = isVis(P.L_KNEE) || isVis(P.R_KNEE) || isVis(P.L_ANKLE) || isVis(P.R_ANKLE);

    return {
        standHipY: midHipY,
        torso,
        legsVisible,
        standShoulderY: midShoulderY
    };
}
