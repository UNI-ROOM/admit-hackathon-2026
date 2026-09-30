// Hand cursor for the whole interface: the index fingertip moves a cursor over
// buttons. Two ways to click: touch thumb to middle finger (instant, the index
// finger stays on target), or hold the cursor on a button for 1 s (dwell, as
// taught in the tutorial). Mouse input keeps working alongside it.
import { isPointing, isThumbMiddleTouch } from '../utils';
import { getSettings } from '../settings';
import type { HandLandmarks } from '../hands';

const DWELL_MS = 1000;
const CLICK_COOLDOWN_MS = 600;
// Camera edges are hard to reach with a hand, so the inner 80% of the frame
// already covers the whole screen.
const EDGE = 0.1;
const SMOOTHING = 0.45;
// A shaky hand briefly slipping off a button edge must not restart the dwell.
const TARGET_GRACE_MS = 200;
// After a click, dwell re-arms only once the cursor moves this far, so holding
// still on a button (or a toggle that re-renders) doesn't click it again.
const REARM_DISTANCE_PX = 40;

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
let pending: { el: HTMLElement | null; since: number } | null = null;
let dwellLock: { x: number; y: number } | null = null;
let wasTouching = false;
let lastClick = 0;
let dialogsOnTop = -1;

// Outside gameplay the cursor follows any visible hand and dwell works with any
// hand pose; in gameplay both need an explicit pointing gesture, so grabbing
// objects neither shows the cursor nor clicks the HUD.
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
    pending = null;
    if (el === target) return;
    target?.classList.remove('hand-hover');
    target = el;
    dwellStart = now;
    target?.classList.add('hand-hover');
}

function updateTarget(el: HTMLElement | null, now: number): void {
    if (el === target) { pending = null; return; }
    // Switch at once onto a first target or away from a removed one; otherwise
    // only after the cursor has stayed off the current target for a moment.
    if (!target || !target.isConnected) { setTarget(el, now); return; }
    if (!pending || pending.el !== el) pending = { el, since: now };
    if (now - pending.since >= TARGET_GRACE_MS) setTarget(el, now);
}

function activate(el: HTMLElement, now: number): void {
    lastClick = now;
    dwellStart = now;
    if (pos) dwellLock = { ...pos };
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
    return hands.find(h => h && (isPointing(h) || isThumbMiddleTouch(h, wasTouching))) || hands.find(Boolean) || null;
}

export function handlePointer(hands: (HandLandmarks | null)[]): void {
    const now = Date.now();
    const hand = pickHand(hands);
    const ui = uiContext();
    const pointing = !!hand && isPointing(hand);
    const touching = !!hand && isThumbMiddleTouch(hand, wasTouching);

    if (!hand || (!ui && !pointing && !touching)) {
        show(false); setTarget(null, now); pos = null; wasTouching = false; dwellLock = null;
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
    updateTarget(el, now);
    if (dwellLock && Math.hypot(pos.x - dwellLock.x, pos.y - dwellLock.y) > REARM_DISTANCE_PX) {
        dwellLock = null;
        dwellStart = now;
    }

    const cooling = now - lastClick < CLICK_COOLDOWN_MS;
    const canDwell = (ui || pointing) && !touching && !dwellLock && !cooling;
    let progress = 0;
    if (touching && !wasTouching && !cooling) {
        if (target?.isConnected) activate(target, now);
    } else if (canDwell && target?.isConnected) {
        progress = Math.min(1, (now - dwellStart) / DWELL_MS);
        if (progress >= 1) { activate(target, now); progress = 0; }
    }
    wasTouching = touching;
    cursor.style.setProperty('--progress', String(progress));
    cursor.classList.toggle('hand-cursor--active', !!target);
}
