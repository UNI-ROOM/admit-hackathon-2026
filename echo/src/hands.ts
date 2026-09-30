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
