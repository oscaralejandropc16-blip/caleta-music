"use client";

import React, { useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipForward, SkipBack, X, Heart, Repeat, Shuffle, ChevronDown, Loader } from "lucide-react";
import { isTrackLiked, toggleLike } from "@/lib/db";
import { useRouter } from "next/navigation";

interface FullScreenPlayerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FullScreenPlayer({ isOpen, onClose }: FullScreenPlayerProps) {
    const { currentTrack, isPlaying, isLoading, togglePlay, playNext, playPrev, progress, duration, seekTo, queue, currentIndex } = usePlayer();
    const router = useRouter();
    const [liked, setLiked] = useState(false);
    const [isClient, setIsClient] = useState(false);

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
    const highResArtwork = currentTrack.coverUrl?.replace("100x100", "600x600")?.replace("200x200", "600x600") || "/placeholder.png";

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#060913] animate-slideIn">
            {/* Dynamic Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute inset-x-0 top-0 h-1/2 opacity-30 blur-[100px] scale-150 transform-gpu satuate-200"
                    style={{
                        backgroundImage: `url(${highResArtwork})`,
                        backgroundPosition: "center top",
                        backgroundSize: "cover",
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#060913]/80 to-[#060913]" />
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between p-6">
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

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col items-center px-6 md:px-12 pb-6 md:pb-8 max-w-2xl mx-auto w-full min-h-0">

                {/* Spacer (keeps image vertically centered if screen is tall) */}
                <div className="flex-[0.5] hidden md:block w-full min-h-0"></div>

                {/* Artwork */}
                <div className="w-full flex items-center justify-center relative my-2 md:my-4 flex-shrink-0">
                    <div
                        className={`relative w-full shadow-[0_25px_50px_rgba(0,0,0,0.5)] border border-white/10 transition-transform duration-500 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden ${isPlaying ? "scale-100" : "scale-95 opacity-90"}`}
                        style={{ maxWidth: 'min(100%, 45vh, 420px)', aspectRatio: '1/1' }}
                    >
                        <img
                            src={highResArtwork}
                            alt={currentTrack.title}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    </div>
                </div>

                {/* Bottom Controls Bundle */}
                <div className="w-full flex flex-col items-center flex-shrink-0 z-20">

                    {/* Track Info & Like */}
                    <div className="w-full flex items-center justify-between mb-6 md:mb-8 mt-6 md:mt-4">
                        <div className="flex flex-col min-w-0 pr-4">
                            <h2 title={currentTrack.title} className="text-2xl md:text-4xl font-black text-white truncate drop-shadow-sm mb-1 leading-tight">
                                {currentTrack.title}
                            </h2>
                            <div
                                title={currentTrack.artist}
                                className="text-base md:text-xl font-medium text-slate-400 truncate text-left max-w-fit flex items-center"
                            >
                                {currentTrack.artist.split(/(, | & | y | ft\. | feat\. )/i).map((part, i) =>
                                    i % 2 === 0 ? (
                                        <button
                                            key={i}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onClose();
                                                router.push(`/artist/${encodeURIComponent(part.trim())}`);
                                            }}
                                            className="hover:text-brand-400 hover:underline transition-all outline-none"
                                        >
                                            {part}
                                        </button>
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
                    <div className="w-full mb-6 md:mb-8 relative group">
                        <div
                            className="h-2.5 bg-white/10 rounded-full cursor-pointer overflow-hidden transition-all duration-200 group-hover:h-3.5"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = (e.clientX - rect.left) / rect.width;
                                const newTime = pos * duration;
                                seekTo(newTime);
                            }}
                        >
                            <div
                                className="h-full bg-white rounded-full relative shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-bold text-white/50 mt-3 tabular-nums">
                            <span>{formatTime(progress)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Primary Controls */}
                    <div className="w-full flex items-center justify-between mb-4 md:mb-8 max-w-[360px]">
                        <button className="text-white/40 hover:text-white transition-colors p-2 md:p-3 active:scale-90" aria-label="Aleatorio">
                            <Shuffle size={24} />
                        </button>

                        <button
                            onClick={playPrev}
                            disabled={!hasPrev}
                            aria-label="Anterior"
                            className={`text-white transition-all p-2 md:p-3 hover:scale-110 active:scale-90 ${!hasPrev && 'opacity-30 cursor-not-allowed'}`}
                        >
                            <SkipBack className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" />
                        </button>

                        <button
                            onClick={togglePlay}
                            disabled={isLoading}
                            aria-label={isPlaying ? "Pausar" : "Reproducir"}
                            className="w-[72px] h-[72px] md:w-24 md:h-24 bg-brand-500 hover:bg-brand-400 text-white rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_10px_30px_rgba(99,102,241,0.5)] border flex-shrink-0 border-brand-500/30 disabled:opacity-80 disabled:hover:scale-100 disabled:active:scale-100"
                        >
                            {isLoading ? <Loader className="w-8 h-8 md:w-10 md:h-10 animate-spin" /> : (isPlaying ? <Pause className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" /> : <Play className="w-8 h-8 md:w-10 md:h-10 ml-2" fill="currentColor" />)}
                        </button>

                        <button
                            onClick={playNext}
                            disabled={!hasNext}
                            aria-label="Siguiente"
                            className={`text-white transition-all p-2 md:p-3 hover:scale-110 active:scale-90 ${!hasNext && 'opacity-30 cursor-not-allowed'}`}
                        >
                            <SkipForward className="w-8 h-8 md:w-10 md:h-10" fill="currentColor" />
                        </button>

                        <button className="text-white/40 hover:text-white transition-colors p-2 md:p-3 active:scale-90" aria-label="Repetir">
                            <Repeat size={24} />
                        </button>
                    </div>

                    {/* Secondary Actions / Footer */}
                    <div className="w-full mt-6 flex justify-center pb-2 md:pb-0 hidden sm:flex">
                        <p className="text-[10px] md:text-[12px] font-bold text-white/30 tracking-widest uppercase">
                            Caleta Music Audio
                        </p>
                    </div>

                </div> {/* End Bottom Controls Bundle */}

            </div>
        </div>
    );
}
