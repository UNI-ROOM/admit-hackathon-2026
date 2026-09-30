import { initializeAccount, requireSignIn, showResult, closePanel, panelOpen } from './ui/account';
import { handlePointer, setUiContext } from './ui/pointer';
import './style.css';
import { FixedStepClock, FRAME_MS } from './loop';
import { loadTrackingRuntime, HANDS_ASSETS } from './tracking-runtime';
import { StateStabilizer, isFist, isOpenPalm, isPinching, drawUnmirroredText } from './utils';
import {
    gameState, man, levers, tutorialBox, tutorialTarget,
    resetLevel, drawWorld, handleDragAndDrop, drawTutorial, handleTutorialDrag, evaluateRules,
    getAgentColor, plate, prism, deathBanner, recordingTarget, playingTimeLeft,
    getActiveLevel, beginRecording, beginLivePlay
} from './game';
import { LEVELS, getLevelConfig } from './levels';
import type { EchoFrame } from './types';
import { playSfx, unlockAudioContext } from './audio';
import { t } from './i18n';
import { LiveHandTracker, HandInputBuffer, snapshotHands, recordedHands, playableHands, type HandResults } from './hands';
import { getSettings, subscribe as subscribeSettings } from './settings';
import { show, current, onEnterGame, onChange } from './scenes/router';
import { applyIdleHud, restartCurrentLevel } from './scenes/levels';
import { setHandStatus, setStatusMessage, setCameraStarted } from './scenes/menu';
import { isPaused } from './scenes/pause';
import './scenes/menu';
import './scenes/levels';
import './scenes/pause';

declare const Hands: any;
declare const Camera: any;
declare const drawConnectors: any;
declare const drawLandmarks: any;
declare const HAND_CONNECTIONS: any;

const videoElement = document.getElementById('webcam') as HTMLVideoElement;
const canvasElement = document.getElementById('game-canvas') as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext('2d')!;
const modeIndicator = document.getElementById('mode-indicator')!;
const instruction = document.getElementById('instruction')!;
let wonTimeout: any = null;

function getIdleInstruction(level: number): string {
    const config = getLevelConfig(level, gameState.difficulty);
    return config?.hintIdle || t('idle.instructionDefault');
}

function resizeCanvas() {
    const scale = Math.min(1, 1920 / window.innerWidth, 1080 / window.innerHeight);
    canvasElement.width = Math.round(window.innerWidth * scale);
    canvasElement.height = Math.round(window.innerHeight * scale);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Mirror setting: toggles a CSS class on the canvas instead of a hardcoded transform.
function applyMirrorSetting() {
    canvasElement.classList.toggle('mirrored', getSettings().mirror);
}
applyMirrorSetting();
subscribeSettings(() => applyMirrorSetting());

// Hold a fist for 1.2 s to reset the loop (counted in fixed 60 Hz simulation steps).
const FIST_HOLD_MS = 1200;
const fistStabilizer = new StateStabilizer(Math.round(FIST_HOLD_MS / FRAME_MS), false);
const hintStabilizer = new StateStabilizer(15, "");

let handModelReady = false;
const handTracker = new LiveHandTracker();
const handInput = new HandInputBuffer();
const frameClock = new FixedStepClock();
function writeText(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
}
function writeHtml(element: HTMLElement, value: string): void {
    if (element.innerHTML !== value) element.innerHTML = value;
}
function writeClass(element: HTMLElement, value: string): void {
    if (element.className !== value) element.className = value;
}

function replayFrame(frame: EchoFrame | undefined, echoIndex: number, render: boolean): void {
    for (const [handIndex, hand] of recordedHands(frame || null).entries()) {
        const agentId = `ghost_${echoIndex}${handIndex ? '_1' : ''}`;
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, hand, agentId, render);
        if (render && hand && getSettings().showSkeleton) {
            drawConnectors(canvasCtx, hand, HAND_CONNECTIONS, {color: getAgentColor(agentId), lineWidth: 4});
            drawLandmarks(canvasCtx, hand, {color: '#ffffff', lineWidth: 2, radius: 4});
        }
    }
}

