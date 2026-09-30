// Hand cursor for the whole interface: the index fingertip moves a cursor over
// buttons; hold it still for 1 s (dwell) or pinch to click — the same controls
// the tutorial teaches. Mouse input keeps working alongside it.
import { isPinching, isPointing } from '../utils';
import { getSettings } from '../settings';
import type { HandLandmarks } from '../hands';

const DWELL_MS = 1000;
const CLICK_COOLDOWN_MS = 600;
// A pinch closes thumb onto index and shifts the fingertip; click whatever was
// under the cursor just before the pinch started.
const PINCH_TARGET_MEMORY_MS = 400;
// Camera edges are hard to reach with a hand, so the inner 80% of the frame
// already covers the whole screen.
const EDGE = 0.1;
const SMOOTHING = 0.45;

const CLICKABLE = 'button, select, [data-dwell]';

const cursor = document.createElement('div');
cursor.className = 'hand-cursor';
cursor.hidden = true;
const usePopover = typeof cursor.showPopover === 'function';
if (usePopover) cursor.popover = 'manual';
document.body.append(cursor);

let pos: { x: number; y: number } | null = null;
let target: HTMLElement | null = null;
let dwellStart = 0;
let lastTarget: { el: HTMLElement; at: number } | null = null;
let wasPinching = false;
let lastClick = 0;
let dialogsOnTop = -1;

// In active gameplay a pinch grabs game objects, so there it must not click
// the HUD; in menus and dialogs a pinch is a click.
let uiContext = () => true;
export function setUiContext(fn: () => boolean): void { uiContext = fn; }

function show(visible: boolean): void {
    if (cursor.hidden === !visible) return;
    cursor.hidden = !visible;
    if (usePopover) visible ? cursor.showPopover() : cursor.hidePopover();
}

// Modal dialogs live in the browser's top layer; re-open the cursor popover
// whenever the set of open dialogs changes so it stays above them.
function keepOnTop(): void {
    const open = document.querySelectorAll('dialog[open]').length;
    if (!usePopover || open === dialogsOnTop || cursor.hidden) return;
    dialogsOnTop = open;
    cursor.hidePopover();
    cursor.showPopover();
}

function setTarget(el: HTMLElement | null, now: number): void {
    if (el === target) return;
    target?.classList.remove('hand-hover');
    target = el;
    dwellStart = now;
    target?.classList.add('hand-hover');
}

function activate(el: HTMLElement, now: number): void {
    lastClick = now;
    dwellStart = now;
    if (el instanceof HTMLSelectElement) {
        // Native dropdowns can't be driven by a synthetic click: cycle options.
        el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        el.click();
    }
    cursor.classList.add('hand-cursor--click');
    setTimeout(() => cursor.classList.remove('hand-cursor--click'), 180);
}

function pickHand(hands: (HandLandmarks | null)[]): HandLandmarks | null {
    return hands.find(h => h && (isPointing(h) || isPinching(h))) || hands.find(Boolean) || null;
}

export function handlePointer(hands: (HandLandmarks | null)[]): void {
    const now = Date.now();
    const hand = pickHand(hands);
    const ui = uiContext();
    const pointing = !!hand && isPointing(hand);
    const pinching = !!hand && isPinching(hand);

    // In gameplay only an explicit pointing gesture shows the cursor.
    if (!hand || (!ui && !pointing)) {
        show(false); setTarget(null, now); pos = null; wasPinching = false;
        return;
    }

    const tip = hand[8];
    const nx = Math.min(1, Math.max(0, (tip.x - EDGE) / (1 - 2 * EDGE)));
    const ny = Math.min(1, Math.max(0, (tip.y - EDGE) / (1 - 2 * EDGE)));
    const raw = { x: (getSettings().mirror ? 1 - nx : nx) * innerWidth, y: ny * innerHeight };
    pos = pos ? { x: pos.x + (raw.x - pos.x) * SMOOTHING, y: pos.y + (raw.y - pos.y) * SMOOTHING } : raw;

    show(true);
    keepOnTop();
    cursor.style.left = `${pos.x}px`;
    cursor.style.top = `${pos.y}px`;

    const hit = document.elementFromPoint(pos.x, pos.y)?.closest<HTMLElement>(CLICKABLE) || null;
    const el = hit && !(hit as HTMLButtonElement).disabled ? hit : null;
    if (!pinching) {
        setTarget(el, now);
        if (el) lastTarget = { el, at: now };
    }

    const cooling = now - lastClick < CLICK_COOLDOWN_MS;
    let progress = 0;
    if (pinching && !wasPinching && ui && !cooling) {
        const remembered = lastTarget && now - lastTarget.at < PINCH_TARGET_MEMORY_MS ? lastTarget.el : null;
        const pinchTarget = remembered || el;
        if (pinchTarget?.isConnected) activate(pinchTarget, now);
    } else if (pointing && target && !cooling) {
        progress = Math.min(1, (now - dwellStart) / DWELL_MS);
        if (progress >= 1) { activate(target, now); progress = 0; }
    }
    wasPinching = pinching;
    cursor.style.setProperty('--progress', String(progress));
    cursor.classList.toggle('hand-cursor--active', !!target);
}
