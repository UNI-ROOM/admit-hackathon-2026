import { initializeAccount, showResult, saveProgress, closePanel, panelOpen, handleDwell } from './ui/account';
import './style.css';
import { StateStabilizer, isFist, isOpenPalm, isPinching, isPointing, drawUnmirroredText } from './utils';
import { 
    gameState, man, lever, tutorialBox, tutorialTarget, 
    resetLevel, drawWorld, handleDragAndDrop, drawTutorial, handleTutorialDrag, evaluateRules,
    getAgentColor, plate, prism, deathBanner, levers
} from './game';
import { LEVELS } from './levels';
import { playSfx, unlockAudioContext } from './audio';

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
const levelSwitcher = document.getElementById('level-switcher') as HTMLSelectElement;
let wonTimeout: any = null;

function getIdleInstruction(level: number): string {
    const config = LEVELS[level - 1];
    return config?.hintIdle || "Уровень загружен! Соедини пальцы (щипок), чтобы схватить объекты. Покажи ладонь, чтобы начать!";
}

if (levelSwitcher) {
    const tutOption = document.createElement('option');
    tutOption.value = '0';
    tutOption.text = 'Обучение';
    levelSwitcher.appendChild(tutOption);
    
    LEVELS.forEach((lvl, index) => {
        const option = document.createElement('option');
        option.value = (index + 1).toString();
        option.text = lvl.title;
        levelSwitcher.appendChild(option);
    });

    levelSwitcher.value = gameState.mode === 'TUTORIAL' ? '0' : gameState.currentLevel.toString();

    levelSwitcher.addEventListener('change', (e) => {
        unlockAudioContext();
        closePanel();
        gameState.deaths = 0; gameState.resets = 0; gameState.attemptStart = 0;
        if (gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 4) void saveProgress({ tutorialDone: true });
        const target = e.target as HTMLSelectElement;
        const levelIndex = parseInt(target.value, 10);
        
        if (wonTimeout) {
            clearTimeout(wonTimeout);
            wonTimeout = null;
            gameState['wonTimeoutSet'] = false;
        }

        gameState.recordedEchoes = [];
        gameState.echoIndex = 0;
        gameState.currentFrame = 0;

        if (levelIndex === 0) {
            gameState.currentLevel = 1;
            gameState.mode = 'TUTORIAL';
            gameState.tutorialStep = 1;
            resetLevel();
            gameState.baseInstruction = "ОБУЧЕНИЕ 1/4: Покажи полностью открытую ладонь!";
            instruction.innerHTML = gameState.baseInstruction;
            modeIndicator.innerText = "ОБУЧЕНИЕ 1/4";
            modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px] text-yellow-400";
            const titleEl = document.getElementById('level-title');
            if (titleEl) titleEl.innerText = "Обучение";
        } else {
            gameState.currentLevel = levelIndex;
            gameState.mode = 'IDLE';
            gameState.tutorialStep = 0; // not in tutorial anymore (0 = cleared)
            
            resetLevel();
            
            modeIndicator.innerText = "ОЖИДАНИЕ...";
            modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
            gameState.baseInstruction = getIdleInstruction(levelIndex);
            instruction.innerHTML = gameState.baseInstruction;
            
            const titleEl = document.getElementById('level-title');
            if (titleEl) {
                titleEl.innerText = LEVELS[levelIndex - 1].title;
            }
        }
    });
}


function resizeCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const fistStabilizer = new StateStabilizer(150, false);
const hintStabilizer = new StateStabilizer(15, "");
// 4th gesture (index finger pointing) is debounced so camera flicker cannot reset the 1s dwell timer
const pointingStabilizer = new StateStabilizer(5, false);

let hoveredButtonIndex: number | null = null;
let hoverStartTime: number = 0;
let lastHudRenderTime: number = 0;

