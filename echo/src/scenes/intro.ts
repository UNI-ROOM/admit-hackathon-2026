// Intro scene shown before the menu and sign-up: welcomes the jury and
// introduces the two developers.

import { t, LANG } from '../i18n';
import { updateSettings } from '../settings';
import { show } from './router';

const container = document.getElementById('scene-intro');

// EN | RU switch for the whole game. Strings are resolved at load, so the
// choice is saved and the page reloads (back on this screen).
function languageSwitch(): HTMLElement {
    const root = el('div', 'intro-lang');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Language / Язык');
    for (const [code, label] of [['en', 'EN'], ['ru', 'RU']] as const) {
        const b = el('button', 'intro-lang-btn', label);
        b.type = 'button';
        b.dataset.dwell = '';
        b.setAttribute('aria-pressed', String(code === LANG));
        b.onclick = () => {
            if (code === LANG) return;
            updateSettings({ language: code });
            location.reload();
        };
        root.append(b);
    }
    return root;
}

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

    container.replaceChildren(languageSwitch(), text, el('h2', 'intro-team-title', t('intro.team')), team, go);
}

render();
