// Device capability, not screen width: resizing a desktop must keep hand controls.
export const touchDevice = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;

if (touchDevice) document.documentElement.classList.add('touch-device');