let latestHandCount = 0;
const roundActions = document.getElementById('round-actions');
const recordButton = document.getElementById('record-button');
const playButton = document.getElementById('play-button');
if (recordButton) { recordButton.textContent = t('round.record'); recordButton.onclick = () => startRound('record'); }
if (playButton) { playButton.textContent = t('round.play'); playButton.onclick = () => startRound('play'); }

function startRound(action: 'record' | 'play'): void {
    if (current() !== 'game' || gameState.mode !== 'IDLE' || isPaused() || panelOpen()) return;
    if (wonTimeout) clearTimeout(wonTimeout);
    wonTimeout = null;
    gameState.wonTimeoutSet = false;
    const config = getActiveLevel();
    if (action === 'record') {
        beginRecording(Date.now(), latestHandCount);
        writeText(modeIndicator, gameState.maxEchoes > 1
            ? t('recording.startMulti', { i: 1, max: gameState.maxEchoes }) : t('recording.start'));
        writeClass(modeIndicator, 'status-box text-2xl font-bold text-red-500 recording');
        gameState.baseInstruction = Array.isArray(config.hintRecording)
            ? config.hintRecording[0] : config.hintRecording || t('recording.continueDefault');
    } else {
        beginLivePlay(Date.now());
        writeText(modeIndicator, t('playing.liveTick', { time: 10 }));
        writeClass(modeIndicator, 'status-box text-2xl font-bold text-cyan-400 playing');
        gameState.baseInstruction = t(`round.liveHint${gameState.currentLevel}`);
    }
    writeHtml(instruction, gameState.baseInstruction);
    if (roundActions) roundActions.hidden = true;
}

function onResults(results: HandResults) {
    handInput.update(handTracker.update(results), Date.now());
    if (detectionFailed) { detectionFailed = false; setCameraStarted(); }
    if (!handModelReady) {
        handModelReady = true;
        setHandStatus('ready');
    }
}

