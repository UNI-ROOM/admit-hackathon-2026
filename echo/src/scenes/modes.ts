import type { Difficulty } from '../../../shared/score';
import { LEVELS } from '../levels';
import { t } from '../i18n';
import { onChange, show } from './router';
import { touchDevice } from '../device';

const container = document.getElementById('scene-modes');
let difficulty3D: Difficulty = 'easy';

export function get3DDifficulty(): Difficulty {
    return difficulty3D;
}

export function goTo3D(difficulty: Difficulty = 'easy'): void {
    difficulty3D = difficulty;
    show('game3d');
}

function button(label: string, action: () => void, className = ''): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.dataset.dwell = '';
    element.className = `menu-btn ${className}`.trim();
    element.textContent = label;
    element.onclick = action;
    return element;
}

function preview(mode: '2d' | '3d'): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `mode-preview mode-preview--${mode}`;
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = mode === '2d' ? `
        <svg viewBox="0 0 420 210" xmlns="http://www.w3.org/2000/svg">
            <path d="M35 28H385V180H35Z" fill="#091523" stroke="#20324a"/>
            <path d="M35 66H385M35 104H385M35 142H385M105 28V180M175 28V180M245 28V180M315 28V180" stroke="#162539"/>
            <path d="M57 104H196L266 53" fill="none" stroke="#ff735c" stroke-width="7" opacity=".15"/>
            <path d="M57 104H196L266 53" fill="none" stroke="#ff735c" stroke-width="2"/>
            <rect x="44" y="94" width="25" height="20" rx="3" fill="#263950" stroke="#ff735c"/>
            <path d="M196 84L217 105L196 126L175 105Z" fill="#163742" stroke="#73f3d6" stroke-width="2"/>
            <path d="M263 40L277 48L273 66L259 66L255 48Z" fill="#73f3d6"/>
            <rect x="332" y="126" width="32" height="40" rx="3" fill="#132b35" stroke="#73f3d6" stroke-width="2"/>
            <path d="M52 170H371" stroke="#3a5974" stroke-width="3"/>
            <circle cx="115" cy="134" r="12" fill="#f4ede0"/>
            <path d="M115 147V163M104 154H126M108 170L115 161L122 170" stroke="#f4ede0" stroke-width="5" stroke-linecap="round"/>
            <path d="M146 139Q159 116 176 132" fill="none" stroke="#73a6ef" stroke-width="2" stroke-dasharray="4 5"/>
        </svg>` : `
        <svg viewBox="0 0 420 210" xmlns="http://www.w3.org/2000/svg">
            <path d="M42 125L221 42L383 115L204 201Z" fill="#283840" stroke="#52686b"/>
            <path d="M42 125V140L204 216V201M204 216L383 130V115" fill="#172329" stroke="#52686b"/>
            <path d="M60 124L220 51L362 115L203 188Z" fill="#132529" stroke="#394e51"/>
            <path d="M144 93L306 165" stroke="#ff765f" stroke-width="8" opacity=".14"/>
            <path d="M144 93L217 125L275 100" fill="none" stroke="#ff9a68" stroke-width="2"/>
            <path d="M211 108L229 127L216 143L201 126Z" fill="#79ecd7" stroke="#c8fff0"/>
            <path d="M278 75L291 91L278 110L265 91Z" fill="#76efd4"/>
            <path d="M314 112V72L339 60L350 67V109" fill="#213d41" stroke="#83ead7" stroke-width="3"/>
            <path d="M110 95L132 85L147 92V108L126 119L110 112Z" fill="#344649" stroke="#607277"/>
            <circle cx="176" cy="131" r="15" fill="#f5ead9"/>
            <circle cx="165" cy="117" r="6" fill="#17242a"/><circle cx="185" cy="117" r="6" fill="#17242a"/>
            <ellipse cx="170" cy="129" rx="4" ry="5" fill="#17242a"/><ellipse cx="181" cy="129" rx="4" ry="5" fill="#17242a"/>
            <path d="M173 136L179 136L176 139Z" fill="#17242a"/>
            <ellipse cx="176" cy="155" rx="12" ry="14" fill="#f5ead9"/>
            <path d="M165 149L158 155M187 149L192 155M169 164L166 170M183 164L186 170" stroke="#17242a" stroke-width="7" stroke-linecap="round"/>
            <path d="M52 174L87 153L109 161L104 174L82 180L93 187L111 180" fill="none" stroke="#e6ddd0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M362 168L331 151L308 156L305 168L325 174L315 181L297 177" fill="none" stroke="#e6ddd0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="87" cy="153" r="5" fill="#ffab72"/><circle cx="331" cy="151" r="5" fill="#79ecd7"/>
        </svg>`;
    return element;
}

