import { initializeAccount, showResult, closePanel, panelOpen } from './ui/account';
import { handlePointer, setUiContext } from './ui/pointer';
import './style.css';
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
import { LiveHandTracker, snapshotHands, recordedHands, playableHands, type HandResults } from './hands';
import { getSettings, subscribe as subscribeSettings } from './settings';
import { show, current, onEnterGame, onChange } from './scenes/router';
import { get3DDifficulty } from './scenes/modes';
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
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Mirror setting: toggles a CSS class on the canvas instead of a hardcoded transform.
function applyMirrorSetting() {
    canvasElement.classList.toggle('mirrored', getSettings().mirror);
}
applyMirrorSetting();
subscribeSettings(() => applyMirrorSetting());

const fistStabilizer = new StateStabilizer(150, false);
const hintStabilizer = new StateStabilizer(15, "");

let handModelReady = false;
const handTracker = new LiveHandTracker();

function replayFrame(frame: EchoFrame | undefined, echoIndex: number): void {
    for (const [handIndex, hand] of recordedHands(frame || null).entries()) {
        const agentId = `ghost_${echoIndex}${handIndex ? '_1' : ''}`;
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, hand, agentId);
        if (hand && getSettings().showSkeleton) {
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
        modeIndicator.innerText = gameState.maxEchoes > 1
            ? t('recording.startMulti', { i: 1, max: gameState.maxEchoes }) : t('recording.start');
        modeIndicator.className = 'status-box text-2xl font-bold text-red-500 recording';
        gameState.baseInstruction = Array.isArray(config.hintRecording)
            ? config.hintRecording[0] : config.hintRecording || t('recording.continueDefault');
    } else {
        beginLivePlay(Date.now());
        modeIndicator.innerText = t('playing.liveTick', { time: 10 });
        modeIndicator.className = 'status-box text-2xl font-bold text-cyan-400 playing';
        gameState.baseInstruction = t(`round.liveHint${gameState.currentLevel}`);
    }
    instruction.innerHTML = gameState.baseInstruction;
    if (roundActions) roundActions.hidden = true;
}

