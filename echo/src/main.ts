import { setupCamera } from './tracking/camera';
import { PoseTracker } from './tracking/poseTracker';
import { Renderer } from './render/renderer';
import { Clock } from './core/clock';
import { Recorder, Recording } from './echo/recorder';
import { sample } from './echo/playback';
import { PoseRecognizer } from './tracking/poseState';
import { calibrate, Calibration } from './tracking/calibration';
import { L1 } from './game/levels';
import { createInitialState, evaluate as evaluateRules } from './game/rules';
import { evaluate as evaluateHints } from './game/hints';
import { Actor, PoseState } from './game/types';

async function boot() {
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!video || !canvas) {
        console.error('Video or Canvas element not found');
        return;
    }

    const renderer = new Renderer(canvas);

    console.log('Setting up camera...');
    await setupCamera(video);
    console.log('Camera is active.');

    console.log('Initializing PoseTracker...');
    const tracker = new PoseTracker();
    await tracker.init();
    console.log('PoseTracker is ready.');

    const clock = new Clock();
    const currentRecorder = new Recorder(0);
    const recordings: Recording[] = [];
    
    let lastVideoTime = -1;
    let calib: Calibration | null = null;
    let prevWorld = createInitialState(0);
    
    const recognizer = new PoseRecognizer();
    let noLmFrames = 0;
    const actorStunData: Record<string, number> = { player: 0 };

    clock.start();

    let lastKnownLm: Float32Array | null = null;
    
    function loop() {
        let lm: Float32Array | null = null;
        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const timestamp = performance.now();
            lm = tracker.update(video, timestamp);
            if (lm) {
                lastKnownLm = lm;
            }
        }

        if (lm && !calib) {
            calib = calibrate(lm);
            if (calib) console.log("Calibrated:", calib);
        }

        if (lm === null) {
            noLmFrames++;
            if (noLmFrames > 10) {
                clock.pause();
            }
        } else {
            noLmFrames = 0;
            clock.resume();
        }
        
        const t = clock.roundTime();
        currentRecorder.push(t, lm);

        const actors: Actor[] = [];
        const playerLm = lastKnownLm;
        const echoesLm: Float32Array[] = [];

        if (calib) {
            let playerState: PoseState;
            if (lastKnownLm) {
                playerState = recognizer.recognize(lastKnownLm, calib);
            } else {
                playerState = {
                    visible: false,
                    x: 0, lane: 3,
                    armUp: { left: false, right: false },
                    crouch: false, shield: false, bothUp: false,
                    raw: { wristAboveHead: { left: 0, right: 0 }, crouchDepth: 0, wristGap: 0, wristsCrossed: false, distToLaneCenter: 0 }
                };
            }
            actors.push({
                id: 'player',
                state: playerState,
                stunnedUntil: actorStunData['player'] || 0,
                color: '#ffffff'
            });

            recordings.forEach((rec, i) => {
                const echoId = `echo${i + 1}` as 'echo1';
                const echoLm = sample(rec, t);
                echoesLm.push(echoLm);
                actors.push({
                    id: echoId,
                    state: recognizer.recognize(echoLm, calib!),
                    stunnedUntil: actorStunData[echoId] || 0,
                    color: '#ff4444'
                });
            });
        }

        let world = prevWorld;
        if (calib) {
             world = evaluateRules(L1, actors, t, prevWorld);
             for (const a of actors) {
                 actorStunData[a.id] = a.stunnedUntil;
             }
             prevWorld = world;
        }

        const allRecordings = [...recordings, currentRecorder.getRecording(t)];
        const hint = calib ? evaluateHints(
            L1,
            actors,
            world,
            allRecordings,
            t
        ) : { id: 'calib', text: 'Ожидание калибровки (встаньте в кадр целиком)', severity: 'error', priority: 1000 } as any;

        renderer.draw(video, L1, actors, world, hint, t, playerLm, echoesLm);

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
}

boot().catch(console.error);
