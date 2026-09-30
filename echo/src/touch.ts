import type { HandLandmarks } from './hands';

export interface TouchTarget { x: number; y: number; width?: number; height?: number; }
interface Contact { id: number; x: number; y: number; offsetX: number; offsetY: number; }
export type TouchHands = [HandLandmarks | null, HandLandmarks | null];

export function pointerPosition(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
    return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}

export function touchLandmarks(x: number, y: number): HandLandmarks {
    return Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
}

export class TouchController {
    private contacts: [Contact | null, Contact | null] = [null, null];

    constructor(private canvas: HTMLCanvasElement, private options: {
        enabled: () => boolean;
        slots: () => 1 | 2;
        targets: (slot: number) => TouchTarget[];
        release: (slot: number) => void;
        activate: () => void;
    }) {
        canvas.addEventListener('pointerdown', event => this.down(event));
        canvas.addEventListener('pointermove', event => this.move(event));
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
            canvas.addEventListener(name, event => this.release(event.pointerId));
        }
        canvas.addEventListener('contextmenu', event => event.preventDefault());
    }

    get hands(): TouchHands {
        return this.contacts.map(contact => contact ? touchLandmarks(contact.x, contact.y) : null) as TouchHands;
    }

    reset(): void {
        for (const contact of [...this.contacts]) if (contact) this.release(contact.id);
    }

    private release(id: number): void {
        const slot = this.contacts.findIndex(contact => contact?.id === id);
        if (slot < 0) return;
        this.contacts[slot] = null;
        this.options.release(slot);
        if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }

    private down(event: PointerEvent): void {
        if (!this.options.enabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const slot = this.contacts.slice(0, this.options.slots()).findIndex(contact => !contact);
        if (slot < 0) return;
        const rect = this.canvas.getBoundingClientRect();
        const point = pointerPosition(event.clientX, event.clientY, rect);
        const targets = this.options.targets(slot).map(target => ({ target,
            distance: Math.hypot((point.x - target.x) * rect.width, (point.y - target.y) * rect.height) }))
            .filter(({ target, distance }) => distance <= Math.max(28, (target.width ?? 0) * rect.width / 2,
                (target.height ?? 0) * rect.height / 2))
            .sort((a, b) => a.distance - b.distance);
        const target = targets[0]?.target;
        if (!target) return;
        event.preventDefault();
        this.options.activate();
        this.contacts[slot] = { id: event.pointerId, x: target.x, y: target.y,
            offsetX: target.x - point.x, offsetY: target.y - point.y };
        this.canvas.setPointerCapture(event.pointerId);
    }

    private move(event: PointerEvent): void {
        const contact = this.contacts.find(candidate => candidate?.id === event.pointerId);
        if (!contact) return;
        if (!this.options.enabled()) { this.reset(); return; }
        event.preventDefault();
        const point = pointerPosition(event.clientX, event.clientY, this.canvas.getBoundingClientRect());
        contact.x = Math.max(.02, Math.min(.98, point.x + contact.offsetX));
        contact.y = Math.max(.02, Math.min(.98, point.y + contact.offsetY));
    }
}
