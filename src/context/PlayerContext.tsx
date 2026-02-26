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

    // Restore state from localStorage on mount
    useEffect(() => {
        try {
            const savedState = localStorage.getItem("caleta-player-state");
            if (savedState) {
                const { queue: savedQueue, currentIndex: savedIdx } = JSON.parse(savedState);
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
                            setQueue(restoredQueue);
                            setCurrentIndex(savedIdx);
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
                    currentIndex
                };
                localStorage.setItem("caleta-player-state", JSON.stringify(stateToSave));
            } catch (e) {
                console.warn("Failed to save player state", e);
            }
        }
    }, [queue, currentIndex]);

    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        const audio = audioRef.current;

        const onTimeUpdate = () => setProgress(audio.currentTime);
        const onLoadedMetadata = () => setDuration(audio.duration);
        const onEnded = () => playNext();

        const onWaiting = () => setIsLoading(true);
        const onPlaying = () => setIsLoading(false);
        const onCanPlay = () => setIsLoading(false);
        const onLoadStart = () => setIsLoading(true);
        const onError = () => {
            const errCode = audioRef.current?.error?.code;
            console.warn(`[AudioPlayer] Audio element error (code: ${errCode}), source may be unavailable`);
            setIsLoading(false);
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
    }, [currentIndex, queue]);

    // Reproducir cancion desde localforage o streaming (soporta offline + background play via MediaSession)
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            let srcUrl = currentTrack.streamUrl || "";
            let blobUrl: string | null = null;

            if (currentTrack.blob) {
                blobUrl = URL.createObjectURL(currentTrack.blob);
                srcUrl = blobUrl;
            }

            if (!srcUrl) {
                console.warn("Ninguna fuente de audio disponible (sin blob ni streamUrl)");
                return;
            }

            // Función para intentar reproducir con fallback encadenado:
            // 1. Deezer API (canción completa) → 2. YouTube (via Piped) → 3. Deezer Preview (30s)
            const attemptPlay = async (url: string, fallbackLevel = 0) => {
                const audio = audioRef.current;
                if (!audio) return;

                // Si la URL es la API de desacarga, descargar el blob primero para evitar que
                // el navegador haga "Range requests" a mitad de canción y cause que se pare.
                if (url.includes('/api/download')) {
                    setIsLoading(true);
                    try {
                        const res = await fetch(url);
                        if (res.ok) {
                            const contentType = res.headers.get('content-type') || '';
                            if (!contentType.includes('application/json')) {
                                const blob = await res.blob();
                                const blobUrlTemp = URL.createObjectURL(blob);
                                audio.src = blobUrlTemp;
                            } else {
                                const data = await res.json();
                                if (data.audioUrl) {
                                    audio.src = data.audioUrl;
                                } else {
                                    throw new Error("No URL in JSON");
                                }
                            }
                        } else {
                            throw new Error("API Download Fetch Failed");
                        }
                    } catch (err: any) {
                        console.warn("[Player] Fallo al hacer fetch preventivo del blob:", err);
                        audio.src = url; // Fallback al comportamiento por defecto si falla el fetch
                    }
                } else {
                    audio.src = url;
                }

                try {
                    await audio.play();
                    setIsPlaying(true);
                } catch (err: any) {
                    if (err.name === 'NotAllowedError') {
                        setIsPlaying(false);
                        return;
                    }
                    if (err.name === 'AbortError') {
                        console.log("Playback aborted");
                        return;
                    }

                    console.warn("Error al reproducir fuente de audio:", err?.message || err);

                    // Fallback level 0 → Resolve YouTube audio URL via Piped API
                    if (fallbackLevel === 0 && currentTrack.title && currentTrack.artist) {
                        console.log("[Player] Deezer stream failed, resolving YouTube URL...");
                        try {
                            const apiUrl = `/api/download?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(currentTrack.artist)}`;
                            const res = await fetch(apiUrl);

                            if (res.ok) {
                                const contentType = res.headers.get('content-type') || '';

                                if (contentType.includes('application/json')) {
                                    // Vercel: API devuelve JSON con URL directa
                                    const data = await res.json();
                                    if (data.audioUrl) {
                                        console.log("[Player] Got direct audio URL from Piped, playing...");
                                        attemptPlay(data.audioUrl, 1);
                                        return;
                                    }
                                } else {
                                    // Local: API devuelve audio binario directamente
                                    const blob = await res.blob();
                                    const blobPlayUrl = URL.createObjectURL(blob);
                                    attemptPlay(blobPlayUrl, 1);
                                    return;
                                }
                            }
                        } catch (fetchErr) {
                            console.warn("[Player] YouTube API fetch failed:", fetchErr);
                        }

                        // Si YouTube falló, ir directo al preview
                        if (currentTrack.previewUrl) {
                            console.log("[Player] YouTube failed, using Deezer preview (30s)...");
                            attemptPlay(currentTrack.previewUrl, 2);
                            return;
                        }
                    }

                    // Fallback level 1 → Try Deezer preview URL (30s clip)
                    if (fallbackLevel === 1 && currentTrack.previewUrl) {
                        console.log("[Player] YouTube also failed, using Deezer preview (30s)...");
                        attemptPlay(currentTrack.previewUrl, 2);
                        return;
                    }

                    // All fallbacks exhausted
                    console.warn("[Player] All audio sources failed");
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
                if (blobUrl) {
                    URL.revokeObjectURL(blobUrl);
                }
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
        setCurrentTrack(track);
        if (newQueue) {
            setQueue(newQueue);
            const index = newQueue.findIndex(t => t.id === track.id);
            setCurrentIndex(index !== -1 ? index : 0);
        }
    };

    const playNext = () => {
        if (queue.length > 0 && currentIndex < queue.length - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            setCurrentTrack(queue[nextIndex]);
        }
    };

    const playPrev = () => {
        if (queue.length > 0 && currentIndex > 0) {
            const prevIndex = currentIndex - 1;
            setCurrentIndex(prevIndex);
            setCurrentTrack(queue[prevIndex]);
        }
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
