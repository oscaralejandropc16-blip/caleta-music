"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { SavedTrack } from "@/lib/db";
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { MediaSession } from '@capgo/capacitor-media-session';
import { startKeepAwake, stopKeepAwake } from '@/lib/keepAwake';

const RAILWAY_API = "https://caleta-music-production.up.railway.app";

interface PlayerContextType {
    currentTrack: SavedTrack | null;
    isPlaying: boolean;
    isLoading: boolean;
    queue: SavedTrack[];
    currentIndex: number;
    playTrack: (track: SavedTrack, newQueue?: SavedTrack[]) => void;
    togglePlay: () => void;
    playNext: () => void;
    playPrev: () => void;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    isShuffle: boolean;
    repeatMode: 'none' | 'all' | 'one';
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    isQueueVisible: boolean;
    toggleQueue: () => void;
    playQueueIndex: (index: number) => void;
    removeFromQueue: (index: number) => void;
    isDevicesVisible: boolean;
    toggleDevices: () => void;
    isLyricsVisible: boolean;
    toggleLyrics: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export interface PlayerTimeContextType {
    progress: number;
    duration: number;
    seekTo: (time: number) => void;
}
export const PlayerTimeContext = createContext<PlayerTimeContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentTrack, setCurrentTrack] = useState<SavedTrack | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [queue, setQueue] = useState<SavedTrack[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<SavedTrack | null>(null);
    const hasRetriedRef = useRef(false);
    const isReadyToPlayRef = useRef(false); // Prevents auto-play on initial load
    const mediaSessionHandlersRegistered = useRef(false); // Only register once
    const userVolumeRef = useRef(1); // Track the user's desired volume for Safari mute/unmute trick
    const isMutedForPauseRef = useRef(false); // Whether we're using the mute-instead-of-pause trick

    // New states for shuffle, repeat and queue
    const [isShuffle, setIsShuffle] = useState(false);
    const [repeatMode, setRepeatMode] = useState<'none' | 'all' | 'one'>('none');
    const [isQueueVisible, setIsQueueVisible] = useState(false);
    const [isDevicesVisible, setIsDevicesVisible] = useState(false);
    const [isLyricsVisible, setIsLyricsVisible] = useState(false);
    // Reference to shuffled indices to play tracks randomly without repeating until all are played
    const shuffledIndicesRef = useRef<number[]>([]);
    const originalQueueRef = useRef<SavedTrack[]>([]);

    // Restore state from localStorage on mount
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const savedState = localStorage.getItem("caleta-player-state");
            if (savedState) {
                const parsed = JSON.parse(savedState);
                const savedQueue = parsed?.queue;
                const savedIdx = parsed?.currentIndex ?? 0;
                const savedIsShuffle = parsed?.isShuffle ?? false;
                const savedRepeatMode = parsed?.repeatMode ?? 'none';
                if (Array.isArray(savedQueue) && savedQueue.length > 0) {
                    // Rehydrate optional blobs for offline tracks
                    import("@/lib/db").then(({ getTrackFromDB }) => {
                        Promise.all(savedQueue.map(async (t: any) => {
                            try {
                                if (!t.streamUrl && t.id) {
                                    const dbTrack = await getTrackFromDB(t.id);
                                    if (dbTrack) return dbTrack;
                                }
                            } catch { /* ignore individual track errors */ }
                            return t;
                        })).then(restoredQueue => {
                            // Primero establecemos la bandera a false antes de setear track
                            isReadyToPlayRef.current = false;

                            setQueue(restoredQueue);
                            setCurrentIndex(savedIdx);
                            setIsShuffle(savedIsShuffle);
                            setRepeatMode(savedRepeatMode);
                            setCurrentTrack(restoredQueue[savedIdx] || null);
                            // Avoid automatically playing on reload to respect browser policies
                        }).catch(e => console.warn("Failed to rehydrate queue", e));
                    }).catch(e => console.warn("Failed to import db module", e));
                }
            }
        } catch (e) {
            console.warn("Failed to restore player state", e);
            // Clear corrupt state
            try { localStorage.removeItem("caleta-player-state"); } catch { }
        }
    }, []);

    // Save state to localStorage when it changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (queue.length > 0) {
            try {
                // Strip blob because it can't be serialized to JSON
                const stateToSave = {
                    queue: queue.map(t => ({ ...t, blob: undefined })),
                    currentIndex,
                    isShuffle,
                    repeatMode
                };
                localStorage.setItem("caleta-player-state", JSON.stringify(stateToSave));
            } catch (e) {
                console.warn("Failed to save player state", e);
            }
        }
    }, [queue, currentIndex, isShuffle, repeatMode]);

    // Keep references updated for functions that don't depend on them in dependency arrays
    useEffect(() => {
        originalQueueRef.current = queue;
        // Generate new shuffled indices when queue changes if shuffle is on
        if (isShuffle && queue.length > 0) {
            const indices = Array.from({ length: queue.length }, (_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }
            shuffledIndicesRef.current = indices;
        }
    }, [queue, isShuffle]);

    // Helper to sync playback state with MediaSession (lock screen)
    const updateMediaSessionPlaybackState = (playing: boolean) => {
        if (Capacitor.isNativePlatform()) {
            try {
                MediaSession.setPlaybackState({
                    playbackState: playing ? 'playing' : 'paused'
                });
                MediaSession.setPositionState({
                    position: Math.min(audioRef.current?.currentTime || 0, audioRef.current?.duration || 0),
                    duration: audioRef.current?.duration || 0,
                    playbackRate: 1
                });
            } catch (e) {
                console.warn("MediaSession setPlaybackState error:", e);
            }
        } else if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
            } catch { /* Safari might not support this setter */ }
            try {
                const dur = audioRef.current?.duration;
                const pos = audioRef.current?.currentTime;
                if (dur && isFinite(dur) && dur > 0) {
                    navigator.mediaSession.setPositionState({
                        duration: dur,
                        playbackRate: 1,
                        position: Math.min(pos || 0, dur)
                    });
                }
            } catch { /* ignore if duration not ready */ }
        }
    };

    // Register MediaSession handlers keeping track of correct closures
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (Capacitor.isNativePlatform()) {
            try {
                MediaSession.setActionHandler({ action: 'play' }, () => {
                    if (audioRef.current && audioRef.current.paused) {
                        audioRef.current.play().catch(console.warn);
                    }
                });
                MediaSession.setActionHandler({ action: 'pause' }, () => {
                    if (audioRef.current && !audioRef.current.paused) {
                        audioRef.current.pause();
                    }
                });
                MediaSession.setActionHandler({ action: 'previoustrack' }, () => playPrev());
                MediaSession.setActionHandler({ action: 'nexttrack' }, () => playNext());
                MediaSession.setActionHandler({ action: 'seekforward' }, null); // Disable to force prev/next icons on iOS
                MediaSession.setActionHandler({ action: 'seekbackward' }, null); // Disable to force prev/next icons on iOS
                MediaSession.setActionHandler({ action: 'seekto' }, (details) => {
                    if (audioRef.current && details.seekTime != null) {
                        audioRef.current.currentTime = details.seekTime;
                        setProgress(details.seekTime);
                    }
                });
            } catch (e) {
                console.warn("Capacitor MediaSession listener error:", e);
            }
        } else if ('mediaSession' in navigator) {
            // Detect Safari for mute-instead-of-pause trick
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
                /iPad|iPhone|iPod/.test(navigator.userAgent);

            navigator.mediaSession.setActionHandler('play', () => {
                if (!audioRef.current) return;
                if (isMutedForPauseRef.current) {
                    // We muted instead of pausing — restore volume
                    audioRef.current.volume = userVolumeRef.current;
                    isMutedForPauseRef.current = false;
                    setIsPlaying(true);
                    updateMediaSessionPlaybackState(true);
                } else if (audioRef.current.paused) {
                    audioRef.current.play().catch(console.warn);
                }
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                if (!audioRef.current || audioRef.current.paused) return;
                if (isSafari && document.hidden) {
                    // Safari PWA + screen locked: mute instead of pause to keep audio session alive
                    userVolumeRef.current = audioRef.current.volume || 1;
                    audioRef.current.volume = 0;
                    isMutedForPauseRef.current = true;
                    setIsPlaying(false);
                    updateMediaSessionPlaybackState(false);
                } else {
                    audioRef.current.pause();
                }
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
            navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
            try {
                navigator.mediaSession.setActionHandler('seekforward', null);
                navigator.mediaSession.setActionHandler('seekbackward', null);
            } catch { /* Ignore if browser doesn't support setting to null */ }
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (audioRef.current) {
                    if (details.fastSeek && 'fastSeek' in audioRef.current) {
                        (audioRef.current as any).fastSeek(details.seekTime || 0);
                    } else {
                        audioRef.current.currentTime = details.seekTime || 0;
                        setProgress(details.seekTime || 0);
                    }
                }
            });
        }
    }, [queue, currentIndex, isShuffle, repeatMode]); // Updating these ensures playNext/playPrev closures never go stale

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        const audio = audioRef.current;

        const onTimeUpdate = () => setProgress(audio.currentTime);
        const onLoadedMetadata = () => setDuration(audio.duration);

        // Detección de corte prematuro: si el track termina a <50% de la duración
        // reportada, significa que el archivo descargado está incompleto.
        // En ese caso, re-streamear desde la API automáticamente.
        const onEnded = () => {
            const track = currentTrackRef.current;
            const actualTime = audio.currentTime;
            const reportedDuration = audio.duration;

            // Si la canción terminó a menos del 50% de su duración reportada
            // y la duración es > 60s (no es un preview corto o jingle)
            // y no ya reintentamos → re-streamear desde API
            if (track && !hasRetriedRef.current &&
                actualTime > 5 && reportedDuration > 60 &&
                actualTime < reportedDuration * 0.5 &&
                track.streamUrl) {
                hasRetriedRef.current = true;
                console.warn(`[Player] ⚠️ Track cortado a ${actualTime.toFixed(0)}s / ${reportedDuration.toFixed(0)}s → Re-streameando desde API...`);
                // Re-reproducir sin el blob (forzar streaming desde API)
                setCurrentTrack({ ...track, blob: undefined });
                return;
            }

            playNext(true); // Pasar true para indicar que fue de forma automática
        };

        const onWaiting = () => setIsLoading(true);
        const onPause = () => {
            setIsPlaying(false);
            updateMediaSessionPlaybackState(false);
        };
        const onPlay = () => {
            setIsPlaying(true);
            updateMediaSessionPlaybackState(true);

            // Safari PWA Background fix: Ensure volume is up when track starts
            if (audioRef.current && (isMutedForPauseRef.current || audioRef.current.volume === 0)) {
                audioRef.current.volume = userVolumeRef.current || 1;
                isMutedForPauseRef.current = false;
            }

            // Keep Webview alive and prevent iOS WKWebView audio routing bugs in background
            startKeepAwake();
        };
        const onPlaying = () => {
            setIsPlaying(true);
            setIsLoading(false);
            updateMediaSessionPlaybackState(true);

            // Re-force volume on playing event for background track changes
            if (audioRef.current && (isMutedForPauseRef.current || audioRef.current.volume === 0)) {
                audioRef.current.volume = userVolumeRef.current || 1;
                isMutedForPauseRef.current = false;
            }
        };
        const onCanPlay = () => setIsLoading(false);
        const onLoadStart = () => {
            // Don't show loading for local blobs — they play instantly
            if (audio.src?.startsWith('blob:')) return;
            setIsLoading(true);
        };
        const onError = () => {
            const errCode = audioRef.current?.error?.code;
            const errName = audioRef.current?.error?.message;
            console.warn(`[AudioPlayer] Audio error (code: ${errCode}, msg: ${errName})`);
            setIsLoading(false);

            // Si el error ocurre muy rápido (currentTime = 0), playPromise.catch manejará los fallbacks.
            // Si ocurre a mitad de canción, el estado se quedará en pausa.
            if (audioRef.current?.currentTime !== 0) {
                setIsPlaying(false);
            }
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("loadstart", onLoadStart);
        audio.addEventListener("error", onError);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("loadstart", onLoadStart);
            audio.removeEventListener("error", onError);
        };
    }, [currentIndex, queue, isShuffle, repeatMode]);

    // Reproducir cancion desde localforage o streaming directo
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            // Si es la carga inicial desde localStorage (isReadyToPlay inicial), no reproducir automáticamente
            if (!isReadyToPlayRef.current) {
                isReadyToPlayRef.current = true;

                let initialUrl = "";
                const sUrl = currentTrack.streamUrl || (currentTrack as any).sourceAudioUrl || "";
                const isYouTubeId = isNaN(Number(currentTrack.id)) && String(currentTrack.id).length === 11;

                if (currentTrack.blob) {
                    initialUrl = URL.createObjectURL(currentTrack.blob);
                } else if (sUrl) {
                    if (sUrl.includes('youtube.com/') || sUrl.includes('youtu.be/')) {
                        initialUrl = `${RAILWAY_API}/api/download?url=${encodeURIComponent(sUrl)}`;
                    } else {
                        initialUrl = sUrl;
                    }
                } else if (isYouTubeId) {
                    initialUrl = `${RAILWAY_API}/api/download?url=${encodeURIComponent(`https://youtube.com/watch?v=${currentTrack.id}`)}`;
                } else if (currentTrack.previewUrl) {
                    initialUrl = currentTrack.previewUrl;
                }

                if (initialUrl && !initialUrl.includes('/api/deezer') && !initialUrl.includes('/api/download')) {
                    audioRef.current.src = initialUrl;
                }

                return;
            }

            // Detener el track anterior inmediatamente al cambiar de canción
            audioRef.current.pause();
            setIsPlaying(false);

            // Actualizar ref y resetear retry FLAG cuando cambia el track
            currentTrackRef.current = currentTrack;
            hasRetriedRef.current = false;

            let srcUrl = currentTrack.streamUrl || "";
            let blobUrl: string | null = null;
            let cancelled = false;
            const abortController = new AbortController();

            if (currentTrack.blob) {
                blobUrl = URL.createObjectURL(currentTrack.blob);
                srcUrl = blobUrl;
            }

            if (!srcUrl) {
                const sUrl = (currentTrack as any).sourceAudioUrl || currentTrack.streamUrl || "";
                const isYouTubeId = isNaN(Number(currentTrack.id)) && String(currentTrack.id).length === 11;

                if (sUrl) {
                    if (sUrl.includes('youtube.com/') || sUrl.includes('youtu.be/')) {
                        srcUrl = `${RAILWAY_API}/api/download?url=${encodeURIComponent(sUrl)}`;
                    } else {
                        srcUrl = sUrl;
                    }
                } else if (isYouTubeId) {
                    srcUrl = `${RAILWAY_API}/api/download?url=${encodeURIComponent(`https://youtube.com/watch?v=${currentTrack.id}`)}`;
                } else if (currentTrack.id) {
                    srcUrl = `${RAILWAY_API}/api/deezer?id=${currentTrack.id}&title=${encodeURIComponent(currentTrack.title || "")}&artist=${encodeURIComponent(currentTrack.artist || "")}`;
                } else if (currentTrack.title && currentTrack.artist) {
                    srcUrl = `${RAILWAY_API}/api/deezer?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`;
                } else if (currentTrack.previewUrl) {
                    srcUrl = currentTrack.previewUrl;
                } else {
                    console.warn("Ninguna fuente de audio disponible (sin blob ni streamUrl)\nTrack:", currentTrack);
                    return;
                }
            }

            const attemptPlay = async (url: string, fallbackLevel = 0) => {
                const audio = audioRef.current;
                if (!audio || cancelled) return;

                // Para URLs de API que devuelven JSON (Vercel), necesitamos resolver la URL real.
                // Para URLs de API locales o blobs, asignar directamente (reproducción instantánea).
                if ((url.includes('/api/deezer') || url.includes('/api/download')) && !url.startsWith('blob:')) {
                    // Para reproducción inmediata (streaming real) asignamos la URL directamente.
                    // Se envía play=true para que las rutas API devuelvan un redirect 302 hacia 
                    // los servidores externos (Deezer CDN, etc) en vez de un JSON.
                    // Esto permite que el navegador haga el buffering nativo de la canción mucho más rápido.
                    setIsLoading(true);
                    const separator = url.includes('?') ? '&' : '?';
                    audio.src = `${url}${separator}play=true`;
                } else {
                    audio.src = url;
                }

                // Call load() explicitly. This is crucial for iOS WKWebView 
                // to correctly prepare the AVPlayerItem for the new src while in background.
                audio.load();
                setIsLoading(false);

                try {
                    if (cancelled) return;
                    setIsLoading(true);

                    const playPromise = audio.play();

                    if (playPromise !== undefined) {
                        playPromise.catch((err: any) => {
                            if (cancelled) return;
                            if (err.name === 'NotAllowedError') return;
                            if (err.name === 'AbortError') return;

                            console.warn("[Player] Play promise error:", err?.message);
                            // No usar un ref estricto que bloquee los siguientes niveles de fallback.
                            // Evaluamos directamente usando el fallbackLevel.
                            if (fallbackLevel === 0 && currentTrack.title && currentTrack.artist) {
                                console.log("[Player] Audio error -> Searching alternative flow via Deezer API...");
                                const isYouTubeId = isNaN(Number(currentTrack.id)) && String(currentTrack.id).length === 11;
                                if (isYouTubeId) {
                                    const ytFallbackUrl = `${RAILWAY_API}/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&play=true`;
                                    attemptPlay(ytFallbackUrl, 1);
                                } else {
                                    const deezerUrl = `${RAILWAY_API}/api/deezer?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&play=true`;
                                    attemptPlay(deezerUrl, 1);
                                }
                            } else if (fallbackLevel === 1 && currentTrack.title && currentTrack.artist) {
                                console.log("[Player] Audio error in Deezer Fallback -> Trying Youtube Fallback...");
                                const ytFallbackUrl = `${RAILWAY_API}/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}&play=true`;
                                attemptPlay(ytFallbackUrl, 2);
                            } else if (fallbackLevel === 2 && currentTrack.previewUrl) {
                                console.log("[Player] Audio error in Youtube Fallback -> Trying Preview URL...");
                                attemptPlay(currentTrack.previewUrl, 3);
                            } else {
                                console.error("[Player] All fallbacks exhausted. Cannot play track.");
                                setIsLoading(false);
                            }
                        });
                    }
                } catch (err: any) {
                    if (cancelled) return;
                    console.warn("[Player] Play attempt error:", err?.message);
                }
            };

            attemptPlay(blobUrl || srcUrl);

            // Only update metadata here — handlers are registered once on mount
            const updateMediaSession = async () => {
                const metadata = {
                    title: currentTrack.title || "Unknown Track",
                    artist: currentTrack.artist || "Unknown Artist",
                    album: currentTrack.album || "Caleta Music",
                    artwork: [
                        { src: currentTrack.coverUrl || "/logo.png", sizes: "100x100", type: "image/jpeg" },
                        { src: currentTrack.coverUrl?.replace('100x100', '300x300') || "/logo.png", sizes: "300x300", type: "image/jpeg" },
                        { src: currentTrack.coverUrl?.replace('100x100', '600x600') || "/logo.png", sizes: "600x600", type: "image/jpeg" }
                    ]
                };

                if (Capacitor.isNativePlatform()) {
                    try {
                        await MediaSession.setMetadata({
                            title: metadata.title,
                            artist: metadata.artist,
                            album: metadata.album,
                            artwork: metadata.artwork
                        });

                        await MediaSession.setPlaybackState({
                            playbackState: 'playing'
                        });

                        await MediaSession.setPositionState({
                            position: audioRef.current?.currentTime || 0,
                            duration: (currentTrack as any).duration || audioRef.current?.duration || 0,
                            playbackRate: 1
                        });
                    } catch (e) {
                        console.warn("Capacitor MediaSession error:", e);
                    }
                } else if ("mediaSession" in navigator) {
                    navigator.mediaSession.metadata = new MediaMetadata(metadata);
                    try {
                        navigator.mediaSession.playbackState = 'playing';
                    } catch { /* ignore */ }
                    // Wait for duration to be available, then set position
                    const setPositionWhenReady = () => {
                        try {
                            const dur = audioRef.current?.duration;
                            if (dur && isFinite(dur) && dur > 0) {
                                navigator.mediaSession.setPositionState({
                                    duration: dur,
                                    playbackRate: 1,
                                    position: audioRef.current?.currentTime || 0
                                });
                            }
                        } catch { /* ignore */ }
                    };
                    // Try now and also after metadata loads
                    setPositionWhenReady();
                    if (audioRef.current) {
                        audioRef.current.addEventListener('loadedmetadata', setPositionWhenReady, { once: true });
                    }
                }
            };

            updateMediaSession();

            return () => {
                cancelled = true;
                abortController.abort(); // Cancelar red para no agotar el limite de conexiones
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            };
        }
    }, [currentTrack]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isMutedForPauseRef.current) {
                // Restore from muted-pause state (was muted from lock screen)
                audioRef.current.volume = userVolumeRef.current;
                isMutedForPauseRef.current = false;
                setIsPlaying(true);
                updateMediaSessionPlaybackState(true);
            } else if (audioRef.current.paused) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        if (err.name !== 'AbortError') {
                            console.warn("Error playing audio after toggle", err);
                        }
                    });
                }
            } else {
                // User is in the app — always do a real pause
                audioRef.current.pause();
            }
        }
    };

    const playTrack = async (track: SavedTrack, newQueue?: SavedTrack[]) => {
        isReadyToPlayRef.current = true; // Activar reproducción si es accion del usuario

        // Reset progress visually immediately to prevent old track's progress bleeding
        setProgress(0);
        setDuration(0);

        // Reset mute state for new track to ensure sound is heard on Safari background skip
        isMutedForPauseRef.current = false;
        if (audioRef.current) {
            audioRef.current.volume = userVolumeRef.current || 1;
            // Also ensure it's not actually paused if we're coming from a muted-pause
            if (audioRef.current.paused && isReadyToPlayRef.current) {
                audioRef.current.play().catch(() => { });
            }
        }

        const resolvedTrack = await resolveLocalTrack(track);

        setCurrentTrack(resolvedTrack);
        if (newQueue) {
            setQueue(newQueue);
            const index = newQueue.findIndex(t => t.id === resolvedTrack.id);
            setCurrentIndex(index !== -1 ? index : 0);
        }
    };

    // Helper: resolve a local track from Capacitor Offline Preferences or IndexedDB
    const resolveLocalTrack = async (track: SavedTrack): Promise<SavedTrack> => {
        let resolvedTrack = { ...track };

        // 1. Capacitor Preferences Check (Mobile Offline)
        try {
            const { value } = await Preferences.get({ key: 'caleta_downloaded_tracks' });
            if (value) {
                const offlineTracks: any[] = JSON.parse(value);
                const trackId = String(track.id).replace('stream-', '');
                const offlineMatch = offlineTracks.find((t: any) => String(t.id) === trackId || String(t.id) === String(track.id));

                if (offlineMatch?.localPath) {
                    const convertedUrl = Capacitor.convertFileSrc(offlineMatch.localPath);
                    console.log("[Player] 📱 Usando archivo offline nativo:", convertedUrl);
                    resolvedTrack.streamUrl = convertedUrl;
                    return resolvedTrack;
                }
            }
        } catch (e) {
            console.warn("Failed checking native Capacitor preferences", e);
        }

        // 2. IndexedDB Check (Web Legacy)
        if (track.blob) return track;
        try {
            const { getTrackFromDB } = await import("@/lib/db");
            const localTrack = await getTrackFromDB(track.id);
            if (localTrack?.blob) {
                resolvedTrack.blob = localTrack.blob;
                return resolvedTrack;
            }
        } catch { /* fallback to streaming */ }

        return resolvedTrack;
    };

    const playNext = (autoAdvance = false) => {
        isReadyToPlayRef.current = true; // El usuario quiere pasar la pista (o auto avance)
        if (queue.length === 0) return;

        // Reset mute state for new track
        isMutedForPauseRef.current = false;
        if (audioRef.current) audioRef.current.volume = userVolumeRef.current || 1;

        // Si es avance automático y está en 'one', repetir la canción
        if (autoAdvance && repeatMode === 'one' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(console.error);
            return;
        }

        if (isShuffle) {
            // Lógica de Shuffle
            let nextIndex = -1;
            if (shuffledIndicesRef.current.length > 0) {
                // Encontrar dónde estamos en los índices mezclados
                const currentShuffledPos = shuffledIndicesRef.current.indexOf(currentIndex);
                if (currentShuffledPos === -1 || currentShuffledPos === shuffledIndicesRef.current.length - 1) {
                    // Si no está o llegamos al final, dependiendo de repeatMode
                    if (repeatMode === 'all') {
                        nextIndex = shuffledIndicesRef.current[0];
                    } else if (!autoAdvance) { // Si el usuario presionó siguiente, dar la vuelta igual
                        nextIndex = shuffledIndicesRef.current[0];
                    } else {
                        // Si es automático y no repeatAll, se acaba.
                        setIsPlaying(false);
                        return;
                    }
                } else {
                    nextIndex = shuffledIndicesRef.current[currentShuffledPos + 1];
                }
            } else {
                // Fallback por si acaso
                nextIndex = Math.floor(Math.random() * queue.length);
            }
            setCurrentIndex(nextIndex);
            resolveLocalTrack(queue[nextIndex]).then(setCurrentTrack);
        } else {
            // Flujo Normal secuencial
            if (currentIndex < queue.length - 1) {
                const nextIndex = currentIndex + 1;
                setCurrentIndex(nextIndex);
                resolveLocalTrack(queue[nextIndex]).then(setCurrentTrack);
            } else {
                // Fin de la cola
                if (repeatMode === 'all' || !autoAdvance) {
                    setCurrentIndex(0);
                    resolveLocalTrack(queue[0]).then(setCurrentTrack);
                } else {
                    setIsPlaying(false);
                }
            }
        }
    };

    const playPrev = () => {
        isReadyToPlayRef.current = true;
        if (queue.length === 0) return;

        // Si la canción ha avanzado más de 3 segundos, reiniciar la actual
        if (audioRef.current && audioRef.current.currentTime > 3) {
            seekTo(0);
            return;
        }

        if (isShuffle) {
            let prevIndex = -1;
            if (shuffledIndicesRef.current.length > 0) {
                const currentShuffledPos = shuffledIndicesRef.current.indexOf(currentIndex);
                if (currentShuffledPos > 0) {
                    prevIndex = shuffledIndicesRef.current[currentShuffledPos - 1];
                } else {
                    // Volver al final
                    prevIndex = shuffledIndicesRef.current[shuffledIndicesRef.current.length - 1];
                }
            } else {
                prevIndex = Math.floor(Math.random() * queue.length);
            }
            setCurrentIndex(prevIndex);
            resolveLocalTrack(queue[prevIndex]).then(setCurrentTrack);
        } else {
            if (currentIndex > 0) {
                const prevIndex = currentIndex - 1;
                setCurrentIndex(prevIndex);
                resolveLocalTrack(queue[prevIndex]).then(setCurrentTrack);
            } else {
                // Ir a la última de la cola
                const lastIndex = queue.length - 1;
                setCurrentIndex(lastIndex);
                resolveLocalTrack(queue[lastIndex]).then(setCurrentTrack);
            }
        }
    };

    const toggleShuffle = () => setIsShuffle(prev => !prev);

    const toggleRepeat = () => {
        setRepeatMode(prev => {
            if (prev === 'none') return 'all';
            if (prev === 'all') return 'one';
            return 'none';
        });
    };

    const toggleQueue = () => {
        setIsQueueVisible(!isQueueVisible);
        setIsDevicesVisible(false);
        setIsLyricsVisible(false);
    };

    const toggleDevices = () => {
        setIsDevicesVisible(!isDevicesVisible);
        setIsQueueVisible(false);
        setIsLyricsVisible(false);
    };

    const toggleLyrics = () => {
        setIsLyricsVisible(!isLyricsVisible);
        setIsQueueVisible(false);
        setIsDevicesVisible(false);
    };

    const playQueueIndex = (index: number) => {
        if (queue[index]) {
            isReadyToPlayRef.current = true;
            setCurrentIndex(index);
            setCurrentTrack(queue[index]);
        }
    };

    const removeFromQueue = (index: number) => {
        if (index < 0 || index >= queue.length) return;

        const newQueue = [...queue];
        newQueue.splice(index, 1);

        // Update current index if needed
        let newIndex = currentIndex;
        if (index < currentIndex) {
            newIndex = currentIndex - 1;
        } else if (index === currentIndex) {
            // Si removemos el actual, detener o reproducir el proximo si hay
            if (newQueue.length === 0) {
                audioRef.current?.pause();
                setIsPlaying(false);
                setCurrentTrack(null);
                setCurrentIndex(-1);
                setQueue([]);
                return;
            } else {
                newIndex = Math.min(currentIndex, newQueue.length - 1);
                setCurrentTrack(newQueue[newIndex]);
                isReadyToPlayRef.current = true;
            }
        }

        setQueue(newQueue);
        setCurrentIndex(newIndex);
    };

    const seekTo = (time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setProgress(time);
        }
    };

    return (
        <PlayerTimeContext.Provider value={{ progress, duration, seekTo }}>
            <PlayerContext.Provider
                value={{
                    currentTrack,
                    isPlaying,
                    isLoading,
                    queue,
                    currentIndex,
                    playTrack,
                    togglePlay,
                    playNext,
                    playPrev,
                    audioRef,
                    isShuffle,
                    repeatMode,
                    toggleShuffle,
                    toggleRepeat,
                    isQueueVisible,
                    toggleQueue,
                    playQueueIndex,
                    removeFromQueue,
                    isDevicesVisible,
                    toggleDevices,
                    isLyricsVisible,
                    toggleLyrics
                }}
            >
                {children}
            </PlayerContext.Provider>
        </PlayerTimeContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayer must be used within PlayerProvider");
    }
    return context;
}

export function usePlayerTime() {
    const context = useContext(PlayerTimeContext);
    if (!context) {
        throw new Error("usePlayerTime must be used within PlayerProvider");
    }
    return context;
}
