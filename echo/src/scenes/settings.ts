// Settings panel: device preferences, camera, language, reset progress.
import { t } from '../i18n';
import { getSettings, updateSettings, type Settings } from '../settings';
import { cameraPermissionState, listCameras, requestCameraAccess } from '../camera';
import { api } from '../api';
import { refreshSession } from '../ui/account';

const panel = document.createElement('dialog'); panel.className = 'account-panel settings-panel';
document.body.append(panel);

function button(text: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button'); b.textContent = text; b.type = 'button'; b.dataset.dwell = ''; b.onclick = action; return b;
}
function row(label: string, control: HTMLElement): HTMLElement {
    const r = document.createElement('div'); r.className = 'row';
    const l = document.createElement('span'); l.textContent = label;
    r.append(l, control); return r;
}
function toggle(getOn: () => boolean, onChange: (on: boolean) => void): HTMLButtonElement {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.dwell = '';
    const render = () => { const on = getOn(); b.textContent = on ? t('settings.on') : t('settings.off'); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-on', on); };
    b.onclick = () => { onChange(!getOn()); render(); };
    render();
    return b;
}

async function cameraStatusText(): Promise<string> {
    const state = await cameraPermissionState();
    return t(`settings.camera.${state}`);
}

async function buildCameraSection(container: HTMLElement, settings: Settings): Promise<void> {
    const status = document.createElement('span'); status.textContent = await cameraStatusText();
    const hint = document.createElement('p'); hint.hidden = true; hint.textContent = t('settings.camera.hint');
    const requestBtn = button(t('settings.camera.request'), () => { void (async () => {
        await requestCameraAccess();
        status.textContent = await cameraStatusText();
        hint.hidden = (await cameraPermissionState()) !== 'denied';
    })(); });
    const camWrap = document.createElement('div'); camWrap.append(status, requestBtn);
    container.append(row(t('settings.camera'), camWrap), hint);
    hint.hidden = (await cameraPermissionState()) !== 'denied';

    const select = document.createElement('select'); select.dataset.dwell = '';
    const devices = await listCameras();
    const def = document.createElement('option'); def.value = ''; def.textContent = t('settings.camera.selectDefault'); select.append(def);
    for (const d of devices) { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label; select.append(o); }
    select.value = settings.cameraDeviceId || '';
    select.onchange = () => updateSettings({ cameraDeviceId: select.value || null });
    container.append(row(t('settings.camera.select'), select));
}

function buildLanguageSection(container: HTMLElement, settings: Settings): void {
    const select = document.createElement('select'); select.dataset.dwell = '';
    for (const lang of ['en', 'ru'] as const) { const o = document.createElement('option'); o.value = lang; o.textContent = lang.toUpperCase(); select.append(o); }
    select.value = settings.language;
    const note = document.createElement('p'); note.hidden = true; note.textContent = t('settings.language.reload');
    select.onchange = () => { updateSettings({ language: select.value as 'en' | 'ru' }); note.hidden = false; };
    container.append(row(t('settings.language'), select), note);
}

function buildResetSection(container: HTMLElement): void {
    const msg = document.createElement('p'); msg.hidden = true;
    let armed = false;
    const b = button(t('settings.reset'), () => {
        if (!armed) { armed = true; msg.hidden = false; msg.textContent = t('settings.reset.confirm'); return; }
        void (async () => {
            try { await api.logout(); await refreshSession(); msg.textContent = t('settings.reset.done'); } catch { /* offline: leave message as confirm */ }
            armed = false;
        })();
    });
    container.append(row(t('settings.reset'), b), msg);
}

export function openSettings(): void {
    panel.replaceChildren();
    const h = document.createElement('h2'); h.textContent = t('settings.title'); panel.append(h);
    const body = document.createElement('div'); panel.append(body);
    const settings = getSettings();

    // Styled slider for the mouse, plus −/+ buttons (5% steps) for the hand cursor.
    const volumeWrap = document.createElement('div'); volumeWrap.className = 'volume-control';
    const volumeSlider = document.createElement('input'); volumeSlider.type = 'range'; volumeSlider.min = '0'; volumeSlider.max = '100'; volumeSlider.step = '1';
    volumeSlider.className = 'volume-slider'; volumeSlider.setAttribute('aria-label', t('settings.musicVolume'));
    const volumeText = document.createElement('span'); volumeText.className = 'volume-value';
    const setVolume = (percent: number, save = true) => {
        const value = Math.max(0, Math.min(100, Math.round(percent)));
        volumeSlider.value = String(value);
        volumeSlider.style.setProperty('--fill', `${value}%`);
        volumeText.textContent = `${value}%`;
        if (save) updateSettings({ musicVolume: value / 100 });
    };
    setVolume((settings.musicVolume ?? 0.1) * 100, false);
    volumeSlider.oninput = () => setVolume(Number(volumeSlider.value));
    const step = (label: string, delta: number) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.dwell = ''; b.className = 'volume-step';
        b.textContent = label; b.setAttribute('aria-label', `${t('settings.musicVolume')} ${label}`);
        b.onclick = () => setVolume(Number(volumeSlider.value) + delta);
        return b;
    };
    volumeWrap.append(step('−', -5), volumeSlider, step('+', 5), volumeText);

    body.append(
        row(t('settings.sfx'), toggle(() => getSettings().sfx, on => updateSettings({ sfx: on }))),
        row(t('settings.music'), toggle(() => getSettings().music, on => updateSettings({ music: on }))),
        row(t('settings.musicVolume'), volumeWrap),
    );
    void buildCameraSection(body, settings);
    body.append(
        row(t('settings.mirror'), toggle(() => getSettings().mirror, on => updateSettings({ mirror: on }))),
        row(t('settings.skeleton'), toggle(() => getSettings().showSkeleton, on => updateSettings({ showSkeleton: on }))),
        row(t('settings.hints'), toggle(() => getSettings().hints, on => updateSettings({ hints: on }))),
    );
    buildLanguageSection(body, settings);
    buildResetSection(body);

    panel.append(button(t('settings.close'), () => panel.close()));
    if (!panel.open) panel.showModal();
}
