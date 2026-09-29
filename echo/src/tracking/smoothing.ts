/**
 * Exponential Moving Average (EMA) for smoothing Landmarks (Float32Array).
 */
export class EMA {
    private alpha: number;
    private smoothed: Float32Array | null = null;

    constructor(alpha: number = 0.5) {
        this.alpha = alpha;
    }

    apply(points: Float32Array): Float32Array {
        if (!this.smoothed || this.smoothed.length !== points.length) {
            this.smoothed = new Float32Array(points);
            return this.smoothed;
        }

        for (let i = 0; i < points.length; i++) {
            this.smoothed[i] = this.smoothed[i] * (1 - this.alpha) + points[i] * this.alpha;
        }

        return this.smoothed;
    }
}

/**
 * Hysteresis filter with frame debounce.
 * Changes state only if the new value crosses the threshold and stays there for `requiredFrames`.
 */
export class Hysteresis {
    private state: boolean = false;
    private holdCount: number = 0;
    private requiredFrames: number;

    constructor(initialState: boolean = false, requiredFrames: number = 3) {
        this.state = initialState;
        this.requiredFrames = requiredFrames;
    }

    /**
     * @param value current value
     * @param onThreshold threshold to turn ON (value > onThreshold)
     * @param offThreshold threshold to turn OFF (value < offThreshold)
     */
    update(value: number, onThreshold: number, offThreshold: number): boolean {
        let targetState = this.state;
        if (this.state) {
            if (value < offThreshold) targetState = false;
        } else {
            if (value > onThreshold) targetState = true;
        }

        if (targetState !== this.state) {
            this.holdCount++;
            if (this.holdCount >= this.requiredFrames) {
                this.state = targetState;
                this.holdCount = 0;
            }
        } else {
            this.holdCount = 0;
        }

        return this.state;
    }
}
