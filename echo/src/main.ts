import './style.css';
import { StateStabilizer, isFist, isOpenPalm, isPinching, drawUnmirroredText } from './utils';
import { 
    gameState, man, lever, tutorialBox, tutorialTarget, 
    resetLevel, drawWorld, handleDragAndDrop, drawTutorial, handleTutorialDrag, evaluateRules 
} from './game';
import { LEVELS } from './levels';

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

function resizeCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const fistStabilizer = new StateStabilizer(150, false);
const hintStabilizer = new StateStabilizer(15, "");

function onResults(results: any) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (gameState.mode === 'WON') {
        drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
        modeIndicator.innerText = "УСПЕХ!";
        modeIndicator.className = "status-box text-2xl font-bold text-green-400 playing";
        instruction.innerHTML = "🏆 ГЕНИАЛЬНО! Вы и ваш клон спасли его!";
        
        // Reset after 5 seconds
        if (!gameState['wonTimeoutSet']) {
            gameState['wonTimeoutSet'] = true;
            setTimeout(() => {
                gameState.currentLevel++;
                gameState.mode = 'IDLE';
                resetLevel();
                modeIndicator.innerText = "ОЖИДАНИЕ...";
                modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
                gameState.baseInstruction = "Уровень загружен! Соедини пальцы (щипок), чтобы схватить объекты. Покажи ладонь, чтобы начать!";
                instruction.innerHTML = gameState.baseInstruction;
                
                const titleEl = document.getElementById('level-title');
                if (titleEl) {
                    const lvlIdx = Math.min(gameState.currentLevel - 1, LEVELS.length - 1);
                    titleEl.innerText = LEVELS[lvlIdx].title;
                }
                
                gameState['wonTimeoutSet'] = false;
            }, 5000);
        }
        return;
    }

    const liveHand = results.multiHandLandmarks ? results.multiHandLandmarks[0] : null;
    const now = Date.now();

    if (liveHand && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING' || (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 3))) {
        if (fistStabilizer.update(isFist(liveHand))) {
            fistStabilizer.currentStableValue = false;
            fistStabilizer.candidateValue = false;
            fistStabilizer.consecutiveCount = 0;
            
            if (gameState.mode === 'TUTORIAL') {
                gameState.mode = 'IDLE';
                resetLevel();
                modeIndicator.innerText = "ОЖИДАНИЕ...";
                modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
                gameState.baseInstruction = "Обучение завершено! Покажи открытую ладонь, чтобы начать!";
            } else {
                gameState.mode = 'IDLE';
                resetLevel();
                modeIndicator.innerText = "ОЖИДАНИЕ...";
                modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
                gameState.baseInstruction = "Сброс! Соедини пальцы (щипок), чтобы схватить объекты. Покажи ладонь, чтобы начать!";
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
            
            let text = gameState.mode === 'TUTORIAL' ? 'ОТЛИЧНО!' : 'СБРОС ПЕТЛИ';
            drawUnmirroredText(canvasCtx, text, px, py - 80, 'bold 24px sans-serif', '#ef4444');
        }
    }

    if (gameState.mode === 'TUTORIAL') {
        if (gameState.tutorialStep === 1) {
            if (liveHand && isOpenPalm(liveHand)) {
                gameState.tutorialStep = 2;
                gameState.baseInstruction = "ОБУЧЕНИЕ 2/3: Щипком перетащи БЛОК в ЦЕЛЬ!";
                modeIndicator.innerText = "ОБУЧЕНИЕ 2/3";
            }
        } else if (gameState.tutorialStep === 2) {
            handleTutorialDrag(canvasCtx, canvasElement.width, canvasElement.height, liveHand);
            if (!tutorialBox.grabbedBy) {
                const dist = Math.sqrt(Math.pow(tutorialBox.x - tutorialTarget.x, 2) + Math.pow(tutorialBox.y - tutorialTarget.y, 2));
                if (dist < tutorialTarget.radius) {
                    gameState.tutorialStep = 3;
                    gameState.baseInstruction = "ОБУЧЕНИЕ 3/3: Сожми КУЛАК и держи его (сброс петли)!";
                    modeIndicator.innerText = "ОБУЧЕНИЕ 3/3";
                }
            }
        }
    } else if (gameState.mode === 'IDLE') {
        if (liveHand && isOpenPalm(liveHand)) {
            gameState.mode = 'RECORDING';
            gameState.recordStartTime = now;
            gameState.frames = [];
            resetLevel();
            
            modeIndicator.innerText = `🔴 ЗАПИСЬ (10с)`;
            modeIndicator.className = "status-box text-2xl font-bold text-red-500 recording";
            gameState.baseInstruction = "Потяни <b class='text-red-400'>РЫЧАГ</b> вниз и держи его! (10 сек)";
        }
    } 
    else if (gameState.mode === 'RECORDING') {
        const timeLeft = Math.ceil((gameState.RECORD_DURATION - (now - gameState.recordStartTime))/1000);
        modeIndicator.innerText = `🔴 ЗАПИСЬ: ${timeLeft}с`;

        if (now - gameState.recordStartTime > gameState.RECORD_DURATION) {
            gameState.mode = 'PLAYING';
            gameState.currentFrame = 0;
            resetLevel();
            
            modeIndicator.innerText = "👻 ПЕТЛЯ";
            modeIndicator.className = "status-box text-2xl font-bold text-cyan-400 playing";
            gameState.baseInstruction = "Клон держит рычаг. А ТЫ хватай человечка и тащи к <b class='text-green-400'>ДВЕРИ</b>!";
        } else {
            gameState.frames.push(liveHand ? JSON.parse(JSON.stringify(liveHand)) : null); 
        }
    }
    else if (gameState.mode === 'PLAYING') {
        const ghostHand = gameState.frames[gameState.currentFrame];
        
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, ghostHand, 'ghost');
        
        if (ghostHand) {
            drawConnectors(canvasCtx, ghostHand, HAND_CONNECTIONS, {color: '#06b6d4', lineWidth: 4});
            drawLandmarks(canvasCtx, ghostHand, {color: '#ffffff', lineWidth: 2, radius: 4});
        }
        
        gameState.currentFrame++;
        if (gameState.currentFrame >= gameState.frames.length) {
            gameState.mode = 'IDLE';
            resetLevel();
            modeIndicator.innerText = "ПРОВАЛ...";
            modeIndicator.className = "status-box text-2xl font-bold text-red-500";
            gameState.baseInstruction = "Время вышло! Дверь захлопнулась. Подними ладонь для рестарта.";
        }
    }

    if (gameState.mode !== 'IDLE') {
        handleDragAndDrop(canvasCtx, canvasElement.width, canvasElement.height, liveHand, 'live');
    }

    let currentHint = "";
    if (liveHand) {
        if (gameState.mode === 'TUTORIAL') {
            if (liveHand[0].y > 0.8) {
                currentHint = "Подними руку выше в кадр!";
            }
        } else {
            const isPinch = isPinching(liveHand);
            const px = (liveHand[4].x + liveHand[8].x) / 2;
            const py = (liveHand[4].y + liveHand[8].y) / 2;
            const distMan = Math.sqrt(Math.pow(px - man.x, 2) + Math.pow(py - man.y, 2));
            const distLever = Math.sqrt(Math.pow(px - lever.x, 2) + Math.pow(py - lever.handleY, 2));
            let closestDist = Math.min(distMan, distLever);
            
            const tips = [8, 12, 16, 20];
            const joints = [6, 10, 14, 18];
            const fingerNames = ['указательный', 'средний', 'безымянный', 'мизинец'];
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
                currentHint = "Подними руку выше в кадр, иначе твой клон исчезнет из записи!";
            } else if (isPinch && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING') && man.grabbedBy !== 'live' && lever.grabbedBy !== 'live' && closestDist > 0.15 && closestDist <= 0.30) {
                let target = distMan < distLever ? man : lever;
                let targetName = distMan < distLever ? 'Человечком' : 'Рычагом';
                let targetY = distMan < distLever ? man.y : lever.handleY;
                let dx = px - target.x;
                let dy = py - targetY;
                
                let dirX = dx > 0 ? 'правее' : 'левее'; 
                let dirY = dy > 0 ? 'выше' : 'ниже';
                let moveInstruction = Math.abs(dx) > Math.abs(dy) ? dirX : dirY;
                
                currentHint = `Промах! Ты сжал пальцы рядом с ${targetName}, сдвинь руку ${moveInstruction}!`;
            } else if (gameState.mode === 'IDLE' && straight >= 1 && straight <= 3) {
                currentHint = `Выпрями все пальцы (согнут ${bentFingers.join(', ')}), чтобы начать!`;
            }
        }
    }

    const stableHint = hintStabilizer.update(currentHint);
    instruction.innerHTML = stableHint ? stableHint : gameState.baseInstruction;

    if (liveHand) {
        const isPinch = isPinching(liveHand);
        drawConnectors(canvasCtx, liveHand, HAND_CONNECTIONS, {color: isPinch ? '#facc15' : '#f97316', lineWidth: 5});
        drawLandmarks(canvasCtx, liveHand, {color: '#ffffff', lineWidth: 2, radius: 5});
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

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 1280, height: 720
});
camera.start();
