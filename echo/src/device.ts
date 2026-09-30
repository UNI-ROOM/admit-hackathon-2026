export const touchDevice = typeof window !== 'undefined'
    && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;

if (touchDevice) document.documentElement.classList.add('touch-device');
