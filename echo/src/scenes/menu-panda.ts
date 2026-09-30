import { t } from '../i18n';
import { current, onChange } from './router';

export function createMenuPanda(): HTMLElement {
    const panda = document.createElement('div');
    panda.className = 'menu-panda';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-panda-button';
    button.dataset.dwell = '';
    button.setAttribute('aria-label', t('menu.pandaPoke'));
    button.title = t('menu.pandaPoke');

    function video(src: string): HTMLVideoElement {
        const element = document.createElement('video');
        element.src = src;
        element.muted = true;
        element.playsInline = true;
        element.preload = 'auto';
        element.setAttribute('aria-hidden', 'true');
        element.disablePictureInPicture = true;
        element.tabIndex = -1;
        return element;
    }

    const idle = video('/mascots/panda-idle-v1.mp4');
    idle.loop = true;
    const reaction = video('/mascots/panda-poke-v1.mp4');
    reaction.hidden = true;
    let reacting = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncPlayback(): void {
        if (current() !== 'menu' || document.hidden) {
            idle.pause();
            reaction.pause();
            return;
        }
        const active = reacting ? reaction : idle;
        (reacting ? idle : reaction).pause();
        if (!reacting && reducedMotion.matches) { idle.pause(); return; }
        void active.play().catch(() => {
            if (active === reaction && reacting && !document.hidden && current() === 'menu') rest();
        });
    }

    function rest(): void {
        reacting = false;
        reaction.hidden = true;
        idle.hidden = false;
        button.classList.remove('is-reacting');
        syncPlayback();
    }

    button.onclick = () => {
        reacting = true;
        idle.hidden = true;
        reaction.hidden = false;
        reaction.currentTime = 0;
        button.classList.add('is-reacting');
        syncPlayback();
    };
    reaction.addEventListener('ended', rest);
    reaction.addEventListener('error', rest);
    onChange(scene => {
        if (scene !== 'menu') rest();
        else syncPlayback();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);

    const caption = document.createElement('span');
    caption.className = 'menu-panda-caption';
    caption.textContent = t('menu.pandaPoke');
    button.append(idle, reaction);
    panda.append(button, caption);
    return panda;
}
