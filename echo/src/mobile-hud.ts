import { gameState, crystal, levers, door } from './game';
import { t } from './i18n';
import { touchDevice } from './device';

export function syncTouchHud(): void {
    if (!touchDevice) return;
    const instruction = document.getElementById('instruction')!;
    const tutorial = gameState.mode === 'TUTORIAL';
    const tutorialButton = document.getElementById('touch-tutorial-button')!;
    tutorialButton.hidden = !tutorial || gameState.tutorialStep === 2;
    tutorialButton.textContent = t(`mobile.tutorialAction${gameState.tutorialStep}`);
    const goal = document.getElementById('touch-goal')!;
    goal.textContent = tutorial ? t('menu.tutorial') : t(`mobile.goal${gameState.currentLevel}`);
    const status = document.getElementById('touch-puzzle-status')!;
    status.textContent = tutorial ? `${gameState.tutorialStep} / 4`
        : crystal ? `${Math.round(crystal.charge * 100)}%`
        : levers.length ? `${levers.filter(lever => lever.active).length} / ${levers.length}`
        : t(door.open ? 'mobile.exitOpen' : 'mobile.exitLocked');
    status.classList.toggle('is-complete', !tutorial && door.open);
    const key = tutorial ? `mobile.tutorial${gameState.tutorialStep}`
        : gameState.mode === 'IDLE' ? 'mobile.idleHint'
        : gameState.mode === 'WON' ? 'mobile.winHint'
        : gameState.mode === 'RECORDING' ? gameState.currentLevel === 3 && gameState.difficulty === 'easy'
            ? `mobile.record3phase${gameState.echoIndex}` : `mobile.record${gameState.currentLevel}`
        : `mobile.play${gameState.currentLevel}`;
    instruction.textContent = t(key);
    const restart = document.getElementById('touch-restart-button')!;
    restart.hidden = tutorial;
    const seconds = Math.max(0, Math.ceil((gameState.RECORD_DURATION - (Date.now()
        - (gameState.mode === 'RECORDING' ? gameState.recordStartTime : gameState.playStartTime))) / 1000));
    const mode = document.getElementById('mode-indicator')!;
    mode.textContent = tutorial ? `${gameState.tutorialStep} / 4`
        : gameState.mode === 'RECORDING' ? t('mobile.recording', { i: gameState.echoIndex + 1, max: gameState.maxEchoes, time: seconds })
        : gameState.mode === 'PLAYING' ? t(gameState.livePlay ? 'mobile.live' : 'mobile.echo', { time: seconds })
        : t(gameState.mode === 'WON' ? 'mobile.complete' : 'mobile.readyMode');
    document.querySelector('#game-container .hud-title')!.textContent = tutorial ? 'ECHO / 2D'
        : `ECHO / 2D · ${t(`mobile.${gameState.difficulty}`)}`;
}
