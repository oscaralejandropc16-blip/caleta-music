"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { SavedTrack } from "@/lib/db";

interface PlayerContextType {
    currentTrack: SavedTrack | null;
    isPlaying: boolean;
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
    const [queue, setQueue] = useState<SavedTrack[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        const audio = audioRef.current;

        const onTimeUpdate = () => setProgress(audio.currentTime);
        const onLoadedMetadata = () => setDuration(audio.duration);
        const onEnded = () => playNext();

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("ended", onEnded);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("ended", onEnded);
        };
    }, [currentIndex, queue]);

    // Reproducir cancion desde localforage (soporta offline + background play via MediaSession)
    useEffect(() => {
        if (currentTrack && audioRef.current) {
            const blobUrl = URL.createObjectURL(currentTrack.blob);
            audioRef.current.src = blobUrl;
            audioRef.current.play().then(() => {
                setIsPlaying(true);

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
                            audioRef.current.fastSeek(details.seekTime || 0);
                        } else {
                            seekTo(details.seekTime || 0);
                        }
                    });
                }
            }).catch(err => {
                console.error("Error al reproducir el blob:", err);
                setIsPlaying(false);
            });

            return () => {
                URL.revokeObjectURL(blobUrl);
            };
        }
    }, [currentTrack]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (audioRef.current.paused) {
                audioRef.current.play();
                setIsPlaying(true);
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
