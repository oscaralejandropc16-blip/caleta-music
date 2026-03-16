/**
 * KeepAwake - Prevents Safari from suspending the PWA audio session
 * when the screen is locked or the app is in background.
 * 
 * Uses the Web Audio API to maintain a near-silent oscillator running,
 * which tricks Safari into keeping the audio thread (and JS execution) alive.
 * Also periodically "tickles" the audio context to prevent iOS from
 * garbage-collecting it.
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
        // Create or resume AudioContext
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new AudioContextClass();
        }

        // Resume if suspended (Safari requires user gesture to start)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => { });
        }

        // Create a gain node with near-zero volume (not exactly 0, Safari optimizes 0 away)
        gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.001; // Inaudible but keeps the session alive

        // Create oscillator at a frequency humans can barely hear
        oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 1; // 1 Hz - completely inaudible even at volume

        // Connect: oscillator -> gain -> destination
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();

        // Periodically "tickle" the audio context to prevent Safari from killing it
        keepAliveInterval = setInterval(() => {
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => { });
            }
            // Create and immediately destroy a tiny buffer to keep the context active
            if (audioCtx && audioCtx.state === 'running') {
                try {
                    const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
                    const source = audioCtx.createBufferSource();
                    source.buffer = buffer;
                    source.connect(audioCtx.destination);
                    source.start();
                    source.stop(audioCtx.currentTime + 0.001);
                } catch { /* ignore */ }
            }
        }, 10000); // Every 10 seconds

        console.log('[KeepAwake] Silent oscillator started');
    } catch (e) {
        console.warn('[KeepAwake] Failed to start:', e);
    }
}

/**
 * Stop the keep-alive audio loop.
 * Call this when all audio playback stops completely (not on pause).
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
        // Don't close the AudioContext - we may need it again soon
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
