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

    function image(src: string): HTMLImageElement {
        const element = document.createElement('img');
        element.src = src;
        element.alt = '';
        element.draggable = false;
        element.setAttribute('aria-hidden', 'true');
        return element;
    }

    // Native GIF transparency works without depending on video alpha support.
    const idleAnimation = '/mascots/panda-idle-v4.gif';
    const idleStill = '/mascots/panda-idle-still-v4.png';
    const reactionAnimation = '/mascots/panda-poke-v4.gif';
    const reactionStill = '/mascots/panda-poke-still-v4.png';
    const reactionDuration = 9990;
    const idle = image(idleAnimation);
    const reaction = image(reactionStill);
    reaction.hidden = true;
    let reacting = false;
    let reactionTimer: ReturnType<typeof setTimeout> | undefined;
    let reactionSequence = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    function syncPlayback(): void {
        const visible = current() === 'menu' && !document.hidden;
        if (!visible && reacting) rest();
        const src = visible && !reacting && !reducedMotion.matches ? idleAnimation : idleStill;
        if (idle.getAttribute('src') !== src) idle.src = src;
        if (reacting && reducedMotion.matches) reaction.src = reactionStill;
    }

    function rest(): void {
        clearTimeout(reactionTimer);
        reactionTimer = undefined;
        reacting = false;
        reaction.hidden = true;
        reaction.src = reactionStill;
        idle.hidden = false;
        button.classList.remove('is-reacting');
        syncPlayback();
    }

    button.onclick = () => {
        clearTimeout(reactionTimer);
        reacting = true;
        idle.hidden = true;
        reaction.hidden = false;
        // A fresh URL restarts the GIF even when poked again mid-animation.
        reaction.src = reducedMotion.matches ? reactionStill : `${reactionAnimation}?play=${++reactionSequence}`;
        button.classList.add('is-reacting');
        syncPlayback();
    };
    reaction.addEventListener('load', () => {
        if (!reacting) return;
        clearTimeout(reactionTimer);
        reactionTimer = setTimeout(rest, reducedMotion.matches ? 500 : reactionDuration);
    });
    reaction.addEventListener('error', rest);
    onChange(scene => {
        if (scene !== 'menu') rest();
        else syncPlayback();
    });
    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);
    syncPlayback();

    const caption = document.createElement('span');
    caption.className = 'menu-panda-caption';
    caption.textContent = t('menu.pandaPoke');
    button.append(idle, reaction);
    panda.append(button, caption);
    return panda;
}
