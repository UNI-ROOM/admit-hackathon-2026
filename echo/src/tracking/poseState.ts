import { Calibration } from './calibration';
import { Hysteresis } from './smoothing';

export type Landmarks = Float32Array; // length 132

export const P = {
    NOSE: 0,
    L_SHOULDER: 11,
    R_SHOULDER: 12,
    L_ELBOW: 13,
    R_ELBOW: 14,
    L_WRIST: 15,
    R_WRIST: 16,
    L_HIP: 23,
    R_HIP: 24,
    L_KNEE: 25,
    R_KNEE: 26,
    L_ANKLE: 27,
    R_ANKLE: 28
} as const;

export interface PoseState {
    visible: boolean;
    x: number;
    lane: number;
    armUp: { left: boolean; right: boolean };
    crouch: boolean;
    shield: boolean;
    bothUp: boolean;
    raw: {
        wristAboveHead: { left: number; right: number };
        crouchDepth: number;
        wristGap: number;
        wristsCrossed: boolean;
        distToLaneCenter: number;
    };
}

const LANE_WIDTH = 0.2;
const LANE_CENTERS = [0, 0.1, 0.3, 0.5, 0.7, 0.9]; // 1-indexed for lanes 1-5

const laneOf = (x: number): number => {
    if (x < 0.2) return 1;
    if (x < 0.4) return 2;
    if (x < 0.6) return 3;
    if (x < 0.8) return 4;
    return 5;
};

export class PoseRecognizer {
    private armUpLeftHyst = new Hysteresis(false, 3);
    private armUpRightHyst = new Hysteresis(false, 3);
    private crouchHyst = new Hysteresis(false, 3);
    private shieldHyst = new Hysteresis(false, 3);

    recognize(lm: Landmarks, calib: Calibration): PoseState {
        const isVis = (idx: number) => lm[idx * 4 + 3] > 0.5;

        // visible = все из [0, 11, 12] имеют visibility > 0.5
        const visible = [P.NOSE, P.L_SHOULDER, P.R_SHOULDER].every(isVis);

        const getPt = (idx: number) => ({ x: lm[idx * 4], y: lm[idx * 4 + 1] });

        const lShoulder = getPt(P.L_SHOULDER);
        const rShoulder = getPt(P.R_SHOULDER);
        const lHip = getPt(P.L_HIP);
        const rHip = getPt(P.R_HIP);
        const nose = getPt(P.NOSE);
        const lWrist = getPt(P.L_WRIST);
        const rWrist = getPt(P.R_WRIST);

        const midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
        const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };

        const currentTorso = Math.sqrt(Math.pow(midShoulder.x - midHip.x, 2) + Math.pow(midShoulder.y - midHip.y, 2));
        const torso = Math.max(calib.torso * 0.7, currentTorso);

        const headY = nose.y - 0.35 * torso;

        // Рука вверх (y растёт вниз)
        const wristAboveHeadLeft = (headY - lWrist.y) / torso;
        const wristAboveHeadRight = (headY - rWrist.y) / torso;

        const armUpLeft = this.armUpLeftHyst.update(wristAboveHeadLeft, 0.05, -0.15);
        const armUpRight = this.armUpRightHyst.update(wristAboveHeadRight, 0.05, -0.15);

        // Присед
        let crouchDepth = 0;
        let onCrouch = 0.35;
        let offCrouch = 0.20;

        if (calib.legsVisible) {
            crouchDepth = (midHip.y - calib.standHipY) / calib.torso;
        } else {
            crouchDepth = (midShoulder.y - calib.standShoulderY) / calib.torso;
            onCrouch = 0.25;
            offCrouch = 0.15; // Adjusted off threshold for fallback
        }

        const crouch = this.crouchHyst.update(crouchDepth, onCrouch, offCrouch);

        // Щит
        // В зеркальном отображении, x растет слева направо на экране. 
        // Если левая рука на экране правее правой, значит они скрещены.
        // То есть lWrist.x > rWrist.x.
        const wristsCrossed = lWrist.x > rWrist.x;
        const inChestBand = (lWrist.y > midShoulder.y - 0.1 * torso && lWrist.y < midHip.y) &&
                            (rWrist.y > midShoulder.y - 0.1 * torso && rWrist.y < midHip.y);
        
        const wristGap = Math.sqrt(Math.pow(lWrist.x - rWrist.x, 2) + Math.pow(lWrist.y - rWrist.y, 2)) / torso;
        
        const shieldRaw = (wristsCrossed && inChestBand) ? 1 : 0;
        const shieldHystState = this.shieldHyst.update(shieldRaw, 0.5, 0.5);
        const shield = shieldHystState && wristGap < 0.9;

        const bothUp = armUpLeft && armUpRight;

        let x = midHip.x;
        if (!isVis(P.L_HIP) || !isVis(P.R_HIP)) {
            x = midShoulder.x;
        }
        const lane = Math.max(1, Math.min(5, laneOf(x)));
        const distToLaneCenter = (x - LANE_CENTERS[lane]) / LANE_WIDTH;

        return {
            visible,
            x,
            lane,
            armUp: { left: armUpLeft, right: armUpRight },
            crouch,
            shield,
            bothUp,
            raw: {
                wristAboveHead: { left: wristAboveHeadLeft, right: wristAboveHeadRight },
                crouchDepth,
                wristGap,
                wristsCrossed,
                distToLaneCenter
            }
        };
    }
}
