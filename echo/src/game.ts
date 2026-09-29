import { GameState, Man, Lever, Door, TutorialBox, TutorialTarget, Laser, Plate } from './types';
import { drawUnmirroredText, isPinching } from './utils';
import { LEVELS } from './levels';

export const gameState: GameState = {
    mode: 'TUTORIAL', 
    tutorialStep: 1,
    frames: [], 
    recordedEchoes: [],
    echoIndex: 0,
    maxEchoes: 1,
    playStartTime: 0,
    currentFrame: 0,
    recordStartTime: 0,
    RECORD_DURATION: 10000,
    currentLevel: 1,
    baseInstruction: "ОБУЧЕНИЕ 1/3: Покажи полностью открытую ладонь!"
};

export function getAgentColor(agentId: string): string {
    if (agentId === 'ghost_0' || agentId === 'ghost') return '#06b6d4';
    if (agentId === 'ghost_1') return '#a855f7';
    if (agentId === 'ghost_2') return '#3b82f6';
    if (agentId === 'live') return '#f97316';
    return '#f97316';
}

export function getAgentAlphaColor(agentId: string): string {
    if (agentId === 'ghost_0' || agentId === 'ghost') return 'rgba(6, 182, 212, 0.3)';
    if (agentId === 'ghost_1') return 'rgba(168, 85, 247, 0.3)';
    if (agentId === 'ghost_2') return 'rgba(59, 130, 246, 0.3)';
    if (agentId === 'live') return 'rgba(249, 115, 22, 0.3)';
    return 'rgba(249, 115, 22, 0.3)';
}

export function getAgentName(agentId: string): string {
    if (agentId === 'ghost_0' || agentId === 'ghost') return 'Клон 1';
    if (agentId === 'ghost_1') return 'Клон 2';
    if (agentId === 'ghost_2') return 'Клон 3';
    if (agentId === 'live') return 'Вы';
    return agentId;
}

export let man: Man = { x: 0.5, y: 0.8, grabbedBy: null, color: '#facc15' }; 
export let lever: Lever = { x: 0.8, y: 0.3, handleY: 0.3, grabbedBy: null, active: false };
export let door: Door = { x: 0.2, y: 0.2, width: 0.15, height: 0.15, open: false };

export let tutorialBox: TutorialBox = { x: 0.3, y: 0.5, grabbedBy: null };
export let tutorialTarget: TutorialTarget = { x: 0.7, y: 0.5, radius: 0.1 };

export let laser: Laser | null = null;
export let plate: Plate | null = null;

export function resetLevel() {
    const levelIndex = Math.min(gameState.currentLevel - 1, LEVELS.length - 1);
    const lvl = LEVELS[levelIndex];
    gameState.maxEchoes = lvl.maxEchoes || 1;
    man = { x: lvl.man.x, y: Math.min(lvl.man.y, 0.8), grabbedBy: null, color: '#facc15' };
    
    if (lvl.lever) {
        lever = { x: lvl.lever.x, y: lvl.lever.y, handleY: lvl.lever.y, grabbedBy: null, active: false };
    } else {
        lever = { x: -1, y: -1, handleY: -1, grabbedBy: null, active: false };
    }
    
    door = { x: lvl.door.x, y: lvl.door.y, width: lvl.door.width, height: lvl.door.height, open: false };
    
    if (lvl.laser) {
        laser = { ...lvl.laser };
    } else {
        laser = null;
    }
    
    if (lvl.plate) {
        plate = { ...lvl.plate, grabbedBy: null };
    } else {
        plate = null;
    }
}