function onResults(results: HandResults) {
    const trackedHands = handTracker.update(results);
    const liveHands = playableHands(trackedHands, current() === 'game3d' ? get3DDifficulty() : gameState.difficulty);
    latestHandCount = liveHands.filter(Boolean).length;
    const liveHand = liveHands[0] || liveHands[1];
    const liveAgent = liveHands[0] ? 'live' : 'live_1';
    const twoHands = liveHands.every(Boolean);

    // The hand cursor drives the whole interface (menus, dialogs, HUD).
    // A gripping hand must not dwell-click the HUD while carrying an object.
    const pointerHands = current() === 'game3d' ? liveHands.map(hand => {
        if (!hand) return null;
        const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
        const pinch = Math.hypot(hand[8].x - hand[4].x, hand[8].y - hand[4].y);
        return pinch / Math.max(.06, palm) < .62 ? null : hand;
    }) : liveHands;
    handlePointer(pointerHands);

    if (!handModelReady) {
        handModelReady = true;
        setHandStatus('ready');
    }

    if (current() === 'game3d') {
        window.dispatchEvent(new CustomEvent('echo:hands', { detail: liveHands }));
        return;
    }

    // While the menu/level-select scenes are showing, the camera may still be
    // running in the background (we don't stop it on scene switch), but the
    // game loop must not mutate gameState or draw on the canvas.
    if (current() !== 'game') {
        return;
    }

    if (roundActions) roundActions.hidden = gameState.mode !== 'IDLE';
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (gameState.mode === 'WON') {
        drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
        modeIndicator.innerText = t('mode.success');
        modeIndicator.className = "status-box text-2xl font-bold text-green-400 playing";
        instruction.innerHTML = t('win.instructionMulti');

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

    if (panelOpen() || isPaused()) { drawWorld(canvasCtx, canvasElement.width, canvasElement.height); canvasCtx.restore(); return; }

    const now = Date.now();

    if (liveHand && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING' || (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 3))) {
        if (fistStabilizer.update(isFist(liveHand))) {
            fistStabilizer.currentStableValue = false;
            fistStabilizer.candidateValue = false;
            fistStabilizer.consecutiveCount = 0;

            gameState.recordedEchoes = [];
            gameState.echoIndex = 0;

            if (gameState.mode === 'TUTORIAL') {
                gameState.tutorialStep = 4;
                resetLevel();
                gameState.baseInstruction = t('tutorial.step4.instruction');
                modeIndicator.innerText = t('tutorial.step4.indicator');
            } else {
                gameState.resets++;
                gameState.mode = 'IDLE';
                resetLevel();
                modeIndicator.innerText = t('mode.idle');
                modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
                gameState.baseInstruction = getIdleInstruction(gameState.currentLevel);
            }
            instruction.innerHTML = gameState.baseInstruction;
            canvasCtx.restore();
            return;
        }

        if (fistStabilizer.candidateValue === true && fistStabilizer.consecutiveCount > 0) {
            const wrist = liveHand[0];
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

    if (gameState.mode === 'TUTORIAL') {
        if (gameState.tutorialStep === 1) {
            if (liveHand && isOpenPalm(liveHand)) {
                gameState.tutorialStep = 2;
                gameState.baseInstruction = t('tutorial.step2.instruction');
                modeIndicator.innerText = t('tutorial.step2.indicator');
            }
        } else if (gameState.tutorialStep === 2) {
            handleTutorialDrag(canvasCtx, canvasElement.width, canvasElement.height, liveHand);
            if (!tutorialBox.grabbedBy) {
                const dist = Math.sqrt(Math.pow(tutorialBox.x - tutorialTarget.x, 2) + Math.pow(tutorialBox.y - tutorialTarget.y, 2));
                if (dist < tutorialTarget.radius) {
                    gameState.tutorialStep = 3;
                    gameState.baseInstruction = t('tutorial.step3.instruction');
                    modeIndicator.innerText = t('tutorial.step3.indicator');
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
            modeIndicator.innerText = t('recording.tickMulti', { i: gameState.echoIndex + 1, max: gameState.maxEchoes, time: timeLeft });
        } else {
            modeIndicator.innerText = t('recording.tick', { time: timeLeft });
        }

        if (now - gameState.recordStartTime > gameState.RECORD_DURATION) {
            if (gameState.echoIndex + 1 < gameState.maxEchoes) {
                gameState.echoIndex++;
                gameState.recordedEchoes[gameState.echoIndex] = [];
                gameState.recordStartTime = now;
                gameState.currentFrame = 0;
                resetLevel({ preserveProgress: true });
                gameState.maxEchoes = targetRecordings;

                modeIndicator.innerText = t('recording.startMulti', { i: gameState.echoIndex + 1, max: gameState.maxEchoes });
                const config = getActiveLevel();
                if (Array.isArray(config?.hintRecording) && config.hintRecording.length > gameState.echoIndex) {
                    gameState.baseInstruction = config.hintRecording[gameState.echoIndex];
                } else {
                    gameState.baseInstruction = t('recording.echoContinue', { i: gameState.echoIndex + 1, max: gameState.maxEchoes });
                }
                instruction.innerHTML = gameState.baseInstruction;
            } else {
                gameState.mode = 'PLAYING';
                gameState.playStartTime = now;
                gameState.currentFrame = 0;
                resetLevel({ preserveProgress: true });

                modeIndicator.innerText = t('mode.loop');
                modeIndicator.className = "status-box text-2xl font-bold text-cyan-400 playing";
                const config = getActiveLevel();
                gameState.baseInstruction = config?.hintPlaying || t('playing.defaultHint');
                instruction.innerHTML = gameState.baseInstruction;
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
                replayFrame(echo?.[Math.min(currentRecFrame, echo.length - 1)], i);
            }
        }
    }
    else if (gameState.mode === 'PLAYING') {
        const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);

        for (let i = 0; i < gameState.recordedEchoes.length; i++) {
            const echo = gameState.recordedEchoes[i];
            replayFrame(echo?.[gameState.currentFrame], i);
        }

        if (gameState.livePlay) {
            modeIndicator.innerText = t('playing.liveTick', { time: Math.ceil(playingTimeLeft(now) / 1000) });
        } else {
            gameState.currentFrame++;
        }
        if (gameState.livePlay ? playingTimeLeft(now) <= 0 : gameState.currentFrame >= maxFrames) {
            gameState.mode = 'IDLE';
            gameState.recordedEchoes = [];
            gameState.echoIndex = 0;
            resetLevel();
            gameState.resets++;
            modeIndicator.innerText = t('mode.fail');
            modeIndicator.className = "status-box text-2xl font-bold text-red-500";
            gameState.baseInstruction = t('fail.instruction');
        }
    }

    if (gameState.mode !== 'IDLE') {
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHands[0], 'live');
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHands[1], 'live_1');
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
        instruction.innerHTML = `<b class='text-red-500'>${deathBanner.text}</b>`;
    } else {
        const stableHint = hintStabilizer.update(currentHint);
        instruction.innerHTML = (getSettings().hints && stableHint) ? stableHint : gameState.baseInstruction;
    }

    for (const [index, hand] of liveHands.entries()) if (hand) {
        const isPinch = isPinching(hand);
        const color = getAgentColor(index === 0 ? 'live' : 'live_1');
        if (getSettings().showSkeleton) {
            drawConnectors(canvasCtx, hand, HAND_CONNECTIONS, {color: isPinch ? '#facc15' : color, lineWidth: 5});
            drawLandmarks(canvasCtx, hand, {color: '#ffffff', lineWidth: 2, radius: 5});
        }
    }

    if (gameState.mode === 'TUTORIAL') {
        drawTutorial(canvasCtx, canvasElement.width, canvasElement.height);
    } else {
        evaluateRules();
        drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
    }

    canvasCtx.restore();
}

// The menu and mouse-controlled 3D scene remain usable if the CDN or camera
// is unavailable. Only hand tracking depends on these external scripts.
const hands = typeof Hands === 'undefined' ? null : new Hands({locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands?.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands?.onResults(onResults);

// The camera starts with the menu so the interface can be driven by hand;
// entering the game retries if access was refused earlier.
let camera: any = null;
let cameraStarted = false;
let lastDetectionAt = 0;

async function ensureCamera(): Promise<boolean> {
    if (cameraStarted) return true;
    if (!hands || typeof Camera === 'undefined') {
        setStatusMessage(t('camera.unavailable'));
        return false;
    }
    cameraStarted = true;
    if (!camera) {
        camera = new Camera(videoElement, {
            onFrame: async () => {
                const now = performance.now();
                const detectionInterval = current() === 'game' || current() === 'game3d' ? 1000 / 30 : 1000 / 15;
                if (document.hidden || now - lastDetectionAt < detectionInterval) return;
                lastDetectionAt = now;
                try {
                    await hands.send({image: videoElement});
                } catch {
                    setStatusMessage(t('camera.unavailable'));
                    window.dispatchEvent(new CustomEvent('echo:hands', { detail: [null, null] }));
                }
            },
            width: 1280, height: 720
        });
    }
    try {
        await camera.start();
    } catch {
        cameraStarted = false;
        instruction.textContent = t('camera.unavailable');
        setStatusMessage(t('status.cameraBlocked'));
        if (current() === 'game') show('menu');
        return false;
    }
    setCameraStarted();
    return true;
}
onEnterGame(() => {
    hands?.setOptions({ maxNumHands: gameState.difficulty === 'easy' || gameState.mode === 'TUTORIAL' ? 1 : 2 });
    void ensureCamera();
});

let threeSession: { dispose(): void } | null = null;
let threeLoadGeneration = 0;
onChange(scene => {
    const generation = ++threeLoadGeneration;
    threeSession?.dispose();
    threeSession = null;
    if (scene !== 'game3d') return;
    hands?.setOptions({ maxNumHands: get3DDifficulty() === 'easy' ? 1 : 2 });
    const host = document.getElementById('scene-game3d');
    if (!host) return;
    const loading = document.createElement('p');
    loading.className = 'three-loading';
    loading.textContent = t('modes.loading3d');
    host.replaceChildren(loading);
    void import('./three/index').then(async ({ mountLevel3D }) => {
        if (generation !== threeLoadGeneration || current() !== 'game3d') return;
        const mounted = await mountLevel3D(host, get3DDifficulty(), {
            onExit: () => show('modes'),
            onCameraRequest: async () => {
                if (!await ensureCamera()) throw new Error('Camera unavailable');
            }
        });
        if (generation !== threeLoadGeneration || current() !== 'game3d') mounted.dispose();
        else threeSession = mounted;
    }).catch(error => {
        if (generation !== threeLoadGeneration || current() !== 'game3d') return;
        console.error('Unable to start 3D level', error);
        const message = document.createElement('p');
        message.textContent = t('modes.error3d');
        const back = document.createElement('button');
        back.type = 'button';
        back.dataset.dwell = '';
        back.className = 'menu-btn';
        back.textContent = t('levels.back');
        back.onclick = () => show('modes');
        host.replaceChildren(message, back);
    });
});
// Pinch grabs objects while recording/replaying clones and in the tutorial drag
// step; everywhere else the hand cursor behaves as in the menus.
setUiContext(() => {
    if (current() === 'game3d') return false;
    const grabbing = gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING'
        || (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 2);
    return current() !== 'game' || !grabbing || !!document.querySelector('dialog[open]');
});

show('menu');
void ensureCamera();
void (async () => {
    await initializeAccount();
    unlockAudioContext();
})();
