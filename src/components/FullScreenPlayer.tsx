"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipForward, SkipBack, X, Heart, Repeat, Shuffle, ChevronDown, Mic2, ListMusic, MonitorSpeaker } from "lucide-react";
import { isTrackLiked, toggleLike } from "@/lib/db";
import { useRouter } from "next/navigation";
import EqLoader from "./EqLoader";
import Link from "next/link";

interface FullScreenPlayerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FullScreenPlayer({ isOpen, onClose }: FullScreenPlayerProps) {
    const { currentTrack, isPlaying, isLoading, togglePlay, playNext, playPrev, progress, duration, seekTo, queue, currentIndex, isShuffle, toggleShuffle, repeatMode, toggleRepeat, isLyricsVisible, toggleLyrics, isQueueVisible, toggleQueue, isDevicesVisible, toggleDevices } = usePlayer();
    const router = useRouter();
    const [liked, setLiked] = useState(false);
    const [isClient, setIsClient] = useState(false);

    // Swipe-down-to-close gesture
    const touchStartY = useRef(0);
    const touchCurrentY = useRef(0);
    const isDragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragOffset, setDragOffset] = useState(0);

    // Scrubber dragging state
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const [dragProgress, setDragProgress] = useState(0);
    const progressBarRef = useRef<HTMLDivElement>(null);

    const handleProgressDragEvent = useCallback((clientX: number) => {
        if (!progressBarRef.current) return;
        const rect = progressBarRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setDragProgress(pos * duration);
    }, [duration]);

    const handleProgressTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        setIsDraggingProgress(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        handleProgressDragEvent(clientX);
    }, [handleProgressDragEvent]);

    const handleProgressTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        if (!isDraggingProgress) return;
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        handleProgressDragEvent(clientX);
    }, [isDraggingProgress, handleProgressDragEvent]);

    const handleProgressTouchEnd = useCallback(() => {
        if (isDraggingProgress) {
            seekTo(dragProgress);
            setIsDraggingProgress(false);
        }
    }, [isDraggingProgress, dragProgress, seekTo]);

    // Global mouse events for scrubber
    useEffect(() => {
        const handleMouseUp = () => {
            if (isDraggingProgress) {
                seekTo(dragProgress);
                setIsDraggingProgress(false);
            }
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingProgress) {
                handleProgressDragEvent(e.clientX);
            }
        };

        if (isDraggingProgress) {
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('touchend', handleMouseUp, { passive: true });
        }

        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDraggingProgress, dragProgress, seekTo, handleProgressDragEvent]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        touchCurrentY.current = e.touches[0].clientY;
        isDragging.current = true;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;
        touchCurrentY.current = e.touches[0].clientY;
        const diff = touchCurrentY.current - touchStartY.current;
        // Only allow dragging down (positive diff)
        if (diff > 0) {
            setDragOffset(diff);
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        isDragging.current = false;
        const diff = touchCurrentY.current - touchStartY.current;
        if (diff > 100) {
            // Swipe was long enough → close
            setDragOffset(window.innerHeight); // animate out
            setTimeout(() => {
                onClose();
                setDragOffset(0);
            }, 200);
        } else {
            // Snap back
            setDragOffset(0);
        }
    }, [onClose]);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (currentTrack) {
            isTrackLiked(currentTrack.id).then(setLiked);
        }
    }, [currentTrack]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen]);

    const handleToggleLike = async () => {
        if (!currentTrack) return;
        const nowLiked = await toggleLike(currentTrack.id);
        setLiked(nowLiked);
    };

    if (!isClient || !isOpen || !currentTrack) return null;

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    const hasNext = currentIndex < queue.length - 1;
    const hasPrev = currentIndex > 0;

    // Create high-res artwork if available
    const highResArtwork = currentTrack.coverUrl?.replace("100x100", "1000x1000")?.replace("200x200", "1000x1000")?.replace("500x500", "1000x1000") || "/placeholder.png";

    return (
        <div
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="fixed inset-0 z-[100] flex flex-col bg-[#060913] animate-slideIn pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            style={{
                transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
                transition: isDragging.current ? 'none' : 'transform 0.3s ease-out',
                opacity: dragOffset > 0 ? Math.max(1 - dragOffset / 500, 0.3) : 1,
                borderRadius: dragOffset > 20 ? '24px' : '0',
            }}
        >
            {/* Dynamic Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none transition-all duration-1000">
                <div
                    className="absolute inset-0 opacity-40 blur-[120px] scale-125 transform-gpu saturate-[1.5] contrast-125 transition-all duration-1000"
                    style={{
                        backgroundImage: `url(${highResArtwork})`,
                        backgroundPosition: "center",
                        backgroundSize: "cover",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#060913]/90 to-[#060913] transition-all duration-1000" />
            </div>

            {/* Header — swipeable zone indicator */}
            <div className="relative z-10 flex flex-col items-center shrink-0">
                {/* Drag handle indicator */}
                <div className="w-10 h-1 bg-white/20 rounded-full mt-3 mb-1" />
                <div className="flex items-center justify-between w-full p-6 pt-2">
                    <button
                        onClick={onClose}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-all duration-300 backdrop-blur-md active:scale-90"
                        aria-label="Minimizar reproductor"
                    >
                        <ChevronDown size={28} />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-400 drop-shadow-sm">
                            REPRODUCIENDO DESDE
                        </span>
                        <span className="text-sm font-bold text-white/90 drop-shadow-sm truncate max-w-[200px] md:max-w-xs">
                            {currentTrack.album || "Mi Biblioteca"}
                        </span>
                    </div>
                    <div className="w-12" /> {/* Spacer for centering */}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col items-center px-6 md:px-12 pb-2 md:pb-4 max-w-2xl mx-auto w-full min-h-0">

                {/* Spacer */}
                <div className="flex-[0.5] max-h-[4vh] hidden md:block w-full min-h-0"></div>

                {/* Artwork */}
                <div className="w-full flex items-center justify-center relative flex-shrink-0 animate-fade-in-up md:my-2 min-h-0">
                    <div
                        className={`relative w-full shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] transition-all duration-500 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden ${isPlaying ? "scale-100 translate-y-0" : "scale-[0.92] opacity-80 translate-y-2"} border border-white/5`}
                        style={{ maxWidth: 'min(88vw, 38vh, 380px)', aspectRatio: '1/1' }}
                    >
                        <div className="absolute inset-0 bg-white/5 z-10 pointer-events-none mix-blend-overlay"></div>
                        <img
                            src={highResArtwork}
                            alt={currentTrack.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => {
                                // Fallback if 1000x1000 fails
                                (e.target as HTMLImageElement).src = currentTrack.coverUrl || "/placeholder.png";
                            }}
                        />
                    </div>
                </div>

                {/* Bottom Controls Bundle */}
                <div className="w-full flex flex-col justify-end flex-1 pb-2 z-20">
                    <div className="flex-1 min-h-[2vh] max-h-[8vh]"></div> {/* Flexible spacer */}

                    {/* Track Info & Like */}
                    <div className="w-full flex items-center justify-between mt-auto mb-5 md:mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                        <div className="flex flex-col min-w-0 pr-4">
                            <h2 title={currentTrack.title} className="text-[28px] md:text-4xl font-black text-white truncate drop-shadow-md mb-1.5 tracking-tight">
                                {currentTrack.title}
                            </h2>
                            <div
                                title={currentTrack.artist}
                                className="text-base md:text-xl font-medium text-slate-400 truncate text-left max-w-fit flex items-center"
                            >
                                {currentTrack.artist.split(/(, | & | y | ft\. | feat\. )/i).map((part, i) =>
                                    i % 2 === 0 ? (
                                        <Link
                                            key={i}
                                            href={`/artist/${encodeURIComponent(part.trim())}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClose();
                                            }}
                                            className="hover:text-brand-400 hover:underline transition-all outline-none"
                                        >
                                            {part}
                                        </Link>
                                    ) : (
                                        <span key={i} className="whitespace-pre">{part}</span>
                                    )
                                )}
                            </div>
                        </div>
                        <button
                            onClick={handleToggleLike}
                            className={`p-3 md:p-3.5 rounded-full transition-all duration-300 flex-shrink-0 active:scale-90 bg-white/5 backdrop-blur-sm ${liked
                                ? "text-pink-500 bg-pink-500/10 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                                : "text-white/60 hover:text-white hover:bg-white/15"
                                }`}
                            aria-label={liked ? "Quitar me gusta" : "Me gusta"}
                        >
                            <Heart className="w-6 h-6 md:w-7 md:h-7" fill={liked ? "currentColor" : "none"} />
                        </button>
                    </div>

                    {/* Scrubber / Progress Bar */}
                    <div
                        className="w-full mb-5 md:mb-6 relative group"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        <div
                            ref={progressBarRef}
                            className="relative h-6 flex items-center cursor-pointer group-hover:h-6 -my-2 py-2"
                            onMouseDown={handleProgressTouchStart}
                            onTouchStart={handleProgressTouchStart}
                            onTouchMove={handleProgressTouchMove}
                            onTouchEnd={handleProgressTouchEnd}
                        >
                            <div className="w-full h-2.5 bg-white/10 rounded-full overflow-visible relative group-hover:h-3.5 transition-all duration-200">
                                <div
                                    className="h-full bg-white rounded-full relative shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                    style={{ width: `${((isDraggingProgress ? dragProgress : progress) / (duration || 1)) * 100}%` }}
                                >
                                    <div className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${isDraggingProgress ? 'scale-100' : 'scale-0 group-hover:scale-100'}`}></div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-bold text-white/50 mt-3 tabular-nums">
                            <span>{formatTime(isDraggingProgress ? dragProgress : progress)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Primary Controls */}
                    <div className="w-full flex items-center justify-between mb-5 md:mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                        <button onClick={toggleShuffle} className={`transition-colors p-3 active:scale-90 ${isShuffle ? 'text-brand-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'text-white/40 hover:text-white'}`} aria-label="Aleatorio">
                            <Shuffle size={24} />
                        </button>

                        <button
                            onClick={playPrev}
                            disabled={!hasPrev}
                            className={`text-white/80 hover:text-white transition-all p-2 mx-2 active:scale-90 ${!hasPrev && 'opacity-30 cursor-not-allowed'}`}
                        >
                            <SkipBack className="w-9 h-9 md:w-11 md:h-11 shadow-sm" fill="currentColor" />
                        </button>

                        <button
                            onClick={togglePlay}
                            disabled={isLoading}
                            className="relative flex items-center justify-center w-[74px] h-[74px] md:w-[84px] md:h-[84px] rounded-full bg-white text-black shadow-[0_10px_40px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95 transition-all duration-300 mx-2 disabled:opacity-80 disabled:hover:scale-100 disabled:active:scale-100 disabled:cursor-wait"
                            aria-label={isPlaying ? "Pausar" : "Reproducir"}
                        >
                            {isLoading ? (
                                <EqLoader size={34} />
                            ) : isPlaying ? (
                                <Pause size={38} fill="currentColor" strokeWidth={0} />
                            ) : (
                                <Play size={40} fill="currentColor" strokeWidth={0} className="ml-2" />
                            )}
                        </button>

                        <button
                            onClick={playNext}
                            disabled={!hasNext && repeatMode === 'none' && !isShuffle}
                            className={`text-white/80 hover:text-white transition-all p-2 mx-2 active:scale-90 ${(!hasNext && repeatMode === 'none' && !isShuffle) && 'opacity-30 cursor-not-allowed'}`}
                        >
                            <SkipForward className="w-9 h-9 md:w-11 md:h-11 shadow-sm" fill="currentColor" />
                        </button>

                        <button onClick={toggleRepeat} className={`relative transition-colors p-3 active:scale-90 ${repeatMode !== 'none' ? 'text-brand-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]' : 'text-white/40 hover:text-white'}`} aria-label="Repetir">
                            <Repeat size={24} />
                            {repeatMode === 'one' && <span className="absolute text-[10px] font-bold -top-0 -right-0 bg-brand-500 rounded-full w-[16px] h-[16px] flex items-center justify-center text-white">1</span>}
                        </button>
                    </div>

                    {/* Secondary Actions / Footer */}
                    <div className="w-full flex items-center justify-between text-white/40 px-6 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                        <button
                            onClick={() => { onClose(); toggleLyrics(); }}
                            className={`p-3 transition-colors rounded-xl active:scale-90 ${isLyricsVisible ? 'text-brand-400 bg-brand-500/10' : 'hover:text-white'}`}
                        >
                            <Mic2 size={22} />
                        </button>
                        <button
                            onClick={() => { onClose(); toggleDevices(); }}
                            className={`p-3 transition-colors rounded-xl active:scale-90 ${isDevicesVisible ? 'text-brand-400 bg-brand-500/10' : 'hover:text-white'}`}
                        >
                            <MonitorSpeaker size={22} />
                        </button>
                        <button
                            onClick={() => { onClose(); toggleQueue(); }}
                            className={`p-3 transition-colors rounded-xl flex items-center gap-2 active:scale-90 ${isQueueVisible ? 'text-brand-400 bg-brand-500/10' : 'hover:text-white'}`}
                        >
                            <ListMusic size={22} />
                        </button>
                    </div>

                </div> {/* End Bottom Controls Bundle */}

            </div>
        </div>
    );
}