function heading(title: string, subtitle: string): HTMLElement {
    const header = document.createElement('header');
    header.className = 'modes-header';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'modes-eyebrow';
    eyebrow.textContent = 'VENCERA / ECHO';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const description = document.createElement('p');
    description.className = 'modes-description';
    description.textContent = subtitle;
    header.append(eyebrow, h2, description);
    return header;
}

function modeCard(mode: '2d' | '3d'): HTMLButtonElement {
    const card = button('', () => mode === '2d' ? show('levels') : render3D(), `mode-card mode-card--${mode}`);
    const title = document.createElement('span');
    title.className = 'mode-card-title';
    title.textContent = mode.toUpperCase();
    const label = document.createElement('span');
    label.className = 'mode-card-label';
    label.textContent = t(`modes.${mode}.title`);
    const count = document.createElement('span');
    count.className = 'mode-card-count';
    count.textContent = mode === '2d' ? t('modes.levelsCount', { count: LEVELS.length }) : t('modes.oneLevel');
    const description = document.createElement('span');
    description.className = 'mode-card-description';
    description.textContent = t(`modes.${mode}.description`);
    const cta = document.createElement('span');
    cta.className = 'mode-card-cta';
    cta.textContent = `${t('modes.choose')} ↗`;
    card.append(title, label, count, preview(mode), description, cta);
    return card;
}

function renderModes(): void {
    if (!container) return;
    container.classList.add('modes-scene');
    const grid = document.createElement('div');
    grid.className = 'modes-grid';
    grid.append(modeCard('2d'));
    if (!touchDevice) grid.append(modeCard('3d'));
    container.replaceChildren(
        heading(t('modes.title'), t('modes.subtitle')),
        grid,
        button(t('modes.backMenu'), () => show('menu'), 'modes-back')
    );
}

function render3D(): void {
    if (!container) return;
    const card = document.createElement('article');
    card.className = 'mode-level-card';
    const artwork = preview('3d');
    const content = document.createElement('div');
    content.className = 'mode-level-content';
    const number = document.createElement('p');
    number.className = 'modes-eyebrow';
    number.textContent = `${t('modes.levelOne')} / 3D`;
    const title = document.createElement('h3');
    title.textContent = t('modes.levelName');
    const description = document.createElement('p');
    description.textContent = t('modes.levelDescription');
    const choices = document.createElement('div');
    choices.className = 'mode-difficulties';
    for (const difficulty of ['easy', 'hard'] as const) {
        const choice = button('', () => goTo3D(difficulty), 'mode-difficulty');
        const label = document.createElement('strong');
        label.textContent = difficulty === 'easy' ? 'Simple' : 'Hard';
        const hint = document.createElement('span');
        hint.textContent = t(`modes.${difficulty}Hint`);
        choice.append(label, hint);
        choices.append(choice);
    }
    const controls = document.createElement('p');
    controls.className = 'mode-level-controls';
    controls.textContent = t('modes.controls');
    content.append(number, title, description, choices, controls);
    card.append(artwork, content);
    container.replaceChildren(
        heading(t('modes.3d.title'), t('modes.3d.subtitle')),
        card,
        button(t('modes.backModes'), renderModes, 'modes-back')
    );
}

renderModes();
onChange(scene => {
    if (scene === 'modes') renderModes();
});
