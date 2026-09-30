import { Entity, GameState, Man, Lever, Door, TutorialBox, TutorialTarget, Laser, Plate, Crystal, Prism, ReflectedLaser } from './types';
import { drawUnmirroredText, isPinching } from './utils';
import { LEVELS, getLevelConfig } from './levels';
import { recordedHands } from './hands';
import { playSfx } from './audio';
import { t } from './i18n';

export const gameState: GameState = {
    difficulty: 'hard', livePlay: false, winTimeLeftMs: null, winEchoesUsed: 0,
    deaths: 0, resets: 0, attemptStart: 0,
    mode: 'TUTORIAL', 
    tutorialStep: 1,
    frames: [], 
    recordedEchoes: [],
    echoIndex: 0,
    recordingHands: 1,
    maxEchoes: 1,
    playStartTime: 0,
    currentFrame: 0,
    recordStartTime: 0,
    RECORD_DURATION: 10000,
    currentLevel: 1,
    baseInstruction: t('tutorial.step1.instruction')
};

export function getAgentColor(agentId: string): string {
    agentId = agentId.replace(/^(ghost_\d+)_1$/, '$1');
    if (agentId === 'ghost_0' || agentId === 'ghost') return '#06b6d4';
    if (agentId === 'ghost_1') return '#a855f7';
    if (agentId === 'ghost_2') return '#3b82f6';
    if (agentId === 'live') return '#f97316';
    if (agentId === 'live_1') return '#22c55e';
    return '#f97316';
}

export function getAgentAlphaColor(agentId: string): string {
    agentId = agentId.replace(/^(ghost_\d+)_1$/, '$1');
    if (agentId === 'ghost_0' || agentId === 'ghost') return 'rgba(6, 182, 212, 0.3)';
    if (agentId === 'ghost_1') return 'rgba(168, 85, 247, 0.3)';
    if (agentId === 'ghost_2') return 'rgba(59, 130, 246, 0.3)';
    if (agentId === 'live') return 'rgba(249, 115, 22, 0.3)';
    if (agentId === 'live_1') return 'rgba(34, 197, 94, 0.3)';
    return 'rgba(249, 115, 22, 0.3)';
}

export function getAgentName(agentId: string): string {
    const recordedSecondHand = /^ghost_(\d+)_1$/.exec(agentId);
    if (recordedSecondHand) return t('agent.cloneHand', { n: Number(recordedSecondHand[1]) + 1 });
    if (agentId === 'ghost_0' || agentId === 'ghost') return t('agent.clone', { n: 1 });
    if (agentId === 'ghost_1') return t('agent.clone', { n: 2 });
    if (agentId === 'ghost_2') return t('agent.clone', { n: 3 });
    if (agentId === 'live') return t('agent.you');
    if (agentId === 'live_1') return t('agent.otherHand');
    return agentId;
}

export let man: Man = { x: 0.5, y: 0.8, grabbedBy: null, color: '#facc15' }; 
export let lever: Lever = { x: 0.8, y: 0.3, handleY: 0.3, grabbedBy: null, active: false };
export let levers: Lever[] = [lever];
export let door: Door = { x: 0.2, y: 0.2, width: 0.15, height: 0.15, open: false };

export let tutorialBox: TutorialBox = { x: 0.3, y: 0.5, grabbedBy: null };
export let tutorialTarget: TutorialTarget = { x: 0.7, y: 0.5, radius: 0.1 };

export let laser: Laser | null = null;
export let laserSafeZones: { x: number; y: number; width: number; height: number }[] = [];
export let plate: Plate | null = null;
export let crystal: Crystal | null = null;
export let prism: Prism | null = null;
export let reflectedLaser: ReflectedLaser = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
export let deathBanner: { text: string; until: number } = { text: '', until: 0 };

type ReplayObject = 'man' | 'plate' | 'prism' | `lever_${number}`;

