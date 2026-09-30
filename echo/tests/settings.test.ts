import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key)! : null;
    }
    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
    removeItem(key: string): void {
        this.store.delete(key);
    }
    clear(): void {
        this.store.clear();
    }
}

(globalThis as unknown as { localStorage: FakeStorage }).localStorage = new FakeStorage();

const { getSettings, updateSettings, subscribe, resetSettings } = await import('../src/settings');

test('defaults are correct', () => {
    resetSettings();
    const s = getSettings();
    assert.deepEqual(s, {
        sfx: true,
        music: true,
        musicVolume: 0.01,
        mirror: true,
        showSkeleton: true,
        hints: true,
        language: 'en',
        cameraDeviceId: null
    });
});

test('updateSettings persists to localStorage and round-trips', () => {
    resetSettings();
    updateSettings({ sfx: false, language: 'ru' });
    const s = getSettings();
    assert.equal(s.sfx, false);
    assert.equal(s.language, 'ru');

    const raw = (globalThis as unknown as { localStorage: FakeStorage }).localStorage.getItem('vencera.settings');
    assert.ok(raw);
    const parsed = JSON.parse(raw!);
    assert.equal(parsed.sfx, false);
    assert.equal(parsed.language, 'ru');
});

test('corrupt JSON in localStorage does not crash a fresh load', async () => {
    const storage = (globalThis as unknown as { localStorage: FakeStorage }).localStorage;
    storage.setItem('vencera.settings', '{not valid json');

    resetSettings();
    const s = getSettings();
    assert.equal(typeof s.sfx, 'boolean');
});

test('subscribe is called on update and unsubscribe stops notifications', () => {
    resetSettings();
    let callCount = 0;
    let lastSettings = getSettings();
    const unsubscribe = subscribe((s) => {
        callCount += 1;
        lastSettings = s;
    });

    updateSettings({ mirror: false });
    assert.equal(callCount, 1);
    assert.equal(lastSettings.mirror, false);

    unsubscribe();
    updateSettings({ mirror: true });
    assert.equal(callCount, 1, 'listener should not fire after unsubscribe');
});

test('resetSettings restores defaults and notifies subscribers', () => {
    updateSettings({ sfx: false, hints: false, mirror: false });
    let notified = false;
    const unsubscribe = subscribe(() => { notified = true; });

    const s = resetSettings();
    unsubscribe();

    assert.equal(notified, true);
    assert.deepEqual(s, {
        sfx: true,
        music: true,
        musicVolume: 0.01,
        mirror: true,
        showSkeleton: true,
        hints: true,
        language: 'en',
        cameraDeviceId: null
    });
});
