export class Clock {
    private startTime: number = 0;
    private pausedAt: number | null = null;
    private totalPausedTime: number = 0;
    private isRunning: boolean = false;

    start() {
        this.startTime = performance.now();
        this.pausedAt = null;
        this.totalPausedTime = 0;
        this.isRunning = true;
    }

    pause() {
        if (!this.isRunning || this.pausedAt !== null) return;
        this.pausedAt = performance.now();
    }

    resume() {
        if (!this.isRunning || this.pausedAt === null) return;
        this.totalPausedTime += performance.now() - this.pausedAt;
        this.pausedAt = null;
    }

    roundTime(): number {
        if (!this.isRunning) return 0;
        const now = this.pausedAt !== null ? this.pausedAt : performance.now();
        const elapsedMs = now - this.startTime - this.totalPausedTime;
        return elapsedMs / 1000;
    }
}
