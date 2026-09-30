// In-game pause panel, opened from the "☰ MENU" HUD button.
// Reuses the same <dialog class="account-panel"> styling as the account UI.

import { gameState } from '../game';
import { show, current } from './router';
import { openSettings } from './settings';
import { restartCurrentLevel } from './levels';
import { saveProgress } from '../ui/account';
import { t } from '../i18n';

const dialog = document.createElement('dialog');
dialog.className = 'account-panel';
document.body.append(dialog);

let pauseStart = 0;
let paused = false;

function button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.dwell = '';
    b.textContent = text;
    b.onclick = action;
    return b;
}

function render(): void {
    dialog.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = t('pause.title');
    dialog.append(
        h,
        button(t('pause.resume'), resume),
        button(t('pause.restart'), restart),
        button(t('pause.levelSelect'), levelSelect),
        button(t('pause.settings'), () => openSettings())
    );
}

export function isPaused(): boolean {
    return paused;
}

// Opens the pause panel. During tutorial step 4, the whole point of pointing
// at the MENU button is to *complete* the tutorial rather than actually pause
// the game, so we special-case it: mark the tutorial done and jump straight
// to Level Select instead of showing the panel.
export function openPause(completeTutorial = true): void {
    if (current() !== 'game') return;
    if (completeTutorial && gameState.mode === 'TUTORIAL' && gameState.tutorialStep === 4) {
        void saveProgress({ tutorialDone: true });
        gameState.mode = 'IDLE';
        gameState.tutorialStep = 0;
        show('levels');
        return;
    }
    if (dialog.open) return;
    pauseStart = Date.now();
    paused = true;
    render();
    dialog.showModal();
}

function resume(): void {
    const elapsed = Date.now() - pauseStart;
    if (gameState.recordStartTime) gameState.recordStartTime += elapsed;
    if (gameState.playStartTime) gameState.playStartTime += elapsed;
    paused = false;
    dialog.close();
}

function restart(): void {
    paused = false;
    dialog.close();
    restartCurrentLevel();
}

function levelSelect(): void {
    paused = false;
    dialog.close();
    show('levels');
}

// Wire the static HUD button from index.html.
const menuButton = document.getElementById('hud-menu-button');
if (menuButton) {
    menuButton.textContent = t('menu.hudMenu');
    menuButton.addEventListener('click', () => openPause());
}
dialog.addEventListener('cancel', event => {
    event.preventDefault();
    resume();
});
dialog.addEventListener('close', () => { if (paused) resume(); });