const recordedObjects = new WeakMap<GameState['recordedEchoes'][number], Map<ReplayObject, string>>();

function reservedBy(objectId: ReplayObject): string | null {
    const count = gameState.mode === 'PLAYING' ? gameState.recordedEchoes.length
        : gameState.mode === 'RECORDING' ? gameState.echoIndex : 0;
    for (let i = 0; i < count; i++) {
        const hand = recordedObjects.get(gameState.recordedEchoes[i])?.get(objectId);
        if (hand) return `ghost_${i}${hand === 'live_1' ? '_1' : ''}`;
    }
    return null;
}

function canGrab(object: Entity, objectId: ReplayObject, agentId: string): boolean {
    if (object.grabbedBy) return false;
    const owner = reservedBy(objectId);
    if (owner && owner !== agentId) return false;

    const ghostIndex = /^ghost_(\d+)(?:_(1))?$/.exec(agentId);
    const objects = ghostIndex ? recordedObjects.get(gameState.recordedEchoes[Number(ghostIndex[1])]) : undefined;
    if (objects) return objects.get(objectId) === (ghostIndex![2] ? 'live_1' : 'live');
    if ((agentId === 'live' || agentId === 'live_1') && gameState.mode === 'RECORDING') {
        const originalHand = recordedObjects.get(gameState.recordedEchoes[gameState.echoIndex])?.get(objectId);
        if (originalHand && originalHand !== agentId) return false;
    }
    return true;
}

export const RESERVE_HOLD_STEPS = 30;
export const RESERVE_MOVE = 0.05;
const pendingGrabs = new Map<string, { objectId: ReplayObject; steps: number; x: number; y: number }>();

function grab(object: Entity, objectId: ReplayObject, agentId: string, px: number, py: number): void {
    object.grabbedBy = agentId;
    if ((agentId === 'live' || agentId === 'live_1') && gameState.mode === 'RECORDING') {
        pendingGrabs.set(agentId, { objectId, steps: 0, x: px, y: py });
    }
    playSfx('grab');
}

function updatePendingGrab(agentId: string, holding: boolean, px: number, py: number): void {
    const pending = pendingGrabs.get(agentId);
    if (!pending) return;
    if (!holding || gameState.mode !== 'RECORDING') {
        pendingGrabs.delete(agentId);
        return;
    }
    pending.steps++;
    if (pending.steps >= RESERVE_HOLD_STEPS || Math.hypot(px - pending.x, py - pending.y) > RESERVE_MOVE) {
        const recording = gameState.recordedEchoes[gameState.echoIndex];
        if (recording) recordedObjects.get(recording)?.set(pending.objectId, agentId);
        pendingGrabs.delete(agentId);
    }
}

export function getActiveLevel() {
    return getLevelConfig(gameState.currentLevel, gameState.difficulty);
}

export function beginRecording(now: number, handCount: number): void {
    if (!gameState.attemptStart) gameState.attemptStart = now;
    gameState.mode = 'RECORDING';
    gameState.livePlay = false;
    gameState.recordStartTime = now;
    gameState.echoIndex = 0;
    gameState.recordedEchoes = [[]];
    gameState.frames = [];
    gameState.currentFrame = 0;
    resetLevel();
    gameState.recordingHands = gameState.difficulty === 'hard' && handCount >= 2 ? 2 : 1;
    gameState.maxEchoes = recordingTarget(gameState.recordingHands);
}

export function beginLivePlay(now: number): void {
    if (!gameState.attemptStart) gameState.attemptStart = now;
    gameState.mode = 'PLAYING';
    gameState.livePlay = true;
    gameState.playStartTime = now;
    gameState.echoIndex = 0;
    gameState.recordedEchoes = [];
    gameState.frames = [];
    gameState.currentFrame = 0;
    resetLevel();
}

