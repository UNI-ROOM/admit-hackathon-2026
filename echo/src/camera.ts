// Camera helpers for the Settings panel (permission status, device listing,
// requesting access). Kept dependency-free from the rest of the game so the
// Settings UI can use these without pulling in main.ts.

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export async function cameraPermissionState(): Promise<CameraPermissionState> {
    try {
        if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
            return 'unknown';
        }
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        const state = status.state;
        if (state === 'granted' || state === 'denied' || state === 'prompt') {
            return state;
        }
        return 'unknown';
    } catch {
        // Firefox (and some browsers) throw for unsupported permission names.
        return 'unknown';
    }
}

export interface CameraDevice {
    deviceId: string;
    label: string;
}

export async function listCameras(): Promise<CameraDevice[]> {
    try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
            return [];
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        return videoInputs.map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label && device.label.length > 0 ? device.label : `Camera ${index + 1}`
        }));
    } catch {
        return [];
    }
}

export async function requestCameraAccess(): Promise<boolean> {
    try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            return false;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch {
        return false;
    }
}