export function drawMan(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, m: Man) {
    const pxX = m.x * canvasWidth;
    const pxY = m.y * canvasHeight;
    const size = 30;

    ctx.beginPath();
    ctx.arc(pxX, pxY - size, size/2, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(pxX, pxY - size/2); 
    ctx.lineTo(pxX, pxY + size);
    ctx.moveTo(pxX - size/1.5, pxY); 
    ctx.lineTo(pxX + size/1.5, pxY);
    ctx.moveTo(pxX, pxY + size); 
    ctx.lineTo(pxX - size/1.5, pxY + size*1.5);
    ctx.moveTo(pxX, pxY + size);
    ctx.lineTo(pxX + size/1.5, pxY + size*1.5);
    ctx.lineWidth = 6;
    ctx.strokeStyle = m.color;
    ctx.stroke();

    if (m.grabbedBy) {
        ctx.beginPath();
        ctx.arc(pxX, pxY, size*2.5, 0, Math.PI * 2);
        ctx.fillStyle = getAgentAlphaColor(m.grabbedBy);
        ctx.fill();
    }
}

export function drawWorld(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
    // Lever
    if (lever.x >= 0) {
        const lvx = lever.x * canvasWidth;
        const lvyTop = lever.y * canvasHeight;
        const lvyBot = (lever.y + 0.2) * canvasHeight;
        const handleY = lever.handleY * canvasHeight;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(lvx - 10, lvyTop, 20, lvyBot - lvyTop);
        ctx.strokeStyle = lever.active ? '#10b981' : '#ef4444';
        ctx.lineWidth = 4;
        ctx.strokeRect(lvx - 10, lvyTop, 20, lvyBot - lvyTop);
        
        ctx.beginPath();
        ctx.arc(lvx, handleY, 20, 0, Math.PI * 2);
        ctx.fillStyle = lever.active ? '#10b981' : '#ef4444';
        ctx.fill();

        if (lever.grabbedBy) {
            ctx.beginPath();
            ctx.arc(lvx, handleY, 40, 0, Math.PI * 2);
            ctx.fillStyle = getAgentAlphaColor(lever.grabbedBy);
            ctx.fill();
        }

        drawUnmirroredText(ctx, 'РЫЧАГ', lvx, lvyTop - 20, '24px sans-serif', 'white');
    }

    // Door
    const doorW = door.width * canvasWidth;
    const doorH = door.height * canvasHeight;
    const doorX = door.x * canvasWidth - doorW/2;
    const doorY = door.y * canvasHeight - doorH/2;
    
    ctx.fillStyle = door.open ? '#4ade80' : '#475569';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.strokeRect(doorX, doorY, doorW, doorH);
    
    drawUnmirroredText(ctx, door.open ? 'ВЫХОД ОТКРЫТ' : 'ЗАКРЫТО', doorX + doorW/2, doorY - 10, '24px sans-serif', 'white');

    // Laser
    if (laser && laser.active) {
        const lx = laser.x * canvasWidth;
        const ly = laser.y * canvasHeight;
        const lw = laser.width * canvasWidth;
        const lh = laser.height * canvasHeight;
        
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(lx - 20, ly - 20, 40, 40);
        
        ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
        ctx.fillRect(lx - lw/2, ly, lw, lh);
        
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 20;
        ctx.fillRect(lx - lw/2, ly, lw, lh);
        ctx.shadowBlur = 0;
    }

    // Plate
    if (plate) {
        const px = plate.x * canvasWidth;
        const py = plate.y * canvasHeight;
        const pw = plate.width * canvasWidth;
        const ph = plate.height * canvasHeight;
        
        ctx.fillStyle = plate.grabbedBy ? (plate.grabbedBy === 'live' ? '#f97316' : '#0ea5e9') : '#0284c7';
        ctx.fillRect(px - pw/2, py - ph/2, pw, ph);
        ctx.strokeStyle = plate.grabbedBy ? getAgentColor(plate.grabbedBy) : '#bae6fd';
        ctx.lineWidth = 3;
        ctx.strokeRect(px - pw/2, py - ph/2, pw, ph);
        
        if (plate.grabbedBy) {
            ctx.beginPath();
            ctx.arc(px, py, pw * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = getAgentAlphaColor(plate.grabbedBy);
            ctx.fill();
        }

        drawUnmirroredText(ctx, 'ЩИТ', px, py - ph/2 - 10, '16px sans-serif', 'white');
    }

    // Man
    drawMan(ctx, canvasWidth, canvasHeight, man);
}

export function handleDragAndDrop(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, handLandmarks: any[] | null, agentId: string) {
    if (!handLandmarks) {
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        if (lever.grabbedBy === agentId) lever.grabbedBy = null;
        if (plate && plate.grabbedBy === agentId) plate.grabbedBy = null;
        return;
    }

    const pinch = isPinching(handLandmarks);
    const px = (handLandmarks[4].x + handLandmarks[8].x) / 2;
    const py = (handLandmarks[4].y + handLandmarks[8].y) / 2;

    if (pinch) {
        let grabbedAnything = (man.grabbedBy === agentId) || (lever.grabbedBy === agentId) || (plate?.grabbedBy === agentId);

        if (!grabbedAnything && !man.grabbedBy) {
            if (Math.sqrt(Math.pow(px - man.x, 2) + Math.pow(py - man.y, 2)) < 0.15) {
                man.grabbedBy = agentId;
                grabbedAnything = true;
            }
        }
        if (!grabbedAnything && lever.x >= 0 && !lever.grabbedBy) {
            if (Math.sqrt(Math.pow(px - lever.x, 2) + Math.pow(py - lever.handleY, 2)) < 0.15) {
                lever.grabbedBy = agentId;
                grabbedAnything = true;
            }
        }
        if (!grabbedAnything && plate && !plate.grabbedBy) {
            if (Math.abs(px - plate.x) < plate.width/2 + 0.1 && Math.abs(py - plate.y) < plate.height/2 + 0.1) {
                plate.grabbedBy = agentId;
                grabbedAnything = true;
            }
        }

        const agentColor = getAgentColor(agentId);
        const agentName = getAgentName(agentId);

        if (man.grabbedBy === agentId) {
            man.x += (px - man.x) * 0.15; 
            man.y += (py - man.y) * 0.15;
            
            ctx.beginPath();
            ctx.moveTo(px * canvasWidth, py * canvasHeight);
            ctx.lineTo(man.x * canvasWidth, man.y * canvasHeight);
            ctx.strokeStyle = agentColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
        }
        if (lever.grabbedBy === agentId) {
            lever.handleY = Math.max(lever.y, Math.min(lever.y + 0.2, py));
            
            ctx.beginPath();
            ctx.moveTo(px * canvasWidth, py * canvasHeight);
            ctx.lineTo(lever.x * canvasWidth, lever.handleY * canvasHeight);
            ctx.strokeStyle = agentColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
        }
        if (plate && plate.grabbedBy === agentId) {
            plate.x += (px - plate.x) * 0.15;
            plate.y += (py - plate.y) * 0.15;
            
            ctx.beginPath();
            ctx.moveTo(px * canvasWidth, py * canvasHeight);
            ctx.lineTo(plate.x * canvasWidth, plate.y * canvasHeight);
            ctx.strokeStyle = agentColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
        }
    } else {
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        if (lever.grabbedBy === agentId) lever.grabbedBy = null;
        if (plate && plate.grabbedBy === agentId) plate.grabbedBy = null;
    }
}

export function drawTutorial(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
    if (gameState.tutorialStep === 2) {
        const tx = tutorialTarget.x * canvasWidth;
        const ty = tutorialTarget.y * canvasHeight;
        const tr = tutorialTarget.radius * Math.min(canvasWidth, canvasHeight);
        
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
        drawUnmirroredText(ctx, 'ЦЕЛЬ', tx, ty - tr - 10, '20px sans-serif', '#4ade80');
        
        const bx = tutorialBox.x * canvasWidth;
        const by = tutorialBox.y * canvasHeight;
        const size = 40;
        
        ctx.fillStyle = tutorialBox.grabbedBy ? '#f97316' : '#facc15';
        ctx.fillRect(bx - size/2, by - size/2, size, size);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - size/2, by - size/2, size, size);
        drawUnmirroredText(ctx, 'БЛОК', bx, by - size/2 - 10, '16px sans-serif', 'white');
    } else if (gameState.tutorialStep === 3) {
        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2;
        drawUnmirroredText(ctx, 'Сожми кулак и держи!', cx, cy, '32px sans-serif', '#ef4444');
    }
}

export function handleTutorialDrag(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, handLandmarks: any[] | null) {
    if (!handLandmarks) {
        tutorialBox.grabbedBy = null;
        return;
    }
    const pinch = isPinching(handLandmarks);
    const px = (handLandmarks[4].x + handLandmarks[8].x) / 2;
    const py = (handLandmarks[4].y + handLandmarks[8].y) / 2;
    
    if (pinch) {
        if (!tutorialBox.grabbedBy) {
            if (Math.sqrt(Math.pow(px - tutorialBox.x, 2) + Math.pow(py - tutorialBox.y, 2)) < 0.15) {
                tutorialBox.grabbedBy = 'live';
            }
        }
        
        if (tutorialBox.grabbedBy === 'live') {
            tutorialBox.x = px;
            tutorialBox.y = py;
            
            ctx.beginPath();
            ctx.moveTo(px * canvasWidth, py * canvasHeight);
            ctx.lineTo(tutorialBox.x * canvasWidth, tutorialBox.y * canvasHeight);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    } else {
        tutorialBox.grabbedBy = null;
    }
}

export function evaluateRules() {
    // Gravity logic
    const floor_y = 0.8;
    if (!man.grabbedBy) {
        if (man.y < floor_y) man.y = Math.min(floor_y, man.y + 0.02);
        else if (man.y > floor_y) man.y = floor_y;
    }
    if (!tutorialBox.grabbedBy) {
        if (tutorialBox.y < floor_y) tutorialBox.y = Math.min(floor_y, tutorialBox.y + 0.02);
        else if (tutorialBox.y > floor_y) tutorialBox.y = floor_y;
    }
    
    if (plate && !plate.grabbedBy) {
        if (plate.y < floor_y) plate.y = Math.min(floor_y, plate.y + 0.02);
        else if (plate.y > floor_y) plate.y = floor_y;
    }

    // Lever logic
    if (lever.x >= 0) {
        if (!lever.grabbedBy && lever.handleY > lever.y) {
            lever.handleY = Math.max(lever.y, lever.handleY - 0.02);
        }
        lever.active = lever.handleY >= lever.y + 0.18; 
        door.open = lever.active;
    } else {
        door.open = true;
    }
    
    // Laser logic
    if (laser) {
        if (laser.active && laser.minX !== undefined && laser.maxX !== undefined) {
            let t = 0;
            if (gameState.mode === 'RECORDING') {
                t = (Date.now() - gameState.recordStartTime) / 1000;
            } else if (gameState.mode === 'PLAYING') {
                const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);
                const progress = maxFrames > 0 ? (gameState.currentFrame / maxFrames) : 0;
                t = progress * (gameState.RECORD_DURATION / 1000);
            } else {
                t = Date.now() / 1000;
            }
            const speed = laser.speed || 1.5;
            const midX = (laser.minX + laser.maxX) / 2;
            const amp = (laser.maxX - laser.minX) / 2;
            laser.x = midX + Math.sin(t * speed) * amp;
        }

        laser.height = 1.0 - laser.y; // Default goes to bottom
        
        if (plate) {
            // Intersects on X?
            if (plate.x - plate.width/2 < laser.x + laser.width/2 && 
                plate.x + plate.width/2 > laser.x - laser.width/2) {
                // Plate is below laser source
                if (plate.y > laser.y) {
                    laser.height = Math.max(0, (plate.y - plate.height/2) - laser.y);
                }
            }
        }
        
        if (laser.active) {
            const hitW = 0.05; 
            const hitH = 0.1; 
            if (Math.abs(man.x - laser.x) < laser.width/2 + hitW) {
                if (man.y > laser.y && man.y - hitH < laser.y + laser.height) {
                    if (gameState.mode === 'PLAYING') {
                        // Man dies -> reset position
                        const lvl = LEVELS[Math.min(gameState.currentLevel - 1, LEVELS.length - 1)];
                        man.x = lvl.man.x;
                        man.y = lvl.man.y;
                        if (man.grabbedBy) man.grabbedBy = null;
                    }
                }
            }
        }
    }

    // Win condition
    if (door.open) {
        if (Math.abs(man.x - door.x) < door.width/2 && Math.abs(man.y - door.y) < door.height/2) {
            if (gameState.mode === 'PLAYING') {
                gameState.mode = 'WON';
                gameState.baseInstruction = "🏆 ГЕНИАЛЬНО! Вы и ваш клон спасли его!";
            }
        }
    }
}
