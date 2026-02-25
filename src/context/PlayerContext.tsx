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
            console.error("Failed to restore player state", e);
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
                console.error("Failed to save player state", e);
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

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("loadstart", onLoadStart);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("loadstart", onLoadStart);
        };
    }, [currentIndex, queue]);

    // Reproducir cancion desde localforage o streaming (soporta offline + background play via MediaSession)
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            let srcUrl = currentTrack.streamUrl || "";
            let blobUrl: string | null = null;
            const isStreamSource = !currentTrack.blob && !!currentTrack.streamUrl;

            if (currentTrack.blob) {
                blobUrl = URL.createObjectURL(currentTrack.blob);
                srcUrl = blobUrl;
            }

            if (!srcUrl) {
                console.error("Ninguna fuente de audio disponible (sin blob ni streamUrl)");
                return;
            }

            audioRef.current.src = srcUrl;

            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    setIsPlaying(true);
                }).catch(err => {
                    if (err.name === 'NotAllowedError') {
                        // Resucitado por localstorage o recarga automatica bloqueada por navegador
                        setIsPlaying(false);
                    } else if (err.name === 'AbortError') {
                        console.log("Playback aborted, likely due to a pause call");
                    } else {
                        console.error("Error al reproducir fuente de audio:", err);
                    }
                });
            } else {
                setIsPlaying(true);
            }

            // Si es streaming, delegar 100% al navegador para carga instantánea
            // NOTA: Eliminado el fetch de blob en background por que bloquea el streaming
            // nativo haciendo que Chrome pause la etiqueta <audio> hasta descargar 10MB. 
            // Esto permite que el stream inicie en 0 segundos.

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

                // Vincular botones físicos y controles de pantalla bloqueada a nuestra lógica
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
            // .catch replaced with playPromise above

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
                            console.error("Error playing audio", err);
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