function drawAndHandleLevelHUD(ctx: CanvasRenderingContext2D, w: number, h: number, liveHand: any, now: number) {
    // The HUD is only drawn in IDLE and tutorial steps 1/4: if it was not rendered for a
    // while (mode/step switch), drop any stale hover so the dwell timer starts from zero.
    if (lastHudRenderTime > 0 && now - lastHudRenderTime > 200) {
        hoveredButtonIndex = null;
    }
    lastHudRenderTime = now;

    const buttons = [
        { label: 'ОБУЧЕНИЕ', value: 0 },
        ...LEVELS.map((_lvl, index) => ({ label: `УРОВЕНЬ ${index + 1}`, value: index + 1 })),
    ];
    
    const btnW = Math.min(140, (w - 40) / buttons.length - 12);
    const btnH = 50;
    const gap = 12;
    const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
    const startX = (w - totalW) / 2;
    const btnY = 170;
    
    const isTutorialStep4 = gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 4;
    const isPointingNow = liveHand ? pointingStabilizer.update(isPointing(liveHand)) : pointingStabilizer.update(false);
    // In tutorial step 4 the level menu only reacts to the 4th gesture (index finger pointing);
    // in IDLE the cursor stays available with any hand pose, as before.
    const cursorActive = !isTutorialStep4 || isPointingNow;

    let cursorX = -1;
    let cursorY = -1;
    let isPinch = false;
    
    if (liveHand) {
        cursorX = liveHand[8].x * w;
        cursorY = liveHand[8].y * h;
        isPinch = isPinching(liveHand);
        
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, cursorActive ? 12 : 10, 0, 2 * Math.PI);
        ctx.fillStyle = cursorActive ? (isPointingNow ? 'rgba(74, 222, 128, 0.9)' : 'rgba(6, 182, 212, 0.8)') : 'rgba(120, 120, 120, 0.5)';
        ctx.fill();
        ctx.strokeStyle = cursorActive ? '#fff' : '#666';
        ctx.stroke();
        
        if (isTutorialStep4) {
            const label = isPointingNow ? '☝️ КУРСОР АКТИВЕН' : 'Покажи УКАЗАТЕЛЬНЫЙ ПАЛЕЦ 👆';
            drawUnmirroredText(ctx, label, cursorX, cursorY + 40, 'bold 16px sans-serif', isPointingNow ? '#4ade80' : '#facc15');
        }
    }
    
    let currentHover: number | null = null;
    
    buttons.forEach((btn, i) => {
        const btnX = startX + i * (btnW + gap);
        const isHovered = cursorActive && cursorX >= btnX && cursorX <= btnX + btnW && cursorY >= btnY && cursorY <= btnY + btnH;
        
        if (isHovered) currentHover = i;
        
        ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(btnX, btnY, btnW, btnH);
        
        ctx.strokeStyle = isHovered ? '#06b6d4' : '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        
        const textColor = isHovered ? '#000' : '#fff';
        drawUnmirroredText(ctx, btn.label, btnX + btnW / 2, btnY + 32, 'bold 16px sans-serif', textColor);
    });

    if (currentHover !== null) {
        if (hoveredButtonIndex !== currentHover) {
            hoveredButtonIndex = currentHover;
            hoverStartTime = now;
        } else {
            const dwellTime = now - hoverStartTime;
            if (dwellTime >= 1000 || isPinch) {
                const selectedBtn = buttons[currentHover];
                if (levelSwitcher) {
                    levelSwitcher.value = selectedBtn.value.toString();
                    levelSwitcher.dispatchEvent(new Event('change'));
                }
                try { playSfx('win'); } catch(e) {}
                hoveredButtonIndex = null;
            } else {
                const progress = dwellTime / 1000;
                const btnX = startX + currentHover * (btnW + gap);
                ctx.beginPath();
                ctx.arc(btnX + btnW / 2, btnY + btnH + 20, 15, -Math.PI/2, -Math.PI/2 + 2 * Math.PI * progress);
                ctx.strokeStyle = '#06b6d4';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
    } else {
        hoveredButtonIndex = null;
    }
}

function onResults(results: any) {
    handleDwell(results.multiHandLandmarks?.[0] || null);
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (gameState.mode === 'WON') {
        drawWorld(canvasCtx, canvasElement.width, canvasElement.height);
        canvasCtx.restore();
        modeIndicator.innerText = "УСПЕХ!";
        modeIndicator.className = "status-box text-2xl font-bold text-green-400 playing";
        instruction.innerHTML = "🏆 ГЕНИАЛЬНО! Вы и ваши клоны спасли его!";
        
        // Reset after 5 seconds
        if (!gameState['wonTimeoutSet']) {
            gameState['wonTimeoutSet'] = true;
            playSfx('win');
            const nextLevel = () => {
                if (wonTimeout) clearTimeout(wonTimeout);
                closePanel();
                gameState.deaths = 0; gameState.resets = 0; gameState.attemptStart = 0;
                wonTimeout = null;
                gameState.currentLevel = Math.min(gameState.currentLevel + 1, LEVELS.length);
                gameState.mode = 'IDLE';
                gameState.recordedEchoes = [];
                gameState.echoIndex = 0;
                resetLevel();
                modeIndicator.innerText = "ОЖИДАНИЕ...";
                modeIndicator.className = "status-box text-2xl font-bold flex items-center justify-center min-w-[250px]";
                gameState.baseInstruction = getIdleInstruction(gameState.currentLevel);
                instruction.innerHTML = gameState.baseInstruction;
                
                const titleEl = document.getElementById('level-title');
                if (titleEl) {
                    const lvlIdx = Math.min(gameState.currentLevel - 1, LEVELS.length - 1);
                    titleEl.innerText = LEVELS[lvlIdx].title;
                }
                
                if (levelSwitcher) {
                    levelSwitcher.value = Math.min(gameState.currentLevel, LEVELS.length).toString();
                }
                
                gameState['wonTimeoutSet'] = false;
            };
            wonTimeout = setTimeout(nextLevel, 8000);
            const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);
            void showResult({ levelId: gameState.currentLevel, timeLeftMs: Math.max(0, gameState.RECORD_DURATION * (1 - gameState.currentFrame / maxFrames)), echoesUsed: gameState.recordedEchoes.filter(e => e.some(Boolean)).length, deaths: gameState.deaths, resets: gameState.resets }, nextLevel);
        }
        return;
    }

    if (panelOpen()) { drawWorld(canvasCtx, canvasElement.width, canvasElement.height); canvasCtx.restore(); return; }

    const liveHand = results.multiHandLandmarks ? results.multiHandLandmarks[0] : null;
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
                gameState.baseInstruction = "ОБУЧЕНИЕ 4/4: Вытяни УКАЗАТЕЛЬНЫЙ ПАЛЕЦ 👆 и наведи на «УРОВЕНЬ 1» сверху, удерживай 1 сек!";
                modeIndicator.innerText = "ОБУЧЕНИЕ 4/4";
            } else {
                gameState.resets++;
                gameState.mode = 'IDLE';
                resetLevel();
                modeIndicator.innerText = "ОЖИДАНИЕ...";
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
            
            let text = gameState.mode === 'TUTORIAL' ? 'ОТЛИЧНО!' : 'СБРОС ПЕТЛИ';
            drawUnmirroredText(canvasCtx, text, px, py - 80, 'bold 24px sans-serif', '#ef4444');
        }
    }

    if (gameState.mode === 'TUTORIAL') {
        if (gameState.tutorialStep === 1) {
            if (liveHand && isOpenPalm(liveHand)) {
                gameState.tutorialStep = 2;
                gameState.baseInstruction = "ОБУЧЕНИЕ 2/4: Щипком перетащи БЛОК в ЦЕЛЬ!";
                modeIndicator.innerText = "ОБУЧЕНИЕ 2/4";
            }
        } else if (gameState.tutorialStep === 2) {
            handleTutorialDrag(canvasCtx, canvasElement.width, canvasElement.height, liveHand);
            if (!tutorialBox.grabbedBy) {
                const dist = Math.sqrt(Math.pow(tutorialBox.x - tutorialTarget.x, 2) + Math.pow(tutorialBox.y - tutorialTarget.y, 2));
                if (dist < tutorialTarget.radius) {
                    gameState.tutorialStep = 3;
                    gameState.baseInstruction = "ОБУЧЕНИЕ 3/4: Сожми КУЛАК и держи его (сброс петли)!";
                    modeIndicator.innerText = "ОБУЧЕНИЕ 3/4";
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
                modeIndicator.innerText = `🔴 ЗАПИСЬ 1/${gameState.maxEchoes} (10с)`;
            } else {
                modeIndicator.innerText = `🔴 ЗАПИСЬ (10с)`;
            }
            modeIndicator.className = "status-box text-2xl font-bold text-red-500 recording";
            const config = LEVELS[gameState.currentLevel - 1];
            if (Array.isArray(config?.hintRecording)) {
                gameState.baseInstruction = config.hintRecording[0] || "Продолжай запись!";
            } else {
                gameState.baseInstruction = (config?.hintRecording as string) || "Продолжай запись!";
            }
            instruction.innerHTML = gameState.baseInstruction;
        }
    } 
    else if (gameState.mode === 'RECORDING') {
        const timeLeft = Math.ceil((gameState.RECORD_DURATION - (now - gameState.recordStartTime))/1000);
        if (gameState.maxEchoes > 1) {
            modeIndicator.innerText = `🔴 ЗАПИСЬ ${gameState.echoIndex + 1}/${gameState.maxEchoes}: ${timeLeft}с`;
        } else {
            modeIndicator.innerText = `🔴 ЗАПИСЬ: ${timeLeft}с`;
        }

        if (now - gameState.recordStartTime > gameState.RECORD_DURATION) {
            if (gameState.echoIndex + 1 < gameState.maxEchoes) {
                gameState.echoIndex++;
                gameState.recordedEchoes[gameState.echoIndex] = [];
                gameState.recordStartTime = now;
                gameState.currentFrame = 0;
                resetLevel();
                
                modeIndicator.innerText = `🔴 ЗАПИСЬ ${gameState.echoIndex + 1}/${gameState.maxEchoes} (10с)`;
                const config = LEVELS[gameState.currentLevel - 1];
                if (Array.isArray(config?.hintRecording) && config.hintRecording.length > gameState.echoIndex) {
                    gameState.baseInstruction = config.hintRecording[gameState.echoIndex];
                } else {
                    gameState.baseInstruction = `ЭХО ${gameState.echoIndex + 1}/${gameState.maxEchoes}: Продолжай запись! (10 сек)`;
                }
                instruction.innerHTML = gameState.baseInstruction;
            } else {
                gameState.mode = 'PLAYING';
                gameState.playStartTime = now;
                gameState.currentFrame = 0;
                resetLevel();
                
                modeIndicator.innerText = "👻 ПЕТЛЯ";
                modeIndicator.className = "status-box text-2xl font-bold text-cyan-400 playing";
                const config = LEVELS[gameState.currentLevel - 1];
                gameState.baseInstruction = config?.hintPlaying || "Хватай человечка и тащи к ДВЕРИ!";
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
                    drawConnectors(canvasCtx, prevHand, HAND_CONNECTIONS, {color: ghostColor, lineWidth: 4});
                    drawLandmarks(canvasCtx, prevHand, {color: '#ffffff', lineWidth: 2, radius: 4});
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
                drawConnectors(canvasCtx, ghostHand, HAND_CONNECTIONS, {color: ghostColor, lineWidth: 4});
                drawLandmarks(canvasCtx, ghostHand, {color: '#ffffff', lineWidth: 2, radius: 4});
            }
        }
        
        gameState.currentFrame++;
        if (gameState.currentFrame >= maxFrames) {
            gameState.mode = 'IDLE';
            gameState.recordedEchoes = [];
            gameState.echoIndex = 0;
            resetLevel();
            gameState.resets++;
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
            const distLever = lever.x >= 0 ? Math.sqrt(Math.pow(px - lever.x, 2) + Math.pow(py - lever.handleY, 2)) : 999;
            const distPlate = plate ? Math.sqrt(Math.pow(px - plate.x, 2) + Math.pow(py - plate.y, 2)) : 999;
            const distPrism = prism ? Math.sqrt(Math.pow(px - prism.x, 2) + Math.pow(py - prism.y, 2)) : 999;
            let closestDist = Math.min(distMan, distLever, distPlate, distPrism);
            
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
            } else if (isPinch && (gameState.mode === 'RECORDING' || gameState.mode === 'PLAYING') && 
                       man.grabbedBy !== 'live' && 
                       lever.grabbedBy !== 'live' && 
                       (!plate || plate.grabbedBy !== 'live') && 
                       (!prism || prism.grabbedBy !== 'live') && 
                       closestDist > 0.15 && closestDist <= 0.30) {
                let targetName = 'Человечком';
                let targetX = man.x;
                let targetY = man.y;
                if (closestDist === distLever) {
                    targetName = 'Рычагом';
                    targetX = lever.x;
                    targetY = lever.handleY;
                } else if (closestDist === distPlate && plate) {
                    targetName = 'Щитом';
                    targetX = plate.x;
                    targetY = plate.y;
                } else if (closestDist === distPrism && prism) {
                    targetName = 'Призмой';
                    targetX = prism.x;
                    targetY = prism.y;
                }
                let dx = px - targetX;
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

    const levelConfig = LEVELS[gameState.currentLevel - 1];
    if (gameState.mode === 'PLAYING' || gameState.mode === 'RECORDING') {
        if (levelConfig.pit && plate) {
            const center = (levelConfig.pit.minX + levelConfig.pit.maxX) / 2;
            if (plate.y < 0.75) currentHint = `Мост слишком высоко: опусти на ${Math.round((0.8 - plate.y) * canvasElement.height)} px.`;
            else if (Math.abs(plate.x - center) > 0.03) currentHint = `Сдвинь мост к центру пропасти на ${Math.round(Math.abs(plate.x - center) * canvasElement.width)} px.`;
            else if (!plate.grabbedBy) currentHint = 'Мост нужно держать — запиши клона со щипком.';
        }
        if (levelConfig.levers) {
            const inactive = levers.findIndex(l => !l.active);
            if (inactive >= 0 && (gameState.mode === 'PLAYING' || gameState.echoIndex > 0)) {
                const l = levers[inactive];
                currentHint = `Рычаг ${inactive === 0 ? 'A' : 'B'} не дожат: потяни вниз ещё на ${Math.max(0, Math.round((l.y + 0.18 - l.handleY) * canvasElement.height))} px. Клон ${inactive + 1} должен держать его всю петлю.`;
            }
        }
    }

    if (deathBanner.text && Date.now() < deathBanner.until) {
        instruction.innerHTML = `<b class='text-red-500'>${deathBanner.text}</b>`;
    } else {
        const stableHint = hintStabilizer.update(currentHint);
        instruction.innerHTML = stableHint ? stableHint : gameState.baseInstruction;
    }

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

    if (gameState.mode === 'IDLE' || (gameState.mode === 'TUTORIAL' && (gameState.tutorialStep === 1 || gameState.tutorialStep === 4))) {
        drawAndHandleLevelHUD(canvasCtx, canvasElement.width, canvasElement.height, liveHand, now);
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
void (async () => {
    const saved = await initializeAccount();
    if (saved?.progress.tutorial_done) {
        levelSwitcher.value = String(Math.min(saved.progress.max_level, LEVELS.length));
        levelSwitcher.dispatchEvent(new Event('change'));
    }
    try { await camera.start(); }
    catch { instruction.textContent = 'Камера недоступна. Разреши доступ к камере и перезагрузи страницу (нужен HTTPS или localhost).'; }
})();
