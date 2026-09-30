
export type SceneName = 'intro' | 'menu' | 'modes' | 'levels' | 'game' | 'game3d';

const SCENE_IDS: Record<SceneName, string> = {
    intro: 'scene-intro',
    menu: 'scene-menu',
    modes: 'scene-modes',
    levels: 'scene-levels',
    game: 'game-container',
    game3d: 'scene-game3d'
};

let currentScene: SceneName = 'intro';
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

export function onEnterGame(cb: () => void): void {
    enterGameListeners.push(cb);
}
