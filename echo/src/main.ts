import { initializeAccount, showResult, closePanel, panelOpen, handleDwell } from './ui/account';
import './style.css';
import { StateStabilizer, isFist, isOpenPalm, isPinching, drawUnmirroredText } from './utils';
import {
    gameState, man, lever, tutorialBox, tutorialTarget,
    resetLevel, drawWorld, handleDragAndDrop, drawTutorial, handleTutorialDrag, evaluateRules,
    getAgentColor, plate, prism, deathBanner
} from './game';
import { LEVELS } from './levels';
import { playSfx, unlockAudioContext } from './audio';
import { t } from './i18n';
import { getSettings, subscribe as subscribeSettings } from './settings';
import { show, current, onEnterGame } from './scenes/router';
import { applyIdleHud, restartCurrentLevel } from './scenes/levels';
import { setHandStatus, setStatusMessage } from './scenes/menu';
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
    const config = LEVELS[level - 1];
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

function onResults(results: any) {
    const liveHand = results.multiHandLandmarks ? results.multiHandLandmarks[0] : null;

    // The pointing-finger dwell cursor works everywhere (menu, level select,
    // in-game HUD buttons), regardless of which scene is active.
    handleDwell(liveHand);

    if (!handModelReady) {
        handModelReady = true;
        setHandStatus('ready');
    }

    // While the menu/level-select scenes are showing, the camera may still be
    // running in the background (we don't stop it on scene switch), but the
    // game loop must not mutate gameState or draw on the canvas.
    if (current() !== 'game') {
        return;
    }

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
            const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);
            void showResult({ levelId: gameState.currentLevel, timeLeftMs: Math.max(0, gameState.RECORD_DURATION * (1 - gameState.currentFrame / maxFrames)), echoesUsed: gameState.recordedEchoes.filter(e => e.some(Boolean)).length, deaths: gameState.deaths, resets: gameState.resets }, nextLevel, replay);
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
        if (liveHand && isOpenPalm(liveHand)) {
            if (!gameState.attemptStart) gameState.attemptStart = now;
            gameState.mode = 'RECORDING';
            gameState.recordStartTime = now;
            gameState.echoIndex = 0;
            gameState.recordedEchoes = [[]];
            gameState.frames = [];
            resetLevel();

            if (gameState.maxEchoes > 1) {
                modeIndicator.innerText = t('recording.startMulti', { i: 1, max: gameState.maxEchoes });
            } else {
                modeIndicator.innerText = t('recording.start');
            }
            modeIndicator.className = "status-box text-2xl font-bold text-red-500 recording";
            const config = LEVELS[gameState.currentLevel - 1];
            if (Array.isArray(config?.hintRecording)) {
                gameState.baseInstruction = config.hintRecording[0] || t('recording.continueDefault');
            } else {
                gameState.baseInstruction = (config?.hintRecording as string) || t('recording.continueDefault');
            }
            instruction.innerHTML = gameState.baseInstruction;
        }
    }
    else if (gameState.mode === 'RECORDING') {
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
                resetLevel();

                modeIndicator.innerText = t('recording.startMulti', { i: gameState.echoIndex + 1, max: gameState.maxEchoes });
                const config = LEVELS[gameState.currentLevel - 1];
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
                resetLevel();

                modeIndicator.innerText = t('mode.loop');
                modeIndicator.className = "status-box text-2xl font-bold text-cyan-400 playing";
                const config = LEVELS[gameState.currentLevel - 1];
                gameState.baseInstruction = config?.hintPlaying || t('playing.defaultHint');
                instruction.innerHTML = gameState.baseInstruction;
            }
        } else {
            if (!gameState.recordedEchoes[gameState.echoIndex]) {
                gameState.recordedEchoes[gameState.echoIndex] = [];
            }
            const recordedHand = liveHand ? JSON.parse(JSON.stringify(liveHand)) : null;
            gameState.recordedEchoes[gameState.echoIndex].push(recordedHand);
            gameState.frames = gameState.recordedEchoes[0];

            const currentRecFrame = gameState.recordedEchoes[gameState.echoIndex].length - 1;
            for (let i = 0; i < gameState.echoIndex; i++) {
                const echo = gameState.recordedEchoes[i];
                const prevHand = echo ? echo[Math.min(currentRecFrame, echo.length - 1)] : null;
                handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, prevHand, `ghost_${i}`);
                if (prevHand) {
                    const ghostColor = getAgentColor(`ghost_${i}`);
                    if (getSettings().showSkeleton) {
                        drawConnectors(canvasCtx, prevHand, HAND_CONNECTIONS, {color: ghostColor, lineWidth: 4});
                        drawLandmarks(canvasCtx, prevHand, {color: '#ffffff', lineWidth: 2, radius: 4});
                    }
                }
            }
        }
    }
    else if (gameState.mode === 'PLAYING') {
        const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);

        for (let i = 0; i < gameState.recordedEchoes.length; i++) {
            const echo = gameState.recordedEchoes[i];
            const ghostHand = echo ? echo[gameState.currentFrame] : null;
            handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, ghostHand, `ghost_${i}`);
            if (ghostHand) {
                const ghostColor = getAgentColor(`ghost_${i}`);
                if (getSettings().showSkeleton) {
                    drawConnectors(canvasCtx, ghostHand, HAND_CONNECTIONS, {color: ghostColor, lineWidth: 4});
                    drawLandmarks(canvasCtx, ghostHand, {color: '#ffffff', lineWidth: 2, radius: 4});
                }
            }
        }

        gameState.currentFrame++;
        if (gameState.currentFrame >= maxFrames) {
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
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHand, 'live');
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
            const distLever = lever.x >= 0 ? Math.sqrt(Math.pow(px - lever.x, 2) + Math.pow(py - lever.handleY, 2)) : 999;
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
                       man.grabbedBy !== 'live' &&
                       lever.grabbedBy !== 'live' &&
                       (!plate || plate.grabbedBy !== 'live') &&
                       (!prism || prism.grabbedBy !== 'live') &&
                       closestDist > 0.15 && closestDist <= 0.30) {
                let targetName = t('target.man');
                let targetX = man.x;
                let targetY = man.y;
                if (closestDist === distLever) {
                    targetName = t('target.lever');
                    targetX = lever.x;
                    targetY = lever.handleY;
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

    if (liveHand) {
        const isPinch = isPinching(liveHand);
        if (getSettings().showSkeleton) {
            drawConnectors(canvasCtx, liveHand, HAND_CONNECTIONS, {color: isPinch ? '#facc15' : '#f97316', lineWidth: 5});
            drawLandmarks(canvasCtx, liveHand, {color: '#ffffff', lineWidth: 2, radius: 5});
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

const hands = new Hands({locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(onResults);

// The camera is only constructed/started lazily, the first time the player
// enters the game scene (via PLAY/TUTORIAL) — never on page load.
let camera: any = null;
let cameraStarted = false;

async function ensureCamera() {
    if (cameraStarted) return;
    cameraStarted = true;
    if (!camera) {
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({image: videoElement});
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
        show('menu');
    }
}
onEnterGame(() => { void ensureCamera(); });

show('menu');
void (async () => {
    await initializeAccount();
    unlockAudioContext();
})();
