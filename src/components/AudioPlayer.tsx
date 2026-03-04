"use client";

import React, { useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipForward, SkipBack, Volume2, Volume1, VolumeX, Maximize2, Heart, Loader } from "lucide-react";
import { isTrackLiked, toggleLike } from "@/lib/db";
import toast from "react-hot-toast";
import FullScreenPlayer from "./FullScreenPlayer";
import { useRouter } from "next/navigation";

export default function AudioPlayer() {
    const { currentTrack, isPlaying, isLoading, togglePlay, playNext, playPrev, progress, duration, seekTo, queue, currentIndex, audioRef } = usePlayer();
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const [liked, setLiked] = useState(false);
    const [volume, setVolume] = useState(100);
    const [prevVolume, setPrevVolume] = useState(100);
    const [isFullScreen, setIsFullScreen] = useState(false);

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

    const handleVolumeChange = (newVolume: number) => {
        const clamped = Math.max(0, Math.min(100, newVolume));
        setVolume(clamped);
        if (audioRef.current) {
            audioRef.current.volume = clamped / 100;
        }
    };

    const handleToggleMute = () => {
        if (volume > 0) {
            setPrevVolume(volume);
            handleVolumeChange(0);
        } else {
            handleVolumeChange(prevVolume || 70);
        }
    };

    const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

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
        <>
            <div className="fixed bottom-[4.5rem] md:bottom-0 left-2 right-2 md:left-0 md:right-0 h-[60px] md:h-24 bg-[#1e1e24] md:bg-[#0a0f1e]/85 rounded-xl md:rounded-none backdrop-blur-3xl border border-white/5 md:border-t md:border-white/[0.05] z-50 flex flex-col md:flex-row shadow-2xl transition-all duration-300 md:px-8 overflow-hidden">

                {/* MOBILE PROGRESS BAR (Line at the very bottom) */}
                <div className="w-full h-[2px] bg-white/10 md:hidden absolute bottom-0 left-0">
                    <div className="h-full bg-white transition-all duration-200" style={{ width: `${(progress / (duration || 1)) * 100}%` }}></div>
                </div>

                {/* ---> MOBILE DEEZER-STYLE LAYOUT <--- */}
                <div className="flex md:hidden w-full h-full items-center justify-between px-3" onClick={() => setIsFullScreen(true)}>
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {/* Play/Pause Button on Left */}
                        <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-2 -ml-1 text-white outline-none active:scale-90">
                            {isLoading ? <Loader size={20} className="animate-spin" /> : (isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />)}
                        </button>

                        <div className="flex flex-col min-w-0 flex-1 justify-center ml-1">
                            <span className="text-white font-bold text-[13px] truncate leading-tight w-full pointer-events-none">
                                {currentTrack.title}
                            </span>
                            <span className="text-slate-400 text-[11px] font-medium truncate w-full pointer-events-none mt-[1px]">
                                {currentTrack.artist}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pl-2 flex-shrink-0 text-white">
                        <button onClick={(e) => { e.stopPropagation(); handleToggleLike(); }} className="p-2 outline-none active:scale-90">
                            <Heart size={20} fill={liked ? "currentColor" : "none"} className={liked ? "text-pink-500 hover:drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]" : ""} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(); }} disabled={!hasNext} className={`p-2 outline-none active:scale-90 ${!hasNext ? 'opacity-30' : ''}`}>
                            <SkipForward size={22} fill="currentColor" />
                        </button>
                    </div>
                </div>

                {/* ---> DESKTOP LAYOUT <--- */}
                <div className="hidden md:flex w-full h-full items-center justify-between">
                    {/* Track Info */}
                    <div
                        className="flex items-center gap-3 w-[45%] md:w-3/12 min-w-[140px] md:min-w-[200px] group cursor-pointer md:cursor-default"
                        onClick={() => {
                            if (window.innerWidth < 768) {
                                setIsFullScreen(true);
                            }
                        }}
                    >
                        <div className="relative h-12 w-12 md:h-16 md:w-16 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 shadow-lg shadow-black/20 group-hover:shadow-brand-500/10 transition-shadow duration-300">
                            <img
                                src={currentTrack.coverUrl || '/placeholder.png'}
                                alt="cover"
                                className="object-cover w-full h-full transform group-hover:scale-105 transition-transform duration-700 ease-out"
                            />
                        </div>
                        <div className="flex flex-col min-w-0 ml-1 items-start flex-1 overflow-hidden">
                            <span title={currentTrack.title} className="text-white font-bold text-sm truncate w-full light-mode:text-slate-900 drop-shadow-sm cursor-pointer hover:underline decoration-brand-500/50 underline-offset-2">
                                {currentTrack.title}
                            </span>
                            <div
                                title={currentTrack.artist}
                                className="text-slate-400 text-[11px] md:text-sm font-medium truncate light-mode:text-slate-500 w-full block"
                            >
                                {currentTrack.artist.split(/(, | & | y | ft\. | feat\. )/i).map((part, i) =>
                                    i % 2 === 0 ? (
                                        <button
                                            key={i}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsFullScreen(false);
                                                router.push(`/artist/${encodeURIComponent(part.trim())}`);
                                            }}
                                            className="cursor-pointer hover:text-brand-400 hover:underline transition-colors outline-none"
                                        >
                                            {part}
                                        </button>
                                    ) : (
                                        <span key={i} className="whitespace-pre">{part}</span>
                                    )
                                )}
                            </div>
                        </div>
                        {/* Like button near track info */}
                        <button
                            onClick={handleToggleLike}
                            className={`p-2 rounded-full transition-all duration-300 flex-shrink-0 hidden sm:flex ml-2 outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50 active:scale-90 ${liked
                                ? "text-pink-500 hover:text-pink-400 hover:drop-shadow-[0_0_8px_rgba(236,72,153,0.5)] scale-110"
                                : "text-slate-500 hover:text-pink-500 hover:bg-white/5"
                                }`}
                            title={liked ? "Quitar me gusta" : "Me gusta"}
                        >
                            <Heart size={18} fill={liked ? "currentColor" : "none"} />
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center justify-center flex-1 max-w-3xl px-2 md:px-6 z-10">
                        <div className="flex items-center gap-5 md:gap-8 md:mb-1.5">
                            <button
                                onClick={playPrev}
                                disabled={!hasPrev}
                                aria-label="Pista anterior"
                                className={`text-slate-400 hover:text-white transition-all duration-200 p-2 rounded-full hover:bg-white/[0.05] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 light-mode:hover:text-slate-800 ${!hasPrev && 'opacity-40 cursor-not-allowed hover:bg-transparent'}`}
                            >
                                <SkipBack size={22} fill="currentColor" className="drop-shadow-sm" />
                            </button>

                            <button
                                onClick={togglePlay}
                                disabled={isLoading}
                                aria-label={isPlaying ? "Pausar" : "Reproducir"}
                                className="h-12 w-12 md:h-14 md:w-14 bg-white hover:bg-slate-200 text-[#0f172a] rounded-full flex items-center justify-center transition-all duration-300 hover:scale-[1.05] active:scale-95 shadow-[0_4px_20px_rgba(255,255,255,0.2)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.3)] light-mode:bg-brand-500 light-mode:text-white light-mode:hover:bg-brand-600 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/50 disabled:opacity-80 disabled:hover:scale-100 disabled:active:scale-100"
                            >
                                {isLoading ? <Loader size={24} className="animate-spin" /> : (isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />)}
                            </button>

                            <button
                                onClick={playNext}
                                disabled={!hasNext}
                                aria-label="Siguiente pista"
                                className={`text-slate-400 hover:text-white transition-all duration-200 p-2 rounded-full hover:bg-white/[0.05] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 light-mode:hover:text-slate-800 ${!hasNext && 'opacity-40 cursor-not-allowed hover:bg-transparent'}`}
                            >
                                <SkipForward size={22} fill="currentColor" className="drop-shadow-sm" />
                            </button>

                            {/* Mobile Like button (moved here to save space) */}
                            <button
                                onClick={handleToggleLike}
                                aria-label="Me gusta móvil"
                                className={`sm:hidden p-2 ml-1 rounded-full flex-shrink-0 transition-transform active:scale-90 ${liked
                                    ? "text-pink-500 scale-110 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]"
                                    : "text-slate-400 hover:bg-white/5"
                                    }`}
                            >
                                <Heart size={20} fill={liked ? "currentColor" : "none"} />
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="hidden md:flex w-full items-center gap-4 text-[11px] text-slate-400 font-medium light-mode:text-slate-500 tracking-wide">
                            <span className="w-10 text-right tabular-nums opacity-80">{formatTime(progress)}</span>
                            <div
                                className="flex-1 h-1.5 bg-slate-700/50 hover:bg-slate-700 hover:h-2 transition-all duration-200 rounded-full cursor-pointer relative group light-mode:bg-slate-200"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pos = (e.clientX - rect.left) / rect.width;
                                    const newTime = pos * duration;
                                    seekTo(newTime);
                                }}
                            >
                                <div
                                    className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-brand-600 to-brand-400 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                    style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                                >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-lg transform translate-x-1/2 scale-50 group-hover:scale-100 transition-all duration-200 pointer-events-none"></div>
                                </div>
                            </div>
                            <span className="w-10 text-left tabular-nums opacity-80">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Auxiliary Controls */}
                    <div className="hidden md:flex w-3/12 min-w-[150px] justify-end gap-5 text-slate-400 items-center light-mode:text-slate-500 pr-2">
                        <button onClick={handleToggleMute} aria-label={volume === 0 ? "Activar sonido" : "Silenciar"} className="hover:text-white transition-colors p-1 rounded-full hover:bg-white/5 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/20">
                            <VolumeIcon size={20} />
                        </button>
                        <div
                            className="w-24 lg:w-32 h-1.5 bg-slate-700/60 rounded-full cursor-pointer relative group light-mode:bg-slate-300 transition-all duration-200 hover:h-2"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pos = (e.clientX - rect.left) / rect.width;
                                handleVolumeChange(Math.round(pos * 100));
                            }}
                        >
                            <div
                                className="absolute top-0 left-0 bottom-0 bg-slate-300 rounded-full group-hover:bg-brand-400 group-hover:shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-colors light-mode:bg-slate-500"
                                style={{ width: `${volume}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-md transform translate-x-1/2 scale-50 group-hover:scale-100 transition-all duration-200 pointer-events-none"></div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsFullScreen(true)}
                            aria-label="Expandir"
                            className="hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/5 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                        >
                            <Maximize2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Full Screen Player Modal */}
            {isFullScreen && (
                <FullScreenPlayer
                    isOpen={isFullScreen}
                    onClose={() => setIsFullScreen(false)}
                />
            )}
        </>
    );
}
