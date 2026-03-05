"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { SavedTrack } from "@/lib/db";

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
    progress: number;
    duration: number;
    seekTo: (time: number) => void;
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
        try {
            const savedState = localStorage.getItem("caleta-player-state");
            if (savedState) {
                const { queue: savedQueue, currentIndex: savedIdx, isShuffle: savedIsShuffle, repeatMode: savedRepeatMode } = JSON.parse(savedState);
                if (savedQueue && savedQueue.length > 0) {
                    // Rehydrate optional blobs for offline tracks
                    import("@/lib/db").then(({ getTrackFromDB }) => {
                        Promise.all(savedQueue.map(async (t: any) => {
                            if (!t.streamUrl && t.id) {
                                const dbTrack = await getTrackFromDB(t.id);
                                if (dbTrack) return dbTrack;
                            }
                            return t;
                        })).then(restoredQueue => {
                            // Primero establecemos la bandera a false antes de setear track
                            isReadyToPlayRef.current = false;

                            setQueue(restoredQueue);
                            setCurrentIndex(savedIdx);
                            setIsShuffle(savedIsShuffle || false);
                            setRepeatMode(savedRepeatMode || 'none');
                            setCurrentTrack(restoredQueue[savedIdx] || null);
                            // Avoid automatically playing on reload to respect browser policies
                        });
                    });
                }
            }
        } catch (e) {
            console.warn("Failed to restore player state", e);
        }
    }, []);

    // Save state to localStorage when it changes
    useEffect(() => {
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

    useEffect(() => {
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
        const onPlaying = () => setIsLoading(false);
        const onCanPlay = () => setIsLoading(false);
        const onLoadStart = () => setIsLoading(true);
        const onError = () => {
            const errCode = audioRef.current?.error?.code;
            const track = currentTrackRef.current;
            console.warn(`[AudioPlayer] Audio error (code: ${errCode})`);
            setIsLoading(false);

            // Error code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (audio corrupto o inaccesible)
            // Intentar fallback automático: YouTube → Preview
            if (errCode === 4 && track && !hasRetriedRef.current) {
                hasRetriedRef.current = true;

                if (track.title && track.artist) {
                    console.log("[Player] Audio error → Trying YouTube fallback...");
                    // Intentar con YouTube como fallback
                    const ytUrl = `/api/download?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
                    fetch(ytUrl, { signal: AbortSignal.timeout(30000) })
                        .then(res => {
                            if (!res.ok) throw new Error(`Status ${res.status}`);
                            const ct = res.headers.get('content-type') || '';
                            if (ct.includes('application/json')) {
                                return res.json().then(data => {
                                    if (data.audioUrl && audioRef.current) {
                                        audioRef.current.src = data.audioUrl;
                                        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
                                    }
                                });
                            } else {
                                return res.blob().then(blob => {
                                    if (audioRef.current && blob.size > 50000) {
                                        audioRef.current.src = URL.createObjectURL(blob);
                                        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
                                    }
                                });
                            }
                        })
                        .catch(() => {
                            // YouTube también falló → usar preview de 30s
                            if (track.previewUrl && audioRef.current) {
                                console.log("[Player] YouTube failed → Using Deezer preview");
                                audioRef.current.src = track.previewUrl;
                                audioRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
                            }
                        });
                } else if (track.previewUrl && audioRef.current) {
                    audioRef.current.src = track.previewUrl;
                    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => { });
                }
            }
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("loadstart", onLoadStart);
        audio.addEventListener("error", onError);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("playing", onPlaying);
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

                // Solo asignar la fuente pero no reproducir
                let initialUrl = currentTrack.streamUrl || "";
                if (currentTrack.blob) {
                    initialUrl = URL.createObjectURL(currentTrack.blob);
                } else if (!initialUrl && currentTrack.previewUrl) {
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
                if ((currentTrack as any).sourceAudioUrl) {
                    srcUrl = (currentTrack as any).sourceAudioUrl;
                } else if (currentTrack.title && currentTrack.artist) {
                    srcUrl = `/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`;
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
                    setIsLoading(true);
                    const timeoutId = setTimeout(() => !cancelled && abortController.abort(), 90000);
                    try {
                        const res = await fetch(url, { signal: abortController.signal });
                        clearTimeout(timeoutId);
                        if (cancelled) return;
                        if (!res.ok) throw new Error(`API returned ${res.status}`);

                        const contentType = res.headers.get('content-type') || '';
                        if (contentType.includes('application/json')) {
                            // Vercel: JSON con URL directa
                            const data = await res.json();
                            if (data.audioUrl) {
                                audio.src = data.audioUrl;
                            } else {
                                throw new Error("No audioUrl in JSON");
                            }
                        } else {
                            // Local: audio binario directo → blob para reproducción estable
                            const blob = await res.blob();
                            if (cancelled) return;
                            if (blob.size < 50000) throw new Error(`Audio too small (${blob.size} bytes)`);
                            const blobUrlTemp = URL.createObjectURL(blob);
                            audio.src = blobUrlTemp;
                        }
                    } catch (err: any) {
                        if (cancelled) return;
                        console.warn("[Player] API fetch failed:", err?.message);

                        if (url.includes('/api/deezer') && fallbackLevel === 0 && currentTrack.title && currentTrack.artist) {
                            const ytUrl = `/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`;
                            attemptPlay(ytUrl, 1);
                            return;
                        }
                        if (fallbackLevel <= 1 && currentTrack.previewUrl) {
                            audio.src = currentTrack.previewUrl;
                        } else {
                            setIsLoading(false);
                            return;
                        }
                    }
                } else {
                    audio.src = url;
                }

                setIsLoading(false);

                try {
                    if (cancelled) return;
                    await audio.play();
                    setIsPlaying(true);
                } catch (err: any) {
                    if (cancelled) return;
                    if (err.name === 'NotAllowedError') { setIsPlaying(false); return; }
                    if (err.name === 'AbortError') return;

                    console.warn("[Player] Play error:", err?.message);
                    if (fallbackLevel === 0 && currentTrack.title && currentTrack.artist) {
                        const ytUrl = `/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`;
                        attemptPlay(ytUrl, 1);
                        return;
                    }
                    if (fallbackLevel === 1 && currentTrack.previewUrl) {
                        attemptPlay(currentTrack.previewUrl, 2);
                        return;
                    }
                    setIsLoading(false);
                }
            };

            attemptPlay(blobUrl || srcUrl);

            // Configurar Media Session para pantallas bloqueadas (Android/iOS)
            if ("mediaSession" in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: currentTrack.title || "Unknown Track",
                    artist: currentTrack.artist || "Unknown Artist",
                    album: currentTrack.album || "Caleta Music",
                    artwork: [
                        { src: currentTrack.coverUrl || "/logo.png", sizes: "100x100", type: "image/jpeg" },
                        { src: currentTrack.coverUrl?.replace('100x100', '300x300') || "/logo.png", sizes: "300x300", type: "image/jpeg" },
                        { src: currentTrack.coverUrl?.replace('100x100', '600x600') || "/logo.png", sizes: "600x600", type: "image/jpeg" }
                    ]
                });

                navigator.mediaSession.setActionHandler("play", () => togglePlay());
                navigator.mediaSession.setActionHandler("pause", () => togglePlay());
                navigator.mediaSession.setActionHandler("previoustrack", () => playPrev());
                navigator.mediaSession.setActionHandler("nexttrack", () => playNext());
                navigator.mediaSession.setActionHandler("seekto", (details) => {
                    if (details.fastSeek && 'fastSeek' in audioRef.current!) {
                        (audioRef.current as any).fastSeek(details.seekTime || 0);
                    } else {
                        seekTo(details.seekTime || 0);
                    }
                });
            }

            return () => {
                cancelled = true;
                abortController.abort(); // Cancelar red para no agotar el limite de conexiones
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            };
        }
    }, [currentTrack]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (audioRef.current.paused) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        setIsPlaying(true);
                    }).catch(err => {
                        if (err.name === 'AbortError') {
                            console.log("Playback aborted by pause");
                        } else {
                            console.warn("Error playing audio", err);
                        }
                    });
                } else {
                    setIsPlaying(true);
                }
            } else {
                audioRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    const playTrack = (track: SavedTrack, newQueue?: SavedTrack[]) => {
        isReadyToPlayRef.current = true; // Activar reproducción si es accion del usuaro
        setCurrentTrack(track);
        if (newQueue) {
            setQueue(newQueue);
            const index = newQueue.findIndex(t => t.id === track.id);
            setCurrentIndex(index !== -1 ? index : 0);
        }
    };

    const playNext = (autoAdvance = false) => {
        isReadyToPlayRef.current = true; // El usuario quiere pasar la pista (o auto avance)
        if (queue.length === 0) return;

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
            setCurrentTrack(queue[nextIndex]);
        } else {
            // Flujo Normal secuencial
            if (currentIndex < queue.length - 1) {
                const nextIndex = currentIndex + 1;
                setCurrentIndex(nextIndex);
                setCurrentTrack(queue[nextIndex]);
            } else {
                // Fin de la cola
                if (repeatMode === 'all' || !autoAdvance) {
                    setCurrentIndex(0);
                    setCurrentTrack(queue[0]);
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
            setCurrentTrack(queue[prevIndex]);
        } else {
            if (currentIndex > 0) {
                const prevIndex = currentIndex - 1;
                setCurrentIndex(prevIndex);
                setCurrentTrack(queue[prevIndex]);
            } else {
                // Ir a la última de la cola
                const lastIndex = queue.length - 1;
                setCurrentIndex(lastIndex);
                setCurrentTrack(queue[lastIndex]);
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
                progress,
                duration,
                seekTo,
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
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) {
        throw new Error("usePlayer must be used within PlayerProvider");
    }
    return context;
}