function processFrame(render: boolean) {
    const now = Date.now();
    const visible = playableHands(handInput.visible(now), gameState.difficulty);
    const trackedHands = handInput.read(now);
    const liveHands = playableHands(trackedHands, gameState.difficulty);
    latestHandCount = visible.filter(Boolean).length;
    const liveHand = liveHands[0] || liveHands[1];
    const liveAgent = liveHands[0] ? 'live' : 'live_1';
    const twoHands = visible.every(Boolean);
    // Menus use actual visible hands; occlusion grace only protects gameplay.
    if (render) handlePointer(visible);

    // While the menu/level-select scenes are showing, the camera may still be
    // running in the background (we don't stop it on scene switch), but the
    // game loop must not mutate gameState or draw on the canvas.
    if (current() !== 'game') {
        // Additional scenes can use stabilized input without changing the 2D
        // difficulty rules or starting another camera/model instance.
        if (render) window.dispatchEvent(new CustomEvent('echo:hands', { detail: trackedHands }));
        return;
    }

    if (roundActions) roundActions.hidden = gameState.mode !== 'IDLE';
    canvasCtx.save();
    if (render) canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (gameState.mode === 'WON') {
        if (render) drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
        writeText(modeIndicator, t('mode.success'));
        writeClass(modeIndicator, "status-box text-2xl font-bold text-green-400 playing");
        writeHtml(instruction, t('win.instructionMulti'));

        // Reset after 8 seconds
        if (!gameState['wonTimeoutSet']) {
            gameState['wonTimeoutSet'] = true;
            playSfx('win');
            const nextLevel = () => {
                if (wonTimeout) clearTimeout(wonTimeout);
                wonTimeout = null;
                gameState['wonTimeoutSet'] = false;
                // The player may have already navigated to Level Select/Menu (via
                // pause) before the 8s auto-advance fired — don't clobber whatever
                // level they're looking at now.
                if (current() !== 'game') return;
                closePanel();
                gameState.deaths = 0; gameState.resets = 0; gameState.attemptStart = 0;
                gameState.currentLevel = Math.min(gameState.currentLevel + 1, LEVELS.length);
                gameState.mode = 'IDLE';
                gameState.recordedEchoes = [];
                gameState.echoIndex = 0;
                resetLevel();
                applyIdleHud(gameState.currentLevel);
                gameState['wonTimeoutSet'] = false;
            };
            const replay = () => {
                if (wonTimeout) clearTimeout(wonTimeout);
                wonTimeout = null;
                gameState['wonTimeoutSet'] = false;
                restartCurrentLevel();
            };
            wonTimeout = setTimeout(nextLevel, 8000);
            void showResult({ levelId: gameState.currentLevel, timeLeftMs: playingTimeLeft(), echoesUsed: gameState.winEchoesUsed, difficulty: gameState.difficulty, deaths: gameState.deaths, resets: gameState.resets }, nextLevel, replay);
        }
        return;
    }

    if (panelOpen() || isPaused()) { if (render) drawWorld(canvasCtx, canvasElement.width, canvasElement.height); canvasCtx.restore(); return; }

    // Either hand can make the reset fist.
    const fistHand = liveHands.find(hand => hand && isFist(hand)) || null;
    if (liveHand && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING' || (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 3))) {
        if (fistStabilizer.update(!!fistHand)) {
            fistStabilizer.currentStableValue = false;
            fistStabilizer.candidateValue = false;
            fistStabilizer.consecutiveCount = 0;

            gameState.recordedEchoes = [];
            gameState.echoIndex = 0;

            if (gameState.mode === 'TUTORIAL') {
                gameState.tutorialStep = 4;
                resetLevel();
                gameState.baseInstruction = t('tutorial.step4.instruction');
                writeText(modeIndicator, t('tutorial.step4.indicator'));
            } else {
                gameState.resets++;
                gameState.mode = 'IDLE';
                resetLevel();
                writeText(modeIndicator, t('mode.idle'));
                writeClass(modeIndicator, "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]");
                gameState.baseInstruction = getIdleInstruction(gameState.currentLevel);
            }
            writeHtml(instruction, gameState.baseInstruction);
            canvasCtx.restore();
            return;
        }

        if (render && fistHand && fistStabilizer.candidateValue === true && fistStabilizer.consecutiveCount > 0) {
            const wrist = fistHand[0];
            const px = wrist.x * canvasElement.width;
            const py = wrist.y * canvasElement.height;
            const progress = fistStabilizer.consecutiveCount / fistStabilizer.framesRequired;

            canvasCtx.beginPath();
            canvasCtx.arc(px, py, 60, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
            canvasCtx.strokeStyle = '#ef4444';
            canvasCtx.lineWidth = 8;
            canvasCtx.stroke();

            let text = gameState.mode === 'TUTORIAL' ? t('reset.tutorialGood') : t('reset.loop');
            drawUnmirroredText(canvasCtx, text, px, py - 80, 'bold 24px sans-serif', '#ef4444');
        }
    }

    if (!liveHand) fistStabilizer.update(false);

    if (gameState.mode === 'TUTORIAL') {
        if (gameState.tutorialStep === 1) {
            if (liveHand && isOpenPalm(liveHand)) {
                gameState.tutorialStep = 2;
                gameState.baseInstruction = t('tutorial.step2.instruction');
                writeText(modeIndicator, t('tutorial.step2.indicator'));
            }
        } else if (gameState.tutorialStep === 2) {
            handleTutorialDrag(canvasCtx, canvasElement.width, canvasElement.height, liveHand, render);
            if (!tutorialBox.grabbedBy) {
                const dist = Math.sqrt(Math.pow(tutorialBox.x - tutorialTarget.x, 2) + Math.pow(tutorialBox.y - tutorialTarget.y, 2));
                if (dist < tutorialTarget.radius) {
                    gameState.tutorialStep = 3;
                    gameState.baseInstruction = t('tutorial.step3.instruction');
                    writeText(modeIndicator, t('tutorial.step3.indicator'));
                }
            }
        }
    } else if (gameState.mode === 'IDLE') {
        if (liveHands.some(hand => hand && isOpenPalm(hand))) {
            startRound('record');
        }
    }
    else if (gameState.mode === 'RECORDING') {
        if (twoHands) gameState.recordingHands = 2;
        const targetRecordings = Math.max(gameState.echoIndex + 1, recordingTarget(gameState.recordingHands));
        gameState.maxEchoes = targetRecordings;
        const timeLeft = Math.ceil((gameState.RECORD_DURATION - (now - gameState.recordStartTime))/1000);
        if (gameState.maxEchoes > 1) {
            writeText(modeIndicator, t('recording.tickMulti', { i: gameState.echoIndex + 1, max: gameState.maxEchoes, time: timeLeft }));
        } else {
            writeText(modeIndicator, t('recording.tick', { time: timeLeft }));
        }

        if (now - gameState.recordStartTime > gameState.RECORD_DURATION) {
            if (gameState.echoIndex + 1 < gameState.maxEchoes) {
                gameState.echoIndex++;
                gameState.recordedEchoes[gameState.echoIndex] = [];
                gameState.recordStartTime = now;
                gameState.currentFrame = 0;
                resetLevel({ preserveProgress: true });
                gameState.maxEchoes = targetRecordings;

                writeText(modeIndicator, t('recording.startMulti', { i: gameState.echoIndex + 1, max: gameState.maxEchoes }));
                const config = getActiveLevel();
                if (Array.isArray(config?.hintRecording) && config.hintRecording.length > gameState.echoIndex) {
                    gameState.baseInstruction = config.hintRecording[gameState.echoIndex];
                } else {
                    gameState.baseInstruction = t('recording.echoContinue', { i: gameState.echoIndex + 1, max: gameState.maxEchoes });
                }
                writeHtml(instruction, gameState.baseInstruction);
            } else {
                gameState.mode = 'PLAYING';
                gameState.playStartTime = now;
                gameState.currentFrame = 0;
                resetLevel({ preserveProgress: true });

                writeText(modeIndicator, t('mode.loop'));
                writeClass(modeIndicator, "status-box text-2xl font-bold text-cyan-400 playing");
                const config = getActiveLevel();
                gameState.baseInstruction = config?.hintPlaying || t('playing.defaultHint');
                writeHtml(instruction, gameState.baseInstruction);
            }
        } else {
            if (!gameState.recordedEchoes[gameState.echoIndex]) {
                gameState.recordedEchoes[gameState.echoIndex] = [];
            }
            const recordedHand = snapshotHands(liveHands);
            gameState.recordedEchoes[gameState.echoIndex].push(recordedHand);
            gameState.frames = gameState.recordedEchoes[0];

            const currentRecFrame = gameState.recordedEchoes[gameState.echoIndex].length - 1;
            for (let i = 0; i < gameState.echoIndex; i++) {
                const echo = gameState.recordedEchoes[i];
                replayFrame(echo?.[Math.min(currentRecFrame, echo.length - 1)], i, render);
            }
        }
    }
    else if (gameState.mode === 'PLAYING') {
        const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);

        for (let i = 0; i < gameState.recordedEchoes.length; i++) {
            const echo = gameState.recordedEchoes[i];
            replayFrame(echo?.[gameState.currentFrame], i, render);
        }

        if (gameState.livePlay) {
            writeText(modeIndicator, t('playing.liveTick', { time: Math.ceil(playingTimeLeft(now) / 1000) }));
        } else {
            gameState.currentFrame++;
        }
        if (gameState.livePlay ? playingTimeLeft(now) <= 0 : gameState.currentFrame >= maxFrames) {
            gameState.mode = 'IDLE';
            gameState.recordedEchoes = [];
            gameState.echoIndex = 0;
            resetLevel();
            gameState.resets++;
            writeText(modeIndicator, t('mode.fail'));
            writeClass(modeIndicator, "status-box text-2xl font-bold text-red-500");
            gameState.baseInstruction = t('fail.instruction');
        }
    }

    if (gameState.mode !== 'IDLE') {
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHands[0], 'live', render);
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHands[1], 'live_1', render);
    }

    let currentHint = "";
    if (liveHand) {
        if (gameState.mode === 'TUTORIAL') {
            if (liveHand[0].y > 0.8) {
                currentHint = t('hint.raiseHandTutorial');
            }
        } else {
            const isPinch = isPinching(liveHand);
            const px = (liveHand[4].x + liveHand[8].x) / 2;
            const py = (liveHand[4].y + liveHand[8].y) / 2;
            const distMan = Math.sqrt(Math.pow(px - man.x, 2) + Math.pow(py - man.y, 2));
            const closestLever = levers.reduce<(typeof levers)[number] | undefined>((best, candidate) =>
                !best || Math.hypot(px - candidate.x, py - candidate.handleY) < Math.hypot(px - best.x, py - best.handleY) ? candidate : best, undefined);
            const distLever = closestLever ? Math.hypot(px - closestLever.x, py - closestLever.handleY) : 999;
            const distPlate = plate ? Math.sqrt(Math.pow(px - plate.x, 2) + Math.pow(py - plate.y, 2)) : 999;
            const distPrism = prism ? Math.sqrt(Math.pow(px - prism.x, 2) + Math.pow(py - prism.y, 2)) : 999;
            let closestDist = Math.min(distMan, distLever, distPlate, distPrism);

            const tips = [8, 12, 16, 20];
            const joints = [6, 10, 14, 18];
            const fingerNames = [t('finger.index'), t('finger.middle'), t('finger.ring'), t('finger.pinky')];
            let straight = 0;
            let bentFingers = [];
            for(let i=0; i<4; i++) {
                if (liveHand[tips[i]].y < liveHand[joints[i]].y) {
                    straight++;
                } else {
                    bentFingers.push(fingerNames[i]);
                }
            }

            if (liveHand[0].y > 0.8) {
                currentHint = t('hint.raiseHand');
            } else if (isPinch && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING') &&
                       man.grabbedBy !== liveAgent &&
                       !levers.some(object => object.grabbedBy === liveAgent) &&
                       (!plate || plate.grabbedBy !== liveAgent) &&
                       (!prism || prism.grabbedBy !== liveAgent) &&
                       closestDist > 0.15 && closestDist <= 0.30) {
                let targetName = t('target.man');
                let targetX = man.x;
                let targetY = man.y;
                if (closestDist === distLever && closestLever) {
                    targetName = t('target.lever');
                    targetX = closestLever.x;
                    targetY = closestLever.handleY;
                } else if (closestDist === distPlate && plate) {
                    targetName = t('target.shield');
                    targetX = plate.x;
                    targetY = plate.y;
                } else if (closestDist === distPrism && prism) {
                    targetName = t('target.prism');
                    targetX = prism.x;
                    targetY = prism.y;
                }
                let dx = px - targetX;
                let dy = py - targetY;

                let dirX = dx > 0 ? t('dir.right') : t('dir.left');
                let dirY = dy > 0 ? t('dir.up') : t('dir.down');
                let moveInstruction = Math.abs(dx) > Math.abs(dy) ? dirX : dirY;

                currentHint = t('hint.missedTarget', { target: targetName, dir: moveInstruction });
            } else if (gameState.mode === 'IDLE' && straight >= 1 && straight <= 3) {
                currentHint = t('hint.straightenFingers', { bent: bentFingers.join(', ') });
            }
        }
    }

    if (deathBanner.text && Date.now() < deathBanner.until) {
        writeHtml(instruction, `<b class='text-red-500'>${deathBanner.text}</b>`);
    } else {
        const stableHint = hintStabilizer.update(currentHint);
        writeHtml(instruction, (getSettings().hints && stableHint) ? stableHint : gameState.baseInstruction);
    }

    for (const [index, hand] of liveHands.entries()) if (render && hand) {
        const isPinch = isPinching(hand);
        const color = getAgentColor(index === 0 ? 'live' : 'live_1');
        if (getSettings().showSkeleton) {
            drawConnectors(canvasCtx, hand, HAND_CONNECTIONS, {color: isPinch ? '#facc15' : color, lineWidth: 5});
            drawLandmarks(canvasCtx, hand, {color: '#ffffff', lineWidth: 2, radius: 5});
        }
    }

    if (gameState.mode === 'TUTORIAL') {
        if (render) drawTutorial(canvasCtx, canvasElement.width, canvasElement.height);
    } else {
        evaluateRules();
        if (render) drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
    }

    canvasCtx.restore();
}

