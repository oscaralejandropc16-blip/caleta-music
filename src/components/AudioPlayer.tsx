"use client";

import React, { useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipForward, SkipBack, Volume2, Maximize2, Heart } from "lucide-react";
import { isTrackLiked, toggleLike } from "@/lib/db";

export default function AudioPlayer() {
    const { currentTrack, isPlaying, togglePlay, playNext, playPrev, progress, duration, seekTo, queue, currentIndex } = usePlayer();
    const [isClient, setIsClient] = useState(false);
    const [liked, setLiked] = useState(false);
    const [volume, setVolume] = useState(100);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Check like status when track changes
    useEffect(() => {
        if (currentTrack) {
            isTrackLiked(currentTrack.id).then(setLiked);
        }
    }, [currentTrack]);

    const handleToggleLike = async () => {
        if (!currentTrack) return;
        const nowLiked = await toggleLike(currentTrack.id);
        setLiked(nowLiked);
    };

    if (!isClient || !currentTrack) return null;

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const hasNext = currentIndex < queue.length - 1;
    const hasPrev = currentIndex > 0;

    return (
        <div className="fixed bottom-16 md:bottom-0 left-0 right-0 h-[72px] md:h-24 bg-[#0a0f1e]/95 backdrop-blur-xl border-t border-white/[0.08] z-50 flex items-center justify-between px-3 md:px-8 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] light-mode:bg-white/95 light-mode:border-slate-200">
            {/* Track Info */}
            <div className="flex items-center gap-3 w-[45%] md:w-1/4 min-w-[140px] md:min-w-[200px]">
                <div className="relative h-10 w-10 md:h-14 md:w-14 rounded-md overflow-hidden bg-slate-800 flex-shrink-0">
                    <img
                        src={currentTrack.coverUrl || '/placeholder.png'}
                        alt="cover"
                        className="object-cover w-full h-full"
                    />
                </div>
                <div className="flex flex-col truncate">
                    <span className="text-white font-medium text-sm truncate light-mode:text-slate-900">{currentTrack.title}</span>
                    <span className="text-slate-400 text-[10px] md:text-xs truncate light-mode:text-slate-500">{currentTrack.artist}</span>
                </div>
                {/* Like button near track info */}
                <button
                    onClick={handleToggleLike}
                    className={`p-2 rounded-full transition-all flex-shrink-0 hidden sm:flex ${liked
                        ? "text-pink-500 hover:text-pink-400 hover:scale-110"
                        : "text-slate-500 hover:text-pink-500 hover:scale-110"
                        }`}
                    title={liked ? "Quitar me gusta" : "Me gusta"}
                >
                    <Heart size={18} fill={liked ? "currentColor" : "none"} />
                </button>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center justify-center flex-1 max-w-2xl px-2 md:px-4">
                <div className="flex items-center gap-4 md:gap-6 md:mb-2">
                    <button
                        onClick={playPrev}
                        disabled={!hasPrev}
                        className={`text-slate-400 hover:text-white transition-colors light-mode:hover:text-slate-800 ${!hasPrev && 'opacity-50 cursor-not-allowed'}`}
                    >
                        <SkipBack size={20} fill="currentColor" />
                    </button>

                    <button
                        onClick={togglePlay}
                        className="h-10 w-10 bg-white hover:bg-slate-200 text-black rounded-full flex items-center justify-center transition-transform hover:scale-105 shadow-lg light-mode:bg-brand-500 light-mode:text-white light-mode:hover:bg-brand-600"
                    >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                    </button>

                    <button
                        onClick={playNext}
                        disabled={!hasNext}
                        className={`text-slate-400 hover:text-white transition-colors light-mode:hover:text-slate-800 ${!hasNext && 'opacity-50 cursor-not-allowed'}`}
                    >
                        <SkipForward size={20} fill="currentColor" />
                    </button>

                    {/* Mobile Like button (moved here to save space) */}
                    <button
                        onClick={handleToggleLike}
                        className={`sm:hidden p-1.5 ml-1 rounded-full flex-shrink-0 ${liked
                            ? "text-pink-500"
                            : "text-slate-400"
                            }`}
                    >
                        <Heart size={18} fill={liked ? "currentColor" : "none"} />
                    </button>
                </div>

                {/* Progress Bar (Hidden on very small screens to save space, but kept for landscape or medium) */}
                <div className="hidden md:flex w-full items-center gap-3 text-xs text-slate-400 font-medium light-mode:text-slate-500">
                    <span>{formatTime(progress)}</span>
                    <div
                        className="flex-1 h-1.5 bg-slate-700 hover:h-2 transition-all rounded-full cursor-pointer relative group light-mode:bg-slate-300"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const pos = (e.clientX - rect.left) / rect.width;
                            seekTo(pos * duration);
                        }}
                    >
                        <div
                            className="absolute top-0 left-0 bottom-0 bg-brand-500 rounded-full"
                            style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transform translate-x-1/2"></div>
                        </div>
                    </div>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            {/* Auxiliary Controls */}
            <div className="w-[15%] md:w-1/4 min-w-[50px] md:min-w-[150px] flex justify-end gap-3 md:gap-4 text-slate-400 items-center light-mode:text-slate-500">
                <Volume2 size={20} className="hover:text-white cursor-pointer transition-colors hidden md:block light-mode:hover:text-slate-800" />
                <div className="w-20 lg:w-24 h-1.5 bg-slate-700 rounded-full cursor-pointer relative group hidden md:block light-mode:bg-slate-300">
                    <div className="absolute top-0 left-0 bottom-0 bg-slate-300 w-full rounded-full group-hover:bg-brand-500 light-mode:bg-slate-500"></div>
                </div>
                <Maximize2 size={18} className="hover:text-white cursor-pointer transition-colors hidden sm:block light-mode:hover:text-slate-800" />
            </div>

            {/* Mobile Progress Bar absolute at top of player */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 md:hidden light-mode:bg-slate-200">
                <div
                    className="h-1 bg-brand-500 rounded-r-full"
                    style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                ></div>
            </div>
        </div>
    );
}
