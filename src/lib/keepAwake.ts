/**
 * KeepAwake - Prevents Safari/iOS from suspending the PWA audio session
 * when the screen is locked or the app is in background.
 * 
 * Uses the Web Audio API to maintain a near-silent oscillator running,
 * which tricks Safari into keeping the audio thread (and JS execution) alive.
 * 
 * CRITICAL for iOS PWA: The oscillator must NOT be stopped during pause,
 * only gain-silenced. Stopping the oscillator allows iOS to reclaim
 * the audio session and kill JS execution.
 */

let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let isActive = false;
let isInitialized = false;

/**
 * Initialize the audio context and oscillator.
 * This only needs to happen once (must be triggered by user gesture on iOS).
 */
function ensureInitialized() {
    if (isInitialized && audioCtx && audioCtx.state !== 'closed') return;

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        audioCtx = new AudioContextClass() as AudioContext;
        const ctx = audioCtx;

        // Create a gain node — this controls audibility without destroying the oscillator
        gainNode = ctx.createGain();
        gainNode.gain.value = 0.001; // Near-silent but keeps audio route alive

        // Create oscillator at inaudible frequency
        oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 1; // 1Hz = completely inaudible

        // Connect: oscillator -> gain -> destination
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start();

        isInitialized = true;
        console.log('[KeepAwake] Audio context and oscillator initialized');
    } catch (e) {
        console.warn('[KeepAwake] Failed to initialize:', e);
    }
}

/**
 * Start the keep-alive silent audio loop.
 * Call this when audio playback begins.
 */
export function startKeepAwake() {
    if (isActive) return;
    isActive = true;

    try {
        ensureInitialized();

        if (!audioCtx) return;

        // Resume if suspended (required after iOS background return)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => { /* ignore */ });
        }

        // Ensure gain is at keep-alive level
        if (gainNode) {
            gainNode.gain.value = 0.001;
        }

        // Periodically tickle the audio context to prevent Safari from killing it
        // iOS is aggressive — every 5 seconds is safer than 10
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        keepAliveInterval = setInterval(() => {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => { /* ignore */ });
            }
            if (audioCtx.state === 'running') {
                try {
                    // Play a tiny silent buffer to keep the audio session "active"
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
        }, 5000);

        // Handle visibility changes — critical for iOS background/foreground transitions
        if (!visibilityHandler) {
            visibilityHandler = () => {
                if (document.visibilityState === 'visible' && audioCtx) {
                    // Coming back to foreground — resume audio context immediately
                    if (audioCtx.state === 'suspended') {
                        console.log('[KeepAwake] Resuming audio context after returning to foreground');
                        audioCtx.resume().catch(() => { /* ignore */ });
                    }
                }
            };
            document.addEventListener('visibilitychange', visibilityHandler);
        }

        console.log('[KeepAwake] Silent oscillator started');
    } catch (e) {
        console.warn('[KeepAwake] Failed to start:', e);
    }
}

/**
 * Stop the keep-alive audio loop.
 * IMPORTANT: We do NOT destroy the oscillator or AudioContext.
 * We only reduce the gain to zero. This allows iOS to maintain the
 * audio session so that play/pause from lock screen still works.
 */
export function stopKeepAwake() {
    if (!isActive) return;
    isActive = false;

    try {
        // Only clear the tickle interval, don't destroy the audio graph
        if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
        }

        // Reduce gain to zero but keep oscillator running
        // This allows iOS to maintain the audio route
        if (gainNode) {
            gainNode.gain.value = 0;
        }

        console.log('[KeepAwake] Silent oscillator paused (gain=0, session preserved)');
    } catch (e) {
        console.warn('[KeepAwake] Failed to stop:', e);
    }
}

/**
 * Fully destroy the audio context. Only call this on app cleanup.
 */
export function destroyKeepAwake() {
    stopKeepAwake();
    try {
        if (visibilityHandler) {
            document.removeEventListener('visibilitychange', visibilityHandler);
            visibilityHandler = null;
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
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => { /* ignore */ });
        }
        audioCtx = null;
        isInitialized = false;
        console.log('[KeepAwake] Fully destroyed');
    } catch (e) {
        console.warn('[KeepAwake] Failed to destroy:', e);
    }
}

/**
 * Check if keep-alive is currently active.
 */
export function isKeepAwakeActive(): boolean {
    return isActive;
}