export function recordingTarget(handCount: number): number {
    const level = getActiveLevel();
    const hands = gameState.difficulty === 'hard' && handCount >= 2 ? 2 : 1;
    const tasks = (level.levers?.length ?? (level.lever ? 1 : 0)) + Number(!!level.plate) + Number(!!level.prism) + 1;
    return Math.min(level.maxEchoes || 1, Math.max(1, Math.ceil((tasks - hands) / hands)));
}

export function playingTimeLeft(now = Date.now()): number {
    if (gameState.winTimeLeftMs !== null) return gameState.winTimeLeftMs;
    if (gameState.livePlay) return Math.max(0, gameState.RECORD_DURATION - (now - gameState.playStartTime));
    const maxFrames = Math.max(...gameState.recordedEchoes.map(e => e.length), 1);
    return Math.max(0, gameState.RECORD_DURATION * (1 - gameState.currentFrame / maxFrames));
}

export function activeEchoCount(): number {
    const owners = [prism?.grabbedBy, plate?.grabbedBy, ...levers.map(object => object.grabbedBy)];
    return new Set(owners.flatMap(owner => {
        const match = owner && /^ghost_(\d+)(?:_1)?$/.exec(owner);
        return match ? [match[1]] : [];
    })).size;
}

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
export function triggerManDeath(message: string = t('death.default')) {
    const now = Date.now();
    if (now - lastDeathTime < 1000) return;
    lastDeathTime = now;
    gameState.deaths++;

    playSfx('burn');
    spawnBurnExplosion(man.x, man.y);
    deathBanner = { text: message, until: now + 1600 };

    const lvl = getActiveLevel();
    man.x = lvl.man.x;
    man.y = lvl.man.y;
    man.grabbedBy = null;

    if (gameState.mode === 'PLAYING') {
        gameState.currentFrame = 0;
        if (gameState.livePlay) gameState.playStartTime = now;
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

export function resetLevel({ preserveProgress = false }: { preserveProgress?: boolean } = {}) {
    pendingGrabs.clear();
    const keepProgress = preserveProgress && gameState.difficulty === 'hard';
    const completedLevers = keepProgress ? levers.map(object => object.active) : [];
    const chargedCrystal = keepProgress && !!crystal?.charged;
    gameState.winTimeLeftMs = null;
    gameState.winEchoesUsed = 0;
    if (gameState.mode === 'IDLE' || gameState.mode === 'TUTORIAL') gameState.livePlay = false;
    if (gameState.mode === 'IDLE' || gameState.mode === 'TUTORIAL') gameState.recordingHands = 1;
    const levelIndex = Math.min(gameState.currentLevel - 1, LEVELS.length - 1);
    const lvl = getLevelConfig(levelIndex + 1, gameState.difficulty);
    gameState.maxEchoes = lvl.maxEchoes || 1;
    man = { x: lvl.man.x, y: Math.min(lvl.man.y, 0.8), grabbedBy: null, color: '#facc15' };
    
    levers = (lvl.levers || (lvl.lever ? [lvl.lever] : [])).map((p, index) => ({
        ...p, handleY: p.y + (completedLevers[index] ? 0.2 : 0),
        grabbedBy: null, active: !!completedLevers[index]
    }));
    lever = levers[0] || { x: -1, y: -1, handleY: -1, grabbedBy: null, active: false };
    lastDeathTime = 0;
    
    door = { x: lvl.door.x, y: lvl.door.y, width: lvl.door.width, height: lvl.door.height, open: false };
    
    if (lvl.laser) {
        laser = { ...lvl.laser };
    } else {
        laser = null;
    }
    laserSafeZones = laser?.minX !== undefined ? [
        { x: lvl.man.x - 0.09, y: lvl.man.y - 0.16, width: 0.18, height: 0.24 },
        ...levers.map(lever => ({ x: lever.x - 0.06, y: lever.y - 0.14, width: 0.12, height: 0.42 }))
    ] : [];
    
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
            charge: chargedCrystal ? 1 : 0,
            charged: chargedCrystal,
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

    door.open = levers.every(object => object.active) && (!crystal || crystal.charged);
    reflectedLaser = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
    deathBanner = { text: '', until: 0 };
}

const pandaMotion = new WeakMap<Man, { x: number; time: number; lean: number }>();

export function drawMan(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, m: Man) {
    const now = performance.now();
    const phase = now / 1000;
    const previous = pandaMotion.get(m);
    const elapsed = previous ? Math.max(16, now - previous.time) : 16;
    const velocity = previous ? (m.x - previous.x) * canvasWidth / elapsed : 0;
    const lean = (previous?.lean ?? 0) + (Math.max(-0.25, Math.min(0.25, velocity * 0.2)) - (previous?.lean ?? 0)) * 0.18;
    pandaMotion.set(m, { x: m.x, time: now, lean });
    const held = !!m.grabbedBy;
    const falling = !held && m.y < 0.79;
    const bob = Math.sin(phase * (held ? 7 : 2.8)) * (held ? 2 : 1.5);
    const breath = Math.sin(phase * 2.8) * 0.018;
    const blink = phase % 4.3 > 4.12;
    const pawSwing = Math.sin(phase * (held || falling ? 9 : 2.8)) * (held || falling ? 0.28 : 0.06);
    ctx.save();
    ctx.translate(m.x * canvasWidth, m.y * canvasHeight);
    if (held) {
        ctx.beginPath();
        ctx.arc(0, 0, 75, 0, Math.PI * 2);
        ctx.fillStyle = getAgentAlphaColor(m.grabbedBy!);
        ctx.fill();
    }
    const oval = (x: number, y: number, rx: number, ry: number, color: string, rotation = 0) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    };
    if (!held && !falling) oval(0, 45, 26, 5, 'rgba(0, 0, 0, 0.25)');
    ctx.translate(0, bob);
    ctx.rotate(lean);
    ctx.scale(1 + breath, 1 - breath);
    const dark = '#222633';
    oval(-15, 32, 11, 14, dark, -pawSwing);
    oval(15, 32, 11, 14, dark, pawSwing);
    oval(0, 10, 27, 30, dark);
    oval(0, 15, 21, 24, '#f5f3eb');
    oval(-27, held || falling ? -2 : 8, 10, 19, dark, (held || falling ? -0.9 : -0.22) + pawSwing);
    oval(27, held || falling ? -2 : 8, 10, 19, dark, (held || falling ? 0.9 : 0.22) - pawSwing);
    oval(-22, -40, 12, 13, dark, -0.2);
    oval(22, -40, 12, 13, dark, 0.2);
    oval(-22, -40, 6, 7, '#454551');
    oval(22, -40, 6, 7, '#454551');
    oval(0, -22, 32, 28, '#fffdf5');
    oval(-12, -24, 10, 13, dark, 0.35);
    oval(12, -24, 10, 13, dark, -0.35);
    oval(-11, -24, 4, blink ? 0.8 : 5, '#fffdf5');
    oval(11, -24, 4, blink ? 0.8 : 5, '#fffdf5');
    if (!blink) {
        oval(-10, -23, 2.4, 3.3, '#171b26');
        oval(10, -23, 2.4, 3.3, '#171b26');
        oval(-9, -25, 1.1, 1.4, '#ffffff');
        oval(11, -25, 1.1, 1.4, '#ffffff');
    }
    oval(-22, -11, 5, 3, '#f3b9b5');
    oval(22, -11, 5, 3, '#f3b9b5');
    oval(0, -12, 5.5, 3.8, dark);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, -5);
    ctx.moveTo(-7, -6);
    ctx.quadraticCurveTo(0, 2, 7, -6);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = dark;
    ctx.stroke();
    if (held) oval(0, -1, 3, 2, '#eb9caa');
    ctx.restore();
}

