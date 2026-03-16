/**
 * KeepAwake - Prevents Safari from suspending the PWA audio session
 * when the screen is locked or the app is in background.
 * 
 * Uses the Web Audio API to maintain a near-silent oscillator running,
 * which tricks Safari into keeping the audio thread (and JS execution) alive.
 */

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let isActive = false;

/**
 * Start the keep-alive silent audio loop.
 * Call this when audio playback begins.
 */
export function startKeepAwake() {
    if (isActive) return;
    isActive = true;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new AudioContextClass() as AudioContext;
        }

        const ctx = audioCtx;
        if (!ctx) return;

        // Resume if suspended (Safari requires user gesture to start)
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => { /* ignore */ });
        }

        // Create a gain node with near-zero volume
        gainNode = ctx.createGain();
        gainNode.gain.value = 0.001;

        // Create oscillator at inaudible frequency
        oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 1;

        // Connect: oscillator -> gain -> destination
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();

        // Periodically tickle the audio context to prevent Safari from killing it
        keepAliveInterval = setInterval(() => {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => { /* ignore */ });
            }
            if (audioCtx.state === 'running') {
                try {
                    const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
                    const source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioCtx.destination);
                    source.start();
                    source.stop(audioCtx.currentTime + 0.001);
                } catch {
                    // ignore
                }
            }
        }, 10000);

        console.log('[KeepAwake] Silent oscillator started');
    } catch (e) {
        console.warn('[KeepAwake] Failed to start:', e);
    }
}

/**
 * Stop the keep-alive audio loop.
 */
export function stopKeepAwake() {
    if (!isActive) return;
    isActive = false;

    try {
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
        if (gainNode) {
            gainNode.disconnect();
            gainNode = null;
        }
        console.log('[KeepAwake] Silent oscillator stopped');
    } catch (e) {
        console.warn('[KeepAwake] Failed to stop:', e);
    }
}

/**
 * Check if keep-alive is currently active.
 */
export function isKeepAwakeActive(): boolean {
    return isActive;
}
