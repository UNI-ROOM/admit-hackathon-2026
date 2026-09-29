import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export type Landmarks = Float32Array; // length 132

export class PoseTracker {
    private landmarker: PoseLandmarker | null = null;

    async init() {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        this.landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
                delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
        });
    }

    update(video: HTMLVideoElement, timestamp: number): Landmarks | null {
        if (!this.landmarker) return null;

        const res = this.landmarker.detectForVideo(video, timestamp);
        if (res.landmarks && res.landmarks.length > 0) {
            const lm = res.landmarks[0];
            const result = new Float32Array(132);
            for (let i = 0; i < 33; i++) {
                result[i * 4 + 0] = 1 - lm[i].x; // mirror x
                result[i * 4 + 1] = lm[i].y;
                result[i * 4 + 2] = lm[i].z;
                // Mediapipe uses `visibility` field, provide fallback if undefined
                result[i * 4 + 3] = lm[i].visibility ?? 0;
            }
            return result;
        }
        return null;
    }
}
