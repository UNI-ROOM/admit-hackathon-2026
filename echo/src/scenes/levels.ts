// Level Select scene: 3 level cards + Tutorial entry point.
// Also owns the small "go to level / go to tutorial / restart" helpers that
// used to live behind the old #level-switcher <select>, so both this scene
// and the in-game pause panel can reuse them without a circular import on
// main.ts.

import { LEVELS, getLevelConfig } from '../levels';
import type { Difficulty } from '../../../shared/score';
import { api } from '../api';
import { getSettings } from '../settings';
import { gameState, resetLevel } from '../game';
import { t } from '../i18n';
import { show, onChange } from './router';

const container = document.getElementById('scene-levels');

function levelName(n: number): string {
    const key = `levels.name${n}`;
    const translated = t(key);
    if (translated !== key) return translated;
    const title = LEVELS[n - 1]?.title || '';
    return title.replace(/^Level \d+:\s*/i, '');
}

function setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}
function setHtml(id: string, html: string): void {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

// --- Shared level/tutorial entry helpers (also used by scenes/pause.ts) ---

export function applyIdleHud(levelIndex: number): void {
    const config = getLevelConfig(levelIndex, gameState.difficulty);
    setText('level-title', `${config?.title || ''} · ${t(`difficulty.${gameState.difficulty}`)}`);
    const actions = document.getElementById('round-actions');
    if (actions) actions.hidden = false;
    const modeIndicator = document.getElementById('mode-indicator');
    if (modeIndicator) {
        modeIndicator.innerText = t('mode.idle');
        modeIndicator.className = 'status-box text-2xl font-bold flex items-center justify-center min-w-[250px]';
    }
    const text = config?.hintIdle || t('idle.instructionDefault');
    gameState.baseInstruction = text;
    setHtml('instruction', text);
}

function resetRunCounters(): void {
    gameState.deaths = 0;
    gameState.resets = 0;
    gameState.attemptStart = 0;
    gameState.recordedEchoes = [];
    gameState.echoIndex = 0;
    gameState.currentFrame = 0;
    gameState['wonTimeoutSet'] = false;
}

export function goToLevel(levelIndex: number, difficulty: Difficulty = gameState.difficulty): void {
    gameState.difficulty = difficulty;
    resetRunCounters();
    gameState.currentLevel = levelIndex;
    gameState.mode = 'IDLE';
    gameState.tutorialStep = 0;
    resetLevel();
    applyIdleHud(levelIndex);
    show('game');
}

export function restartCurrentLevel(): void {
    resetRunCounters();
    gameState.mode = 'IDLE';
    resetLevel();
    applyIdleHud(gameState.currentLevel);
}

export function goToTutorial(): void {
    resetRunCounters();
    gameState.currentLevel = 1;
    gameState.mode = 'TUTORIAL';
    const actions = document.getElementById('round-actions');
    if (actions) actions.hidden = true;
    gameState.tutorialStep = 1;
    resetLevel();
    gameState.baseInstruction = t('tutorial.step1.instruction');
    setHtml('instruction', gameState.baseInstruction);
    const modeIndicator = document.getElementById('mode-indicator');
    if (modeIndicator) {
        modeIndicator.innerText = t('tutorial.step1.indicator');
        modeIndicator.className = 'status-box text-2xl font-bold flex items-center justify-center min-w-[250px] text-yellow-400';
    }
    setText('level-title', t('menu.tutorial'));
    show('game');
}

// --- Scene rendering ---

let sessionInfo: { maxLevel: number; best: Record<string, number> } | null = null;

async function loadSession(): Promise<void> {
    try {
        const s = await api.session();
        sessionInfo = { maxLevel: s.progress.max_level, best: s.best };
    } catch {
        sessionInfo = null;
    }
}

function button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.dwell = '';
    b.className = 'menu-btn';
    b.textContent = text;
    b.onclick = action;
    return b;
}

function render(): void {
    if (!container) return;
    container.innerHTML = '';

    const heading = document.createElement('h2');
    heading.className = 'levels-heading';
    heading.textContent = t('levels.title');

    const grid = document.createElement('div');
    grid.className = 'levels-grid';

    const maxLevel = getSettings().unlockAll ? LEVELS.length : (sessionInfo?.maxLevel ?? 1);

    LEVELS.forEach((_lvl, idx) => {
        const n = idx + 1;
        const locked = n > maxLevel;

        const card = document.createElement('div');
        card.className = 'level-card' + (locked ? ' locked' : '');

        const num = document.createElement('div');
        num.className = 'level-card-num';
        num.textContent = String(n).padStart(2, '0');

        const name = document.createElement('div');
        name.className = 'level-card-name';
        name.textContent = levelName(n);

        const best = document.createElement('div');
        best.className = 'level-card-best';
        const bestScore = sessionInfo?.best?.[String(n)];
        best.textContent = bestScore != null ? t('levels.best', { score: bestScore }) : t('levels.bestNone');

        card.append(num, name, best);

        if (locked) {
            const lock = document.createElement('div');
            lock.className = 'level-card-lock';
            lock.textContent = '🔒';
            card.append(lock);
        } else {
            for (const difficulty of ['easy', 'hard'] as const) {
                const option = document.createElement('div');
                option.className = 'difficulty-option';
                const play = button(t(`levels.${difficulty}`), () => goToLevel(n, difficulty));
                const description = document.createElement('p');
                description.textContent = t(`levels.${difficulty}${n}`);
                option.append(play, description);
                card.append(option);
            }
        }

        grid.append(card);
    });

    const nav = document.createElement('div');
    nav.className = 'levels-nav';
    nav.append(
        button(t('levels.back'), () => show('menu')),
        button(t('levels.tutorial'), () => goToTutorial())
    );

    const hint = document.createElement('p');
    hint.className = 'levels-hint';
    hint.textContent = t('levels.difficultyHint');
    container.append(heading, hint, grid, nav);
}

render();
onChange(scene => {
    if (scene === 'levels') {
        void loadSession().then(render);
    }
});
