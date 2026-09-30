// Scene router: Menu -> Level Select -> Game.
// Toggles the `hidden` attribute on the three top-level scene containers and
// notifies listeners. Also owns the "enter game" hook so the camera can be
// started lazily (only once the player actually enters the game scene).

export type SceneName = 'menu' | 'levels' | 'game';

const SCENE_IDS: Record<SceneName, string> = {
    menu: 'scene-menu',
    levels: 'scene-levels',
    game: 'game-container'
};

let currentScene: SceneName = 'menu';
const changeListeners: Array<(scene: SceneName) => void> = [];
const enterGameListeners: Array<() => void> = [];

export function show(scene: SceneName): void {
    currentScene = scene;
    (Object.keys(SCENE_IDS) as SceneName[]).forEach(name => {
        const el = document.getElementById(SCENE_IDS[name]);
        if (el) el.hidden = name !== scene;
    });
    if (scene === 'game') {
        enterGameListeners.forEach(cb => cb());
    }
    changeListeners.forEach(cb => cb(scene));
}

export function current(): SceneName {
    return currentScene;
}

export function onChange(cb: (scene: SceneName) => void): void {
    changeListeners.push(cb);
}

// Registers a callback that runs every time the game scene is entered
// (used by main.ts to lazily start the camera on first entry).
export function onEnterGame(cb: () => void): void {
    enterGameListeners.push(cb);
}
