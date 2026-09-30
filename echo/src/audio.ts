// Web Audio API procedural sound effects for ECHO

export type SfxId = 'grab' | 'drop' | 'burn' | 'crystal_charge' | 'crystal_ready' | 'switch' | 'win';

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
            audioCtx = new AudioCtxClass();
        }
    }
    return audioCtx;
}

export function unlockAudioContext(): void {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    if (musicEnabled) {
        startMusic();
    }
}

// ---------------------------------------------------------------------------
// SFX enable/disable
// ---------------------------------------------------------------------------

let sfxEnabled = true;

export function setSfxEnabled(on: boolean): void {
    sfxEnabled = on;
}

// ---------------------------------------------------------------------------
// Background music playback: /bg-music.mp3
// ---------------------------------------------------------------------------

let musicEnabled = true;
let musicPlaying = false;
let musicAudio: HTMLAudioElement | null = null;
let musicVolume = 0.01;

export function setMusicVolume(volume: number): void {
    if (typeof volume !== 'number' || isNaN(volume)) {
        volume = 0.01;
    }
    musicVolume = Math.max(0.0, Math.min(1.0, volume));
    if (musicAudio) {
        musicAudio.volume = musicVolume;
    }
}

function getMusicAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!musicAudio) {
        musicAudio = new Audio('/bg-music.mp3');
        musicAudio.preload = 'auto';
        musicAudio.loop = true;
        musicAudio.volume = musicVolume;
        musicAudio.load();
    }
    return musicAudio;
}

let playPromise: Promise<void> | null = null;

export function startMusic(): void {
    if (musicPlaying || !musicEnabled) return;
    const audio = getMusicAudio();
    if (!audio) return;

    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    if (playPromise) return;

    playPromise = audio.play();
    playPromise.then(() => {
        musicPlaying = true;
        playPromise = null;
    }).catch((err) => {
        playPromise = null;
        console.warn('Background music playback blocked or failed:', err);
    });
}

export function stopMusic(): void {
    const audio = getMusicAudio();
    if (audio) {
        audio.pause();
    }
    musicPlaying = false;
}

export function setMusicEnabled(on: boolean): void {
    musicEnabled = on;
    if (!on) {
        stopMusic();
        return;
    }
    startMusic();
}

// Debounce limits in ms to prevent audio spamming in 60fps loops
const DEBOUNCE_MS: Record<SfxId, number> = {
    grab: 60,
    drop: 60,
    burn: 300,
    crystal_charge: 90,
    crystal_ready: 500,
    switch: 120,
    win: 1500
};

const lastPlayTimes: Partial<Record<SfxId, number>> = {};

function playGrab(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
}

function playDrop(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.07);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
}

function playBurn(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(120, now);
    osc1.frequency.exponentialRampToValueAtTime(45, now + 0.25);

    osc2.frequency.setValueAtTime(127, now); // Dissonant minor second
    osc2.frequency.exponentialRampToValueAtTime(42, now + 0.25);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.25);
    osc2.stop(now + 0.25);
}

function playCrystalCharge(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const pitchJitter = (Math.random() - 0.5) * 60;
    const fStart = Math.max(200, 1480 + pitchJitter);
    const fEnd = Math.max(200, 1800 + pitchJitter);

    osc.frequency.setValueAtTime(fStart, now);
    osc.frequency.exponentialRampToValueAtTime(fEnd, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
}

function playCrystalReady(ctx: AudioContext): void {
    const now = ctx.currentTime;
    // Radiant chord chime arpeggio (E major shimmer): E5, G#5, B5, E6, G#6
    const freqs = [659.25, 830.61, 987.77, 1318.51, 1661.22];
    freqs.forEach((freq, idx) => {
        const tStart = now + idx * 0.06;
        const dur = 0.45;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, tStart);

        gain.gain.setValueAtTime(0.0001, tStart);
        gain.gain.exponentialRampToValueAtTime(0.14, tStart + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, tStart + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(tStart);
        osc.stop(tStart + dur);
    });
}

function playSwitch(ctx: AudioContext): void {
    const now = ctx.currentTime;

    // Body thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // Crisp high transient click
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(1200, now);
    click.frequency.exponentialRampToValueAtTime(200, now + 0.02);

    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.02);
}

function playWin(ctx: AudioContext): void {
    const now = ctx.currentTime;
    // Triumphant victory fanfare arpeggio: C5 -> E5 -> G5 -> C6
    const arpNotes = [
        { f: 523.25, t: 0.0, d: 0.12 },
        { f: 659.25, t: 0.12, d: 0.12 },
        { f: 783.99, t: 0.24, d: 0.12 },
        { f: 1046.50, t: 0.36, d: 0.45 }
    ];

    arpNotes.forEach(({ f, t, d }) => {
        const tStart = now + t;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, tStart);

        gain.gain.setValueAtTime(0.0001, tStart);
        gain.gain.exponentialRampToValueAtTime(0.2, tStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, tStart + d);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(tStart);
        osc.stop(tStart + d);
    });

    // Sustained triumph chord
    const chordNotes = [523.25, 659.25, 783.99, 1046.50];
    const chordStart = now + 0.42;
    const chordDur = 0.75;
    chordNotes.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, chordStart);

        gain.gain.setValueAtTime(0.0001, chordStart);
        gain.gain.exponentialRampToValueAtTime(0.12, chordStart + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, chordStart + chordDur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(chordStart);
        osc.stop(chordStart + chordDur);
    });
}

export function playSfx(id: SfxId): void {
    if (!sfxEnabled) return;

    const nowMs = Date.now();
    const lastTime = lastPlayTimes[id] ?? 0;
    const minInterval = DEBOUNCE_MS[id] ?? 50;

    if (nowMs - lastTime < minInterval) {
        return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    lastPlayTimes[id] = nowMs;

    try {
        switch (id) {
            case 'grab':
                playGrab(ctx);
                break;
            case 'drop':
                playDrop(ctx);
                break;
            case 'burn':
                playBurn(ctx);
                break;
            case 'crystal_charge':
                playCrystalCharge(ctx);
                break;
            case 'crystal_ready':
                playCrystalReady(ctx);
                break;
            case 'switch':
                playSwitch(ctx);
                break;
            case 'win':
                playWin(ctx);
                break;
        }
    } catch {
        // Silently continue if audio playback fails
    }
}

// Runs last: the music state above must be initialized first (a bundled
// module turns an earlier call into volume = undefined and aborts startup).
// Auto-unlock on first user gesture/interaction anywhere on the page
if (typeof window !== 'undefined') {
    // Eagerly pre-load audio file in memory
    getMusicAudio();

    const events = ['click', 'pointerdown', 'keydown', 'touchstart', 'mousemove', 'pointermove', 'focus'];
    const unlocker = () => {
        unlockAudioContext();
        if (musicPlaying) {
            events.forEach(evt => window.removeEventListener(evt, unlocker));
        }
    };
    events.forEach(evt => window.addEventListener(evt, unlocker, { passive: true, capture: true }));

    // Attempt immediate playback on initial script load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        unlockAudioContext();
    } else {
        window.addEventListener('DOMContentLoaded', () => unlockAudioContext(), { once: true });
    }
}