// Animation continues smoothly while camera inference runs at a lower rate.
function animate(timestamp: number): void {
    requestAnimationFrame(animate);
    if (document.hidden) { frameClock.reset(); return; }
    const steps = frameClock.advance(timestamp);
    for (let step = 0; step < steps; step++) processFrame(step === steps - 1);
}
requestAnimationFrame(animate);
onChange(scene => {
    handInput.reset();
    frameClock.reset();
    if (scene !== 'game') hands?.setOptions({ maxNumHands: 2 });
});

let hands: any = null;
let trackingReady: Promise<void> | null = null;
let camera: any = null;
let cameraStarted = false;
let cameraStarting: Promise<void> | null = null;
let detectionPending = false;
let lastDetectionAt = -Infinity;
let detectionFailed = false;

async function initializeTracking(): Promise<void> {
    if (hands) return;
    if (!trackingReady) {
        trackingReady = (async () => {
            await loadTrackingRuntime();
            const model = new Hands({ locateFile: (file: string) => HANDS_ASSETS + file });
            model.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
            model.onResults(onResults);
            hands = model;
        })().finally(() => { trackingReady = null; });
    }
    await trackingReady;
}

// Camera requests and model inference cannot overlap. Lower menu frequency and
// a 640x480 stream leave CPU/GPU time for rendering and two-hand tracking.
async function ensureCamera(): Promise<void> {
    if (cameraStarted) return;
    if (cameraStarting) return cameraStarting;
    cameraStarting = (async () => {
        try {
            await initializeTracking();
        } catch {
            setStatusMessage(t('camera.unavailable'));
            return;
        }
        hands.setOptions({ maxNumHands: current() === 'game' && (gameState.difficulty === 'easy' || gameState.mode === 'TUTORIAL') ? 1 : 2 });
        if (!camera) {
            camera = new Camera(videoElement, {
                onFrame: async () => {
                    const now = performance.now();
                    const interval = current() === 'game' && !isPaused() ? 1000 / 30 : 1000 / 15;
                    if (document.hidden || detectionPending || now - lastDetectionAt < interval) return;
                    lastDetectionAt = now;
                    detectionPending = true;
                    try {
                        await hands.send({ image: videoElement });
                    } catch {
                        handInput.reset();
                        if (!detectionFailed) setStatusMessage(t('camera.unavailable'));
                        detectionFailed = true;
                    } finally {
                        detectionPending = false;
                    }
                },
                width: 640, height: 480
            });
        }
        try {
            await camera.start();
            cameraStarted = true;
            setCameraStarted();
        } catch {
            writeText(instruction, t('camera.unavailable'));
            setStatusMessage(t('status.cameraBlocked'));
            if (current() === 'game') show('menu');
        }
    })().finally(() => { cameraStarting = null; });
    return cameraStarting;
}
onEnterGame(() => {
    hands?.setOptions({ maxNumHands: gameState.difficulty === 'easy' || gameState.mode === 'TUTORIAL' ? 1 : 2 });
    void ensureCamera();
});

// Freeze recording/live timers while the tab is hidden, discard stale hands,
// and resume without a physics/echo catch-up burst.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
    frameClock.reset();
    handInput.reset();
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && !isPaused()) {
        const elapsed = Date.now() - hiddenAt;
        if (gameState.recordStartTime) gameState.recordStartTime += elapsed;
        if (gameState.playStartTime) gameState.playStartTime += elapsed;
    }
    hiddenAt = 0;
});

// Pinch grabs objects while recording/replaying clones and in the tutorial drag
// step; everywhere else the hand cursor behaves as in the menus.
setUiContext(() => {
    const grabbing = gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING'
        || (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 2);
    return current() !== 'game' || !grabbing || !!document.querySelector('dialog[open]');
});

show('menu');
void ensureCamera();
void (async () => {
    await initializeAccount();
    await requireSignIn();
    unlockAudioContext();
})();
