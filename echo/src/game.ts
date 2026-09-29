import { GameState, Man, Lever, Door, TutorialBox, TutorialTarget, Laser, Plate, Crystal, Prism, ReflectedLaser } from './types';
import { drawUnmirroredText, isPinching } from './utils';
import { LEVELS } from './levels';
import { playSfx } from './audio';

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
export let crystal: Crystal | null = null;
export let prism: Prism | null = null;
export let reflectedLaser: ReflectedLaser = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
export let deathBanner: { text: string; until: number } = { text: '', until: 0 };

// --- Particle System ---
export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    alpha: number;
    decay: number;
}
export const particles: Particle[] = [];
const MAX_PARTICLES = 250;

export function spawnSparks(x: number, y: number, count: number = 5, baseColor: string = '#f59e0b') {
    for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.002 + Math.random() * 0.005;
        particles.push({
            x: x + (Math.random() - 0.5) * 0.02,
            y: y + (Math.random() - 0.5) * 0.02,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2 + Math.random() * 3,
            color: baseColor,
            alpha: 1.0,
            decay: 0.03 + Math.random() * 0.04
        });
    }
}

export function spawnChargeMotes(x: number, y: number, count: number = 3) {
    for (let i = 0; i < count; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        particles.push({
            x: x + (Math.random() - 0.5) * 0.05,
            y: y + (Math.random() - 0.5) * 0.05,
            vx: (Math.random() - 0.5) * 0.002,
            vy: -0.001 - Math.random() * 0.003,
            size: 3 + Math.random() * 4,
            color: Math.random() > 0.3 ? '#38bdf8' : '#e0f2fe',
            alpha: 0.9,
            decay: 0.015 + Math.random() * 0.02
        });
    }
}

export function spawnBurnExplosion(x: number, y: number) {
    const colors = ['#ef4444', '#f97316', '#fbbf24', '#78716c', '#44403c'];
    for (let i = 0; i < 40; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.003 + Math.random() * 0.008;
        particles.push({
            x: x + (Math.random() - 0.5) * 0.03,
            y: y + (Math.random() - 0.5) * 0.03,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.002,
            size: 4 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1.0,
            decay: 0.02 + Math.random() * 0.02
        });
    }
}

export function spawnConfetti(_width: number, _height: number) {
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308', '#f97316'];
    for (let i = 0; i < 4; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        particles.push({
            x: Math.random(),
            y: -0.02,
            vx: (Math.random() - 0.5) * 0.003,
            vy: 0.003 + Math.random() * 0.006,
            size: 4 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1.0,
            decay: 0.004 + Math.random() * 0.004
        });
    }
}