export function drawWorld(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) {
    for (const [index, lever] of levers.entries()) {
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

        drawUnmirroredText(ctx, t('canvas.lever') + (levers.length > 1 ? ` ${index + 1}` : ''), lvx, lvyTop - 20, '24px sans-serif', 'white');
    }

    const doorW = door.width * canvasWidth;
    const doorH = door.height * canvasHeight;
    const doorX = door.x * canvasWidth - doorW/2;
    const doorY = door.y * canvasHeight - doorH/2;
    
    ctx.fillStyle = door.open ? '#4ade80' : '#475569';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.strokeRect(doorX, doorY, doorW, doorH);
    
    drawUnmirroredText(ctx, door.open ? t('canvas.exitOpen') : t('canvas.locked'), doorX + doorW/2, doorY - 10, '24px sans-serif', 'white');
    drawUnmirroredText(ctx, t('canvas.echoCount', { active: activeEchoCount() }),
        doorX + doorW/2, doorY + doorH + 24, 'bold 16px sans-serif', '#06b6d4');

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

    if (plate) {
        const px = plate.x * canvasWidth;
        const py = plate.y * canvasHeight;
        const pw = plate.width * canvasWidth;
        const ph = plate.height * canvasHeight;
        
        ctx.save();
        if (plate.grabbedBy) {
            ctx.beginPath();
            ctx.arc(px, py, pw * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = getAgentAlphaColor(plate.grabbedBy);
            ctx.fill();
        }
        const stalkHeight = Math.min(ph, 22);
        const stalk = ctx.createLinearGradient(0, py - stalkHeight/2, 0, py + stalkHeight/2);
        stalk.addColorStop(0, '#c2ed80');
        stalk.addColorStop(0.35, '#86c94b');
        stalk.addColorStop(1, '#397b32');
        ctx.beginPath();
        ctx.roundRect(px - pw/2, py - stalkHeight/2, pw, stalkHeight, stalkHeight/2);
        ctx.fillStyle = stalk;
        ctx.fill();
        ctx.strokeStyle = '#285b2d';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 1; i < 4; i++) {
            const jointX = px - pw/2 + pw * i/4;
            ctx.fillStyle = '#d4efa0';
            ctx.fillRect(jointX - 2, py - stalkHeight/2, 4, stalkHeight);
            ctx.fillStyle = '#477e35';
            ctx.fillRect(jointX + 2, py - stalkHeight/2, 1.5, stalkHeight);
        }
        const leafX = px + pw/4;
        ctx.strokeStyle = '#79b84a';
        ctx.beginPath();
        ctx.moveTo(leafX, py);
        ctx.quadraticCurveTo(leafX + 9, py - 12, leafX + 20, py - 17);
        ctx.stroke();
        ctx.fillStyle = '#91ce57';
        for (const [offset, angle] of [[8, -0.9], [18, -0.3]]) {
            ctx.beginPath();
            ctx.ellipse(leafX + offset, py - 13, 12, 3.5, angle, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        drawUnmirroredText(ctx, t('canvas.shield'), px, py - ph/2 - 10, '16px sans-serif', 'white');
    }

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

        drawUnmirroredText(ctx, t('canvas.prism'), px, py - ph / 2 - 12, 'bold 16px sans-serif', '#38bdf8');
    }

    if (crystal) {
        const hoverOffset = Math.sin(Date.now() * 0.003) * 0.012;
        const cyNorm = (crystal.baseY ?? crystal.y) + hoverOffset;
        const cx = crystal.x * canvasWidth;
        const cy = cyNorm * canvasHeight;
        const cw = crystal.width * canvasWidth;
        const ch = crystal.height * canvasHeight;

        ctx.save();

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

        const progressRadius = Math.max(cw, ch) * 0.65;
        ctx.beginPath();
        ctx.arc(cx, cy, progressRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * crystal.charge);
        ctx.strokeStyle = crystal.charged ? '#4ade80' : '#38bdf8';
        ctx.lineWidth = 4;
        ctx.stroke();

        const top = { x: cx, y: cy - ch / 2 };
        const right = { x: cx + cw / 2, y: cy };
        const bottom = { x: cx, y: cy + ch / 2 };
        const left = { x: cx - cw / 2, y: cy };
        const center = { x: cx, y: cy - ch * 0.08 };

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

        drawUnmirroredText(ctx, t('canvas.crystal'), cx, cy - ch / 2 - 18, 'bold 18px sans-serif', crystal.charged ? '#38bdf8' : '#94a3b8');
        drawUnmirroredText(ctx, `${Math.round(crystal.charge * 100)}%`, cx, cy + ch / 2 + 24, 'bold 16px sans-serif', crystal.charged ? '#4ade80' : '#38bdf8');
    }

    drawMan(ctx, canvasWidth, canvasHeight, man);

    const replayObjects: [ReplayObject, Entity | null][] = [
        ['man', man], ['plate', plate], ['prism', prism],
        ...levers.map((object, index): [ReplayObject, Entity] => [`lever_${index}`, object]),
    ];
    for (const [objectId, object] of replayObjects) {
        const owner = reservedBy(objectId);
        if (object && owner && !object.grabbedBy) {
            drawUnmirroredText(ctx, `🔒 ${getAgentName(owner)}`, object.x * canvasWidth,
                object.y * canvasHeight - 45, 'bold 16px sans-serif', getAgentColor(owner));
        }
    }

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

    updateAndDrawParticles(ctx, canvasWidth, canvasHeight);

    if (gameState.mode === 'WON') {
        spawnConfetti(canvasWidth, canvasHeight);
    }
}

export function handleDragAndDrop(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, handLandmarks: any[] | null, agentId: string, drawLinks = true) {
    if ((agentId === 'live' || agentId === 'live_1') && gameState.mode === 'RECORDING') {
        const recording = gameState.recordedEchoes[gameState.echoIndex];
        if (recording && !recordedObjects.has(recording)) recordedObjects.set(recording, new Map());
    }
    const wasHolding = (man.grabbedBy === agentId) || 
                       (levers.some(l => l.grabbedBy === agentId)) ||
                       (plate?.grabbedBy === agentId) || 
                       (prism?.grabbedBy === agentId);

    if (!handLandmarks) {
        pendingGrabs.delete(agentId);
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        for (const lever of levers) if (lever.grabbedBy === agentId) lever.grabbedBy = null;
        if (plate && plate.grabbedBy === agentId) plate.grabbedBy = null;
        if (prism && prism.grabbedBy === agentId) prism.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
        return;
    }

    const pinch = isPinching(handLandmarks, wasHolding);
    const px = (handLandmarks[4].x + handLandmarks[8].x) / 2;
    const py = (handLandmarks[4].y + handLandmarks[8].y) / 2;

    if (pinch) {
        let grabbedAnything = wasHolding;

        if (!grabbedAnything) {
            const toBox = (o: { x: number; y: number; width: number; height: number }) =>
                Math.hypot(Math.max(0, Math.abs(px - o.x) - o.width / 2), Math.max(0, Math.abs(py - o.y) - o.height / 2));
            const candidates: [Entity, ReplayObject, number, number][] = [
                [man, 'man', Math.hypot(px - man.x, py - man.y), 0.15],
                ...levers.map((l, index): [Entity, ReplayObject, number, number] =>
                    [l, `lever_${index}`, Math.hypot(px - l.x, py - l.handleY), 0.15]),
            ];
            if (plate) candidates.push([plate, 'plate', toBox(plate), 0.1]);
            if (prism) candidates.push([prism, 'prism', toBox(prism), 0.1]);
            let best: [Entity, ReplayObject, number, number] | null = null;
            for (const c of candidates) {
                if (c[2] < c[3] && (!best || c[2] < best[2]) && canGrab(c[0], c[1], agentId)) best = c;
            }
            if (best) {
                grab(best[0], best[1], agentId, px, py);
                grabbedAnything = true;
            }
        }
        updatePendingGrab(agentId, grabbedAnything, px, py);

        const agentColor = getAgentColor(agentId);
        const agentName = getAgentName(agentId);

        if (man.grabbedBy === agentId) {
            man.x += (px - man.x) * 0.15; 
            man.y += (py - man.y) * 0.15;
            
            if (drawLinks) {
                ctx.beginPath();
                ctx.moveTo(px * canvasWidth, py * canvasHeight);
                ctx.lineTo(man.x * canvasWidth, man.y * canvasHeight);
                ctx.strokeStyle = agentColor;
                ctx.lineWidth = 4;
                ctx.stroke();
                drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
            }
        }
        for (const lever of levers) if (lever.grabbedBy === agentId) {
            lever.handleY = Math.max(lever.y, Math.min(lever.y + 0.2, py));
            
            if (drawLinks) {
                ctx.beginPath();
                ctx.moveTo(px * canvasWidth, py * canvasHeight);
                ctx.lineTo(lever.x * canvasWidth, lever.handleY * canvasHeight);
                ctx.strokeStyle = agentColor;
                ctx.lineWidth = 4;
                ctx.stroke();
                drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
            }
        }
        if (plate && plate.grabbedBy === agentId) {
            plate.x += (px - plate.x) * 0.15;
            plate.y += (py - plate.y) * 0.15;
            
            if (drawLinks) {
                ctx.beginPath();
                ctx.moveTo(px * canvasWidth, py * canvasHeight);
                ctx.lineTo(plate.x * canvasWidth, plate.y * canvasHeight);
                ctx.strokeStyle = agentColor;
                ctx.lineWidth = 4;
                ctx.stroke();
                drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
            }
        }
        if (prism && prism.grabbedBy === agentId) {
            prism.x += (px - prism.x) * 0.15;
            prism.y += (py - prism.y) * 0.15;
            
            if (drawLinks) {
                ctx.beginPath();
                ctx.moveTo(px * canvasWidth, py * canvasHeight);
                ctx.lineTo(prism.x * canvasWidth, prism.y * canvasHeight);
                ctx.strokeStyle = agentColor;
                ctx.lineWidth = 4;
                ctx.stroke();
                drawUnmirroredText(ctx, agentName, px * canvasWidth, py * canvasHeight - 30, '16px sans-serif', agentColor);
            }
        }
    } else {
        pendingGrabs.delete(agentId);
        if (man.grabbedBy === agentId) man.grabbedBy = null;
        for (const lever of levers) if (lever.grabbedBy === agentId) lever.grabbedBy = null;
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
        drawUnmirroredText(ctx, t('canvas.target'), tx, ty - tr - 10, '20px sans-serif', '#4ade80');
        
        const bx = tutorialBox.x * canvasWidth;
        const by = tutorialBox.y * canvasHeight;
        const size = 40;
        
        ctx.fillStyle = tutorialBox.grabbedBy ? '#f97316' : '#facc15';
        ctx.fillRect(bx - size/2, by - size/2, size, size);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - size/2, by - size/2, size, size);
        drawUnmirroredText(ctx, t('canvas.block'), bx, by - size/2 - 10, '16px sans-serif', 'white');
    } else if (gameState.tutorialStep === 3) {
        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2;
        drawUnmirroredText(ctx, t('tutorial.step3.canvasHint'), cx, cy, '32px sans-serif', '#ef4444');
    } else if (gameState.tutorialStep === 4) {
        const cx = canvasWidth / 2;
        const cy = canvasHeight / 2;
        drawUnmirroredText(ctx, t('tutorial.step4.canvasHint1'), cx, cy, '32px sans-serif', '#4ade80');
        drawUnmirroredText(ctx, t('tutorial.step4.canvasHint2'), cx, cy + 40, '20px sans-serif', '#facc15');
    }
}

