// Client-side device preferences (not game progress — that lives on the server).
// Persisted to localStorage under 'vencera.settings'.

import { setSfxEnabled, setMusicEnabled } from './audio';

export interface Settings {
    sfx: boolean;
    music: boolean;
    mirror: boolean;
    showSkeleton: boolean;
    hints: boolean;
    language: 'en' | 'ru';
    cameraDeviceId: string | null;
}

const STORAGE_KEY = 'vencera.settings';

const DEFAULT_SETTINGS: Settings = {
    sfx: true,
    music: true,
    mirror: true,
    showSkeleton: true,
    hints: true,
    language: 'en',
    cameraDeviceId: null
};

type Listener = (settings: Settings) => void;

function getStorage(): Storage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch {
        return null;
    }
}

function loadSettings(): Settings {
    const storage = getStorage();
    if (!storage) return { ...DEFAULT_SETTINGS };

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settings: Settings): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // ignore quota/serialization errors
    }
}

function applyAudioSettings(settings: Settings): void {
    try {
        setSfxEnabled(settings.sfx);
        setMusicEnabled(settings.music);
    } catch {
        // audio may be unavailable (e.g. Node test environment)
    }
}

let currentSettings: Settings = loadSettings();
const listeners = new Set<Listener>();

// Apply audio state on module load.
applyAudioSettings(currentSettings);

export function getSettings(): Settings {
    return currentSettings;
}

export function updateSettings(partial: Partial<Settings>): Settings {
    currentSettings = { ...currentSettings, ...partial };
    saveSettings(currentSettings);
    applyAudioSettings(currentSettings);
    listeners.forEach(listener => listener(currentSettings));
    return currentSettings;
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function resetSettings(): Settings {
    currentSettings = { ...DEFAULT_SETTINGS };
    saveSettings(currentSettings);
    applyAudioSettings(currentSettings);
    listeners.forEach(listener => listener(currentSettings));
    return currentSettings;
}
