// Intro scene shown before the menu and sign-up: welcomes the jury and
// introduces the two developers.

import { STRINGS } from '../i18n';
import { show } from './router';

const container = document.getElementById('scene-intro');

// The jury screen is always Russian, independent of the game language.
const t = (key: string, params?: Record<string, string>): string =>
    Object.entries(params ?? {}).reduce((text, [k, v]) => text.split(`{${k}}`).join(v), STRINGS.ru[key] ?? key);

interface Member {
    nickname: string;
    fullName: string;
    photo: string;
    site: string;
}

const TEAM: Member[] = [
    { nickname: 'Jeanark', fullName: 'Аркинов Жанболат', photo: '/team/jeanark.jpg', site: 'jeanark.dev' },
    { nickname: 'keBi AppSec', fullName: 'Ақымбек Айбек', photo: '/team/kebi.jpg', site: 'a-aibek-dev.github.io' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function card(member: Member): HTMLElement {
    const root = el('article', 'intro-card');
    const photo = el('img', 'intro-photo');
    photo.src = member.photo;
    photo.alt = t('intro.photoAlt', { name: member.fullName });
    const link = el('a', 'intro-site', member.site);
    link.href = `https://${member.site}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const site = el('p', 'intro-site-row', `${t('intro.site')}: `);
    site.append(link);
    root.append(photo, el('h3', 'intro-nick', member.nickname), el('p', 'intro-name', member.fullName), site);
    return root;
}

function render(): void {
    if (!container) return;
    const text = el('div', 'intro-text');
    text.append(
        el('p', 'intro-kicker', t('intro.kicker')),
        el('h1', 'intro-title', t('intro.title')),
        el('p', 'intro-lead', t('intro.lead')),
        el('p', 'intro-lead', t('intro.modes')),
        el('p', 'intro-lead intro-next', t('intro.next')),
    );

    const team = el('div', 'intro-team');
    team.append(...TEAM.map(card));

    const go = el('button', 'menu-btn menu-btn--primary intro-continue', t('intro.continue'));
    go.type = 'button';
    go.dataset.dwell = '';
    go.onclick = () => show('menu');

    container.replaceChildren(text, el('h2', 'intro-team-title', t('intro.team')), team, go);
}

render();