export function handleTutorialDrag(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, handLandmarks: any[] | null, drawLinks = true) {
    const wasHolding = tutorialBox.grabbedBy === 'live';
    if (!handLandmarks) {
        tutorialBox.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
        return;
    }
    const pinch = isPinching(handLandmarks, wasHolding);
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
            
            if (drawLinks) {
                ctx.beginPath();
                ctx.moveTo(px * canvasWidth, py * canvasHeight);
                ctx.lineTo(tutorialBox.x * canvasWidth, tutorialBox.y * canvasHeight);
                ctx.strokeStyle = '#f97316';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
    } else {
        tutorialBox.grabbedBy = null;
        if (wasHolding) {
            playSfx('drop');
        }
    }
}

export function evaluateRules() {
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

    const latchLevers = getActiveLevel().latchLevers;
    for (const lever of levers) {
        const wasActive = lever.active;
        if (latchLevers && (wasActive || lever.handleY >= lever.y + 0.18)) {
            lever.handleY = lever.y + 0.2;
            lever.active = true;
        } else {
            if (!lever.grabbedBy && lever.handleY > lever.y) {
                lever.handleY = Math.max(lever.y, lever.handleY - 0.02);
            }
            lever.active = lever.handleY >= lever.y + 0.18;
        }
        if (!wasActive && lever.active) {
            playSfx('switch');
        }
    }
    
    if (laser) {
        if (laser.active && laser.minX !== undefined && laser.maxX !== undefined) {
            let t = 0;
            if (gameState.mode === 'RECORDING') {
                t = (Date.now() - gameState.recordStartTime) / 1000;
            } else if (gameState.mode === 'PLAYING' && gameState.livePlay) {
                t = (Date.now() - gameState.playStartTime) / 1000;
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

        laser.height = 1.0 - laser.y;

        for (const zone of laserSafeZones) {
            if (laser.x + laser.width / 2 >= zone.x && laser.x - laser.width / 2 <= zone.x + zone.width) {
                laser.height = Math.min(laser.height, Math.max(0, zone.y - laser.y));
            }
        }
        
        if (plate) {
            if (plate.x - plate.width/2 < laser.x + laser.width/2 && 
                plate.x + plate.width/2 > laser.x - laser.width/2) {
                if (plate.y > laser.y) {
                    const shieldHeight = Math.max(0, (plate.y - plate.height/2) - laser.y);
                    if (shieldHeight < laser.height) {
                        laser.height = shieldHeight;
                        spawnSparks(laser.x, plate.y - plate.height/2, 2, '#38bdf8');
                    }
                }
            }
        }

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

    door.open = levers.every(l => l.active) && (!crystal || crystal.charged);

    let manHitByLaser = false;
    if (laser && laser.active) {
        const hitW = 0.025;
        const hitH = 0.1;
        const shielded = !!plate && plate.y < man.y && Math.abs(man.x - plate.x) <= plate.width / 2;
        if (!shielded && Math.abs(man.x - laser.x) < laser.width/2 + hitW) {
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

    if (door.open) {
        if (Math.abs(man.x - door.x) < door.width/2 && Math.abs(man.y - door.y) < door.height/2) {
            if (gameState.mode === 'PLAYING' || gameState.mode === 'RECORDING') {
                gameState.winTimeLeftMs = gameState.mode === 'RECORDING'
                    ? Math.max(0, gameState.RECORD_DURATION - (Date.now() - gameState.recordStartTime)) : playingTimeLeft();
                const echoes = gameState.mode === 'RECORDING' ? gameState.recordedEchoes.slice(0, gameState.echoIndex) : gameState.recordedEchoes;
                gameState.winEchoesUsed = echoes.filter(echo => echo.some(frame => recordedHands(frame).some(Boolean))).length;
                gameState.mode = 'WON';
                gameState.baseInstruction = t('win.instructionSingle');
                playSfx('win');
            }
        }
    }
}