export function updateAndDrawParticles(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

let lastDeathTime = 0;
export function triggerManDeath(message: string = 'ЧЕЛОВЕЧЕК СГОРЕЛ! 🔥 ПЕРЕЗАПУСК...') {
    const now = Date.now();
    if (now - lastDeathTime < 1000) return;
    lastDeathTime = now;

    playSfx('burn');
    spawnBurnExplosion(man.x, man.y);
    deathBanner = { text: message, until: now + 1600 };

    const lvl = LEVELS[Math.min(gameState.currentLevel - 1, LEVELS.length - 1)];
    man.x = lvl.man.x;
    man.y = lvl.man.y;
    man.grabbedBy = null;

    if (gameState.mode === 'PLAYING') {
        gameState.currentFrame = 0;
        if (lvl.plate && plate) {
            plate.x = lvl.plate.x;
            plate.y = lvl.plate.y;
            plate.grabbedBy = null;
        }
        if (lvl.prism && prism) {
            prism.x = lvl.prism.x;
            prism.y = lvl.prism.y;
            prism.grabbedBy = null;
        }
        if (crystal) {
            crystal.charge = 0;
            crystal.charged = false;
        }
    }
}

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

    if (lvl.crystal) {
        crystal = {
            x: lvl.crystal.x,
            y: lvl.crystal.y,
            baseY: lvl.crystal.y,
            width: lvl.crystal.width,
            height: lvl.crystal.height,
            charge: 0,
            charged: false,
            grabbedBy: null
        };
    } else {
        crystal = null;
    }

    if (lvl.prism) {
        prism = {
            x: lvl.prism.x,
            y: lvl.prism.y,
            width: lvl.prism.width,
            height: lvl.prism.height,
            direction: lvl.prism.direction,
            grabbedBy: null
        };
    } else {
        prism = null;
    }

    reflectedLaser = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
    deathBanner = { text: '', until: 0 };
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

    // Laser (Vertical beam)
    if (laser && laser.active) {
        const lx = laser.x * canvasWidth;
        const ly = laser.y * canvasHeight;
        const lw = laser.width * canvasWidth;
        const lh = laser.height * canvasHeight;
        
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(lx - 20, ly - 20, 40, 40);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx - 20, ly - 20, 40, 40);
        
        ctx.save();
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillRect(lx - lw/2, ly, lw, lh);

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#fca5a5';
        ctx.shadowBlur = 8;
        ctx.fillRect(lx - lw * 0.18, ly, lw * 0.36, lh);
        ctx.restore();
    }

    // Reflected Laser (Horizontal beam)
    if (reflectedLaser.active) {
        const sx = reflectedLaser.startX * canvasWidth;
        const sy = reflectedLaser.startY * canvasHeight;
        const ex = reflectedLaser.endX * canvasWidth;
        const ey = reflectedLaser.endY * canvasHeight;

        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        ctx.shadowColor = '#bae6fd';
        ctx.shadowBlur = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.restore();
    }

    // Plate (Shield)
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

    // Prism
    if (prism) {
        const px = prism.x * canvasWidth;
        const py = prism.y * canvasHeight;
        const pw = prism.width * canvasWidth;
        const ph = prism.height * canvasHeight;

        ctx.save();
        ctx.beginPath();
        if (prism.direction === 'left') {
            ctx.moveTo(px + pw / 2, py - ph / 2);
            ctx.lineTo(px + pw / 2, py + ph / 2);
            ctx.lineTo(px - pw / 2, py + ph / 2);
        } else {
            ctx.moveTo(px - pw / 2, py - ph / 2);
            ctx.lineTo(px - pw / 2, py + ph / 2);
            ctx.lineTo(px + pw / 2, py + ph / 2);
        }
        ctx.closePath();

        const glassGrad = ctx.createLinearGradient(px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2);
        glassGrad.addColorStop(0, 'rgba(224, 242, 254, 0.75)');
        glassGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
        glassGrad.addColorStop(1, 'rgba(14, 165, 233, 0.75)');
        ctx.fillStyle = glassGrad;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.fill();

        ctx.strokeStyle = prism.grabbedBy ? getAgentColor(prism.grabbedBy) : '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Diagonal reflective glint
        ctx.beginPath();
        if (prism.direction === 'left') {
            ctx.moveTo(px + pw * 0.25, py - ph * 0.25);
            ctx.lineTo(px - pw * 0.25, py + ph * 0.25);
        } else {
            ctx.moveTo(px - pw * 0.25, py - ph * 0.25);
            ctx.lineTo(px + pw * 0.25, py + ph * 0.25);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (prism.grabbedBy) {
            ctx.beginPath();
            ctx.arc(px, py, pw * 0.75, 0, Math.PI * 2);
            ctx.fillStyle = getAgentAlphaColor(prism.grabbedBy);
            ctx.fill();
        }
        ctx.restore();

        drawUnmirroredText(ctx, 'ПРИЗМА', px, py - ph / 2 - 12, 'bold 16px sans-serif', '#38bdf8');
    }

    // Crystal
    if (crystal) {
        const hoverOffset = Math.sin(Date.now() * 0.003) * 0.012;
        const cyNorm = (crystal.baseY ?? crystal.y) + hoverOffset;
        const cx = crystal.x * canvasWidth;
        const cy = cyNorm * canvasHeight;
        const cw = crystal.width * canvasWidth;
        const ch = crystal.height * canvasHeight;

        ctx.save();

        // Pulsating glow and expanding energy rings when charged / charging
        if (crystal.charge > 0) {
            const pulse = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
            const ringRadius = cw * (0.6 + pulse * 0.3 * crystal.charge);
            ctx.beginPath();
            ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${(0.6 * crystal.charge * (1 - pulse * 0.5)).toFixed(2)})`;
            ctx.lineWidth = 2 + 3 * crystal.charge;
            ctx.stroke();

            ctx.shadowColor = crystal.charged ? '#00f5ff' : '#38bdf8';
            ctx.shadowBlur = 15 + 20 * crystal.charge;
        }

        // Progress ring
        const progressRadius = Math.max(cw, ch) * 0.65;
        ctx.beginPath();
        ctx.arc(cx, cy, progressRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * crystal.charge);
        ctx.strokeStyle = crystal.charged ? '#4ade80' : '#38bdf8';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Faceted Diamond Gemstone
        const top = { x: cx, y: cy - ch / 2 };
        const right = { x: cx + cw / 2, y: cy };
        const bottom = { x: cx, y: cy + ch / 2 };
        const left = { x: cx - cw / 2, y: cy };
        const center = { x: cx, y: cy - ch * 0.08 };

        // Facet 1: Top-Left
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fillStyle = crystal.charged ? '#67e8f9' : '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Facet 2: Top-Right
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fillStyle = crystal.charged ? '#a5f3fc' : '#38bdf8';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Facet 3: Bottom-Left
        ctx.beginPath();
        ctx.moveTo(bottom.x, bottom.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fillStyle = crystal.charged ? '#06b6d4' : '#0369a1';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Facet 4: Bottom-Right
        ctx.beginPath();
        ctx.moveTo(bottom.x, bottom.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineTo(center.x, center.y);
        ctx.closePath();
        ctx.fillStyle = crystal.charged ? '#22d3ee' : '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();

        drawUnmirroredText(ctx, 'КРИСТАЛЛ', cx, cy - ch / 2 - 18, 'bold 18px sans-serif', crystal.charged ? '#38bdf8' : '#94a3b8');
        drawUnmirroredText(ctx, `${Math.round(crystal.charge * 100)}%`, cx, cy + ch / 2 + 24, 'bold 16px sans-serif', crystal.charged ? '#4ade80' : '#38bdf8');
    }

    // Man
    drawMan(ctx, canvasWidth, canvasHeight, man);

    // Death banner
    if (deathBanner.text && Date.now() < deathBanner.until) {
        ctx.save();
        const bw = 560;
        const bh = 60;
        const bx = canvasWidth / 2 - bw / 2;
        const by = canvasHeight * 0.25 - bh / 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);
        drawUnmirroredText(ctx, deathBanner.text, canvasWidth / 2, canvasHeight * 0.25 + 8, 'bold 24px sans-serif', '#ef4444');
        ctx.restore();
    }

    // Particles VFX
    updateAndDrawParticles(ctx, canvasWidth, canvasHeight);

    // Confetti on win
    if (gameState.mode === 'WON') {
        spawnConfetti(canvasWidth, canvasHeight);
    }
}

export function handleDragAndDrop(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, handLandmarks: any[] | null, agentId: string) {
    const wasHolding = (man.grabbedBy === agentId) || 
                       (lever.grabbedBy === agentId) || 
                       (plate?.grabbedBy === agentId) || 
                       (prism?.grabbedBy === agentId);

    if (!handLandmarks) {
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        if (lever.grabbedBy === agentId) lever.grabbedBy = null;
        if (plate && plate.grabbedBy === agentId) plate.grabbedBy = null;
        if (prism && prism.grabbedBy === agentId) prism.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
        return;
    }

    const pinch = isPinching(handLandmarks);
    const px = (handLandmarks[4].x + handLandmarks[8].x) / 2;
    const py = (handLandmarks[4].y + handLandmarks[8].y) / 2;

    if (pinch) {
        let grabbedAnything = wasHolding;

        if (!grabbedAnything && !man.grabbedBy) {
            if (Math.sqrt(Math.pow(px - man.x, 2) + Math.pow(py - man.y, 2)) < 0.15) {
                man.grabbedBy = agentId;
                grabbedAnything = true;
                playSfx('grab');
            }
        }
        if (!grabbedAnything && lever.x >= 0 && !lever.grabbedBy) {
            if (Math.sqrt(Math.pow(px - lever.x, 2) + Math.pow(py - lever.handleY, 2)) < 0.15) {
                lever.grabbedBy = agentId;
                grabbedAnything = true;
                playSfx('grab');
            }
        }
        if (!grabbedAnything && plate && !plate.grabbedBy) {
            if (Math.abs(px - plate.x) < plate.width/2 + 0.1 && Math.abs(py - plate.y) < plate.height/2 + 0.1) {
                plate.grabbedBy = agentId;
                grabbedAnything = true;
                playSfx('grab');
            }
        }
        if (!grabbedAnything && prism && !prism.grabbedBy) {
            if (Math.abs(px - prism.x) < prism.width/2 + 0.1 && Math.abs(py - prism.y) < prism.height/2 + 0.1) {
                prism.grabbedBy = agentId;
                grabbedAnything = true;
                playSfx('grab');
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
        if (prism && prism.grabbedBy === agentId) {
            prism.x += (px - prism.x) * 0.15;
            prism.y += (py - prism.y) * 0.15;
            
            ctx.beginPath();
            ctx.moveTo(px * canvasWidth, py * canvasHeight);
            ctx.lineTo(prism.x * canvasWidth, prism.y * canvasHeight);
            ctx.strokeStyle = agentColor;
            ctx.lineWidth = 4;
            ctx.stroke();
            drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
        }
    } else {
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        if (lever.grabbedBy === agentId) lever.grabbedBy = null;
        if (plate && plate.grabbedBy === agentId) plate.grabbedBy = null;
        if (prism && prism.grabbedBy === agentId) prism.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
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
    const wasHolding = tutorialBox.grabbedBy === 'live';
    if (!handLandmarks) {
        tutorialBox.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
        return;
    }
    const pinch = isPinching(handLandmarks);
    const px = (handLandmarks[4].x + handLandmarks[8].x) / 2;
    const py = (handLandmarks[4].y + handLandmarks[8].y) / 2;
    
    if (pinch) {
        if (!tutorialBox.grabbedBy) {
            if (Math.sqrt(Math.pow(px - tutorialBox.x, 2) + Math.pow(py - tutorialBox.y, 2)) < 0.15) {
                tutorialBox.grabbedBy = 'live';
                playSfx('grab');
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
        if (wasHolding) {
            playSfx('drop');
        }
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

    if (prism && !prism.grabbedBy) {
        if (prism.y < floor_y) prism.y = Math.min(floor_y, prism.y + 0.02);
        else if (prism.y > floor_y) prism.y = floor_y;
    }

    // Lever logic
    if (lever.x >= 0) {
        if (!lever.grabbedBy && lever.handleY > lever.y) {
            lever.handleY = Math.max(lever.y, lever.handleY - 0.02);
        }
        const wasActive = lever.active;
        lever.active = lever.handleY >= lever.y + 0.18;
        if (!wasActive && lever.active) {
            playSfx('switch');
        }
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
        
        // Deflection by Shield (Plate)
        if (plate) {
            if (plate.x - plate.width/2 < laser.x + laser.width/2 && 
                plate.x + plate.width/2 > laser.x - laser.width/2) {
                if (plate.y > laser.y) {
                    laser.height = Math.max(0, (plate.y - plate.height/2) - laser.y);
                    spawnSparks(laser.x, plate.y - plate.height/2, 2, '#38bdf8');
                }
            }
        }

        // Deflection by Prism
        let hitPrism = false;
        if (prism && laser.active) {
            if (Math.abs(laser.x - prism.x) < prism.width / 2 && prism.y > laser.y) {
                hitPrism = true;
                laser.height = Math.max(0, prism.y - laser.y);
                spawnSparks(laser.x, prism.y, 3, '#38bdf8');

                reflectedLaser.active = true;
                reflectedLaser.startX = prism.x;
                reflectedLaser.startY = prism.y;

                if (prism.direction === 'left') {
                    let beamEndX = 0;
                    if (crystal) {
                        const hoverOffset = Math.sin(Date.now() * 0.003) * 0.012;
                        const crystalEffectiveY = (crystal.baseY ?? crystal.y) + hoverOffset;
                        if (Math.abs(prism.y - crystalEffectiveY) < crystal.height / 2) {
                            beamEndX = crystal.x + crystal.width / 2;
                            spawnChargeMotes(crystal.x, crystalEffectiveY, 2);
                            if (!crystal.charged) {
                                playSfx('crystal_charge');
                            }
                            const wasCharged = crystal.charged;
                            crystal.charge = Math.min(1.0, crystal.charge + 0.008);
                            if (crystal.charge >= 1.0) {
                                crystal.charged = true;
                                if (!wasCharged) {
                                    playSfx('crystal_ready');
                                }
                            }
                        } else {
                            if (!crystal.charged) {
                                crystal.charge = Math.max(0, crystal.charge - 0.002);
                            }
                        }
                    }
                    reflectedLaser.endX = beamEndX;
                    reflectedLaser.endY = prism.y;
                } else {
                    let beamEndX = 1.0;
                    if (crystal && crystal.x > prism.x) {
                        const hoverOffset = Math.sin(Date.now() * 0.003) * 0.012;
                        const crystalEffectiveY = (crystal.baseY ?? crystal.y) + hoverOffset;
                        if (Math.abs(prism.y - crystalEffectiveY) < crystal.height / 2) {
                            beamEndX = crystal.x - crystal.width / 2;
                            spawnChargeMotes(crystal.x, crystalEffectiveY, 2);
                            if (!crystal.charged) {
                                playSfx('crystal_charge');
                            }
                            const wasCharged = crystal.charged;
                            crystal.charge = Math.min(1.0, crystal.charge + 0.008);
                            if (crystal.charge >= 1.0) {
                                crystal.charged = true;
                                if (!wasCharged) {
                                    playSfx('crystal_ready');
                                }
                            }
                        } else {
                            if (!crystal.charged) {
                                crystal.charge = Math.max(0, crystal.charge - 0.002);
                            }
                        }
                    }
                    reflectedLaser.endX = beamEndX;
                    reflectedLaser.endY = prism.y;
                }
            }
        }

        if (!hitPrism) {
            reflectedLaser.active = false;
            if (crystal && !crystal.charged) {
                crystal.charge = Math.max(0, crystal.charge - 0.002);
            }
        }
    }

    // Door unlocking logic: requires lever (if present) AND crystal charged (if present)
    door.open = (lever.x < 0 || lever.active) && (!crystal || crystal.charged);

    // Hazard collision & Death mechanics
    let manHitByLaser = false;
    if (laser && laser.active) {
        const hitW = 0.05; 
        const hitH = 0.1; 
        if (Math.abs(man.x - laser.x) < laser.width/2 + hitW) {
            if (man.y > laser.y && man.y - hitH < laser.y + laser.height) {
                manHitByLaser = true;
            }
        }
    }
    if (reflectedLaser.active) {
        const minX = Math.min(reflectedLaser.startX, reflectedLaser.endX);
        const maxX = Math.max(reflectedLaser.startX, reflectedLaser.endX);
        if (man.x >= minX - 0.04 && man.x <= maxX + 0.04) {
            if (Math.abs(man.y - reflectedLaser.startY) < 0.07) {
                manHitByLaser = true;
            }
        }
    }

    if (manHitByLaser) {
        triggerManDeath();
    }

    // Win condition
    if (door.open) {
        if (Math.abs(man.x - door.x) < door.width/2 && Math.abs(man.y - door.y) < door.height/2) {
            if (gameState.mode === 'PLAYING') {
                gameState.mode = 'WON';
                gameState.baseInstruction = "🏆 ГЕНИАЛЬНО! Вы и ваш клон спасли его!";
                playSfx('win');
            }
        }
    }
}
