export const FRAME_MS = 1000 / 60;
export class FixedStepClock {
    private last: number | null = null;
    private accumulator = 0;

    reset(): void { this.last = null; this.accumulator = 0; }

    advance(now: number): number {
        if (this.last === null) { this.last = now; return 1; }
        const elapsed = Math.max(0, now - this.last);
        this.last = now;
        if (elapsed > 250) { this.accumulator = 0; return 1; }
        this.accumulator += elapsed;
        const steps = Math.min(5, Math.floor((this.accumulator + 0.001) / FRAME_MS));
        this.accumulator = Math.max(0, this.accumulator - steps * FRAME_MS);
        if (steps === 5) this.accumulator = Math.min(this.accumulator, FRAME_MS);
        return steps;
    }
}
