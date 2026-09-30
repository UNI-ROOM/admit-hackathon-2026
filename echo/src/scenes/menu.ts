// Main menu scene: title, START / PROFILE / LEADERBOARD / SETTINGS, and a
// bottom status line (camera permission, hand-tracking model status, build id).

import { t } from '../i18n';
import { show } from './router';
import { cameraPermissionState } from '../camera';
import { openProfile, openLeaderboard } from '../ui/account';
import { openSettings } from './settings';

const container = document.getElementById('scene-menu');

let handStatus: 'loading' | 'ready' = 'loading';
let statusOverride: string | null = null;

// Called by main.ts once the hand-tracking model returns its first result.
export function setHandStatus(status: 'loading' | 'ready'): void {
    handStatus = status;
    void updateStatusLine();
}

// Called by main.ts if the camera fails to start (e.g. permission denied),
// so the user sees why they were sent back to the menu.
export function setStatusMessage(message: string): void {
    statusOverride = message;
    void updateStatusLine();
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

async function updateStatusLine(): Promise<void> {
    const status = document.getElementById('menu-status-line');
    if (!status) return;
    if (statusOverride) {
        status.textContent = statusOverride;
        return;
    }
    const camState = await cameraPermissionState();
    const camKey = camState === 'granted' ? 'status.cameraAllowed'
        : camState === 'denied' ? 'status.cameraBlocked'
        : camState === 'prompt' ? 'status.cameraPrompt'
        : 'status.cameraUnknown';
    const handKey = handStatus === 'ready' ? 'status.handReady' : 'status.handLoading';
    const build = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GIT_SHA ?? 'dev';
    status.textContent = `${t(camKey)} · ${t(handKey)} · v${build}`;
}

function render(): void {
    if (!container) return;
    container.innerHTML = '';

    const badge = document.createElement('div');
    badge.className = 'menu-badge';
    const img = document.createElement('img');
    img.src = '/brand/admit-hackathon.jpg';
    img.alt = 'ADMIT Hackathon';
    const caption = document.createElement('p');
    caption.textContent = t('menu.builtAt');
    badge.append(img, caption);

    const titleWrap = document.createElement('div');
    titleWrap.className = 'menu-title-wrap';
    const h1 = document.createElement('h1');
    h1.className = 'menu-title';
    h1.textContent = 'VENCERA';
    const h2 = document.createElement('h2');
    h2.className = 'menu-subtitle';
    h2.textContent = 'ECHO GAME';
    const tagline = document.createElement('p');
    tagline.className = 'menu-tagline';
    tagline.textContent = t('menu.tagline');
    titleWrap.append(h1, h2, tagline);

    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons';
    buttons.append(
        button(t('menu.start'), () => show('levels')),
        button(t('menu.profile'), () => openProfile()),
        button(t('menu.leaderboard'), () => openLeaderboard()),
        button(t('menu.settings'), () => openSettings())
    );

    const status = document.createElement('div');
    status.className = 'menu-status';
    status.id = 'menu-status-line';

    container.append(badge, titleWrap, buttons, status);
    void updateStatusLine();
}

render();
// Keep the status line fresh (camera permission can change any time the
// player is looking at the menu, e.g. after granting access in another tab).
setInterval(() => {
    if (container && !container.hidden) void updateStatusLine();
}, 2000);
