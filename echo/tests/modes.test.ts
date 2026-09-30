import test from 'node:test';
import assert from 'node:assert/strict';
import { show, current, onChange, onEnterGame, type SceneName } from '../src/scenes/router';

test('mode navigation exposes exactly one scene and notifies after visibility is updated', () => {
    const ids: Record<SceneName, string> = {
        menu: 'scene-menu', modes: 'scene-modes', levels: 'scene-levels',
        game: 'game-container', game3d: 'scene-game3d'
    };
    const elements = new Map(Object.values(ids).map(id => [id, { hidden: true }]));
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { getElementById: (id: string) => elements.get(id) ?? null }
    });
    let observing = true;
    const observed: SceneName[] = [];
    let twoDEntries = 0;
    onChange(scene => {
        if (!observing) return;
        observed.push(scene);
        assert.equal(current(), scene);
        for (const [name, id] of Object.entries(ids)) {
            assert.equal(elements.get(id)!.hidden, name !== scene,
                `${name} visibility must be updated before ${scene} listeners run`);
        }
    });
    onEnterGame(() => { if (observing) twoDEntries++; });
    try {
        const itinerary: SceneName[] = [
            'menu', 'modes', 'levels', 'game', 'levels', 'modes',
            'game3d', 'modes', 'game3d', 'menu', 'modes', 'levels', 'game'
        ];
        for (const scene of itinerary) show(scene);
        assert.deepEqual(observed, itinerary);
        assert.equal(twoDEntries, 2, '3D entry must not start the 2D game hook');
    } finally {
        observing = false;
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});

test('a scene change tolerates missing optional containers', () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const game = { hidden: true };
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: { getElementById: (id: string) => id === 'scene-game3d' ? game : null }
    });
    try {
        show('game3d');
        assert.equal(game.hidden, false);
        show('menu');
        assert.equal(game.hidden, true);
        assert.equal(current(), 'menu');
    } finally {
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
        else Reflect.deleteProperty(globalThis, 'document');
    }
});
