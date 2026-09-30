export const HANDS_ASSETS = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const pending = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
    const existing = pending.get(src);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.async = true;
        const timer = setTimeout(() => fail(), 15000);
        function fail() {
            clearTimeout(timer); script.remove(); pending.delete(src);
            reject(new Error('Hand tracking script unavailable'));
        }
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = fail;
        document.head.append(script);
    });
    pending.set(src, promise);
    return promise;
}
export async function loadTrackingRuntime(): Promise<void> {
    const globals = window as unknown as Record<string, unknown>;
    const scripts: [string, string][] = [
        ['Hands', HANDS_ASSETS + 'hands.js'],
        ['Camera', 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js'],
        ['drawConnectors', 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js'],
    ];
    await Promise.all(scripts.map(([name, src]) => globals[name] ? Promise.resolve() : loadScript(src)));
}
