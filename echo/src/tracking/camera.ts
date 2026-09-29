export async function setupCamera(videoElement: HTMLVideoElement): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
        },
        audio: false
    });
    
    videoElement.srcObject = stream;
    
    // Mirror the video horizontally for 'user' facing camera
    videoElement.style.transform = 'scaleX(-1)';
    
    return new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
            videoElement.play().catch(console.error);
        };
        
        const onPlaying = () => {
            videoElement.removeEventListener('playing', onPlaying);
            resolve();
        };
        videoElement.addEventListener('playing', onPlaying);
    });
}
