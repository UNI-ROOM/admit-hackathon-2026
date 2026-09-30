import { isPinching } from './utils';

export interface HandPoint { x: number; y: number; z?: number }
export type HandLandmarks = HandPoint[];
export interface HandResults {
    multiHandLandmarks?: HandLandmarks[];
    multiHandedness?: { label: string; score: number }[];
}

export function playableHands(hands: [HandLandmarks | null, HandLandmarks | null], difficulty: import('../../shared/score').Difficulty): typeof hands {
    return difficulty === 'easy' ? [hands[0] || hands[1], null] : hands;
}

export function snapshotHands(hands: [HandLandmarks | null, HandLandmarks | null]) {
    return { hands: hands.map(hand => hand ? hand.map(point => ({ ...point })) : null) as typeof hands };
}

export function recordedHands(frame: import('./types').EchoFrame): [HandLandmarks | null, HandLandmarks | null] {
    if (!frame) return [null, null];
    // Accept original one-hand frames as well as new two-hand recordings.
    return Array.isArray(frame) ? [frame, null] : frame.hands;
}

// Detection order can change between frames. Keep two persistent identities
// using handedness, with wrist distance as a fallback when labels are uncertain.
export class LiveHandTracker {
    private slots: ({ hand: HandLandmarks; label?: string } | null)[] = [null, null];

    update(results: HandResults): [HandLandmarks | null, HandLandmarks | null] {
        const detections = (results.multiHandLandmarks || []).slice(0, 2).map((hand, index) => {
            const handedness = results.multiHandedness?.[index];
            return { hand, label: handedness && handedness.score >= 0.75 ? handedness.label : undefined };
        });
        const output: [HandLandmarks | null, HandLandmarks | null] = [null, null];
        if (!detections.length) return output;
        const cost = (detection: typeof detections[number], slot: number) => {
            const previous = this.slots[slot];
            if (!previous) return 1;
            const distance = Math.hypot(previous.hand[0].x - detection.hand[0].x,
                previous.hand[0].y - detection.hand[0].y);
            if (previous.label && detection.label) {
                return (previous.label === detection.label ? 0 : 10) + distance;
            }
            return distance;
        };
        const assignments = detections.length === 2 ? [[0, 1], [1, 0]] : [[0], [1]];
        const assignment = assignments.reduce((best, candidate) => {
            const score = (slots: number[]) => slots.reduce((sum, slot, index) => sum + cost(detections[index], slot), 0);
            return score(candidate) < score(best) ? candidate : best;
        });
        assignment.forEach((slot, index) => {
            const detection = detections[index];
            output[slot] = detection.hand;
            this.slots[slot] = { ...detection, label: detection.label || this.slots[slot]?.label };
        });
        return output;
    }
}

// Keep detections separate from the animation clock. Only pinched hands survive
// a brief occlusion; a deliberate open hand releases immediately. Expiry also
// covers a stalled camera rather than only explicit empty detection results.
export const HAND_LOSS_GRACE_MS = 180;
type BufferedHand = {
    target: HandLandmarks;
    seenAt: number;
    missing: boolean;
    pinching: boolean;
    position: { x: number; y: number };
    sampledAt: number;
};
export class HandInputBuffer {
    private slots: (BufferedHand | null)[] = [null, null];

    reset(): void { this.slots = [null, null]; }

    update(hands: [HandLandmarks | null, HandLandmarks | null], now: number): void {
        hands.forEach((hand, index) => {
            const previous = this.slots[index];
            if (!hand) {
                if (previous) previous.missing = true;
                return;
            }
            const continuous = previous && now - previous.seenAt <= HAND_LOSS_GRACE_MS;
            const position = { x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2 };
            this.slots[index] = {
                target: hand, seenAt: now, missing: false,
                pinching: isPinching(hand, !!continuous && previous.pinching),
                position: continuous ? previous.position : position,
                sampledAt: continuous ? previous.sampledAt : now,
            };
        });
    }

    visible(now: number): [HandLandmarks | null, HandLandmarks | null] {
        return this.slots.map(slot => slot && !slot.missing && now - slot.seenAt <= HAND_LOSS_GRACE_MS
            ? slot.target : null) as [HandLandmarks | null, HandLandmarks | null];
    }

    read(now: number): [HandLandmarks | null, HandLandmarks | null] {
        return this.slots.map(slot => {
            if (!slot || now - slot.seenAt > HAND_LOSS_GRACE_MS || (slot.missing && !slot.pinching)) return null;
            const target = { x: (slot.target[4].x + slot.target[8].x) / 2, y: (slot.target[4].y + slot.target[8].y) / 2 };
            const distance = Math.hypot(target.x - slot.position.x, target.y - slot.position.y);
            const elapsed = Math.max(0, now - slot.sampledAt);
            // Suppress small tremors, with a shorter lag on intentional motion.
            const alpha = 1 - Math.exp(-elapsed / (distance > 0.025 ? 12 : 35));
            slot.position.x += (target.x - slot.position.x) * alpha;
            slot.position.y += (target.y - slot.position.y) * alpha;
            slot.sampledAt = now;
            const dx = slot.position.x - target.x, dy = slot.position.y - target.y;
            // Translate the whole hand equally: smoothing must not deform the
            // thumb/index separation or synthesize a different gesture.
            return slot.target.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
        }) as [HandLandmarks | null, HandLandmarks | null];
    }
}
