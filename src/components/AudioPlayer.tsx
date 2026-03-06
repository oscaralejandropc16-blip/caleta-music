"use client";

import React, { useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { Play, Pause, SkipForward, SkipBack, Volume2, Volume1, VolumeX, Maximize2, Heart, Loader, Shuffle, Repeat, Mic2, ListMusic, MonitorSpeaker, Plus } from "lucide-react";
import { isTrackLiked, toggleLike } from "@/lib/db";
import toast from "react-hot-toast";
import FullScreenPlayer from "./FullScreenPlayer";
import { useRouter } from "next/navigation";
import EqLoader from "./EqLoader";

export default function AudioPlayer() {
    const { currentTrack, isPlaying, isLoading, togglePlay, playNext, playPrev, progress, duration, seekTo, queue, currentIndex, audioRef, isShuffle, toggleShuffle, repeatMode, toggleRepeat, isQueueVisible, toggleQueue, isDevicesVisible, toggleDevices, isLyricsVisible, toggleLyrics } = usePlayer();
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
            <style jsx>{`
                .mini-player-pos {
                    bottom: calc(64px + env(safe-area-inset-bottom, 6px) + 8px);
                }
                @media (min-width: 768px) {
                    .mini-player-pos {
                        bottom: 0 !important;
                    }
                }
            `}</style>
            <div
                className="mini-player-pos fixed left-2 right-2 md:left-0 md:right-0 h-[60px] md:h-[90px] bg-[#1e1e24] md:bg-[#121216] rounded-xl md:rounded-none border border-white/5 md:border-t md:border-white/[0.05] z-50 flex flex-col md:flex-row shadow-2xl transition-all duration-300 overflow-hidden"
            >

                {/* MOBILE PROGRESS BAR (Line at the very bottom) */}
                <div className="w-full h-[2px] bg-white/10 md:hidden absolute bottom-0 left-0">
                    <div className="h-full bg-brand-500 transition-all duration-200" style={{ width: `${(progress / (duration || 1)) * 100}%` }}></div>
                </div>

                {/* ---> MOBILE DEEZER-STYLE LAYOUT <--- */}
                <div className="flex md:hidden w-full h-full items-center justify-between px-3" onClick={() => setIsFullScreen(true)}>
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        {/* Play/Pause Button on Left */}
                        <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} disabled={isLoading} className="p-2 -ml-1 text-white outline-none active:scale-90 flex items-center justify-center disabled:opacity-80">
                            {isLoading ? <EqLoader size={18} /> : (isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />)}
                        </button>

                        <div className="flex flex-col min-w-0 flex-1 justify-center ml-1">
                            <span className="text-white font-bold text-[13px] truncate leading-tight w-full pointer-events-none">
                                {currentTrack.title}
                            </span>
                            <span className="text-neutral-400 text-[11px] font-medium truncate w-full pointer-events-none mt-[1px]">
                                {currentTrack.artist}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pl-2 flex-shrink-0 text-white">
                        <button onClick={(e) => { e.stopPropagation(); handleToggleLike(); }} className="p-2 outline-none active:scale-90">
                            <Heart size={20} fill={liked ? "currentColor" : "none"} className={liked ? "text-brand-500" : ""} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); playNext(); }} disabled={!hasNext} className={`p-2 outline-none active:scale-90 ${!hasNext ? 'opacity-30' : ''}`}>
                            <SkipForward size={22} fill="currentColor" />
                        </button>
                    </div>
                </div>

                {/* ---> DESKTOP LAYOUT (Deezer Style) <--- */}
                <div className="hidden md:flex w-full h-full items-center justify-between px-4">
                    {/* Track Info */}
                    <div className="flex items-center gap-3 w-[30%] min-w-[200px] max-w-[350px] group">
                        <div
                            className="relative h-[52px] w-[52px] rounded-md overflow-hidden bg-neutral-800 flex-shrink-0 cursor-pointer shadow-md"
                            onClick={() => setIsFullScreen(true)}
                        >
                            <img
                                src={currentTrack.coverUrl || '/placeholder.png'}
                                alt="cover"
                                className="object-cover w-full h-full"
                            />
                        </div>
                        <div className="flex flex-col min-w-0 mx-1 items-start justify-center flex-1 overflow-hidden">
                            <span
                                title={currentTrack.title}
                                className="text-white font-bold text-[14px] truncate w-full cursor-pointer hover:underline decoration-neutral-400/50 underline-offset-2"
                                onClick={() => setIsFullScreen(true)}
                            >
                                {currentTrack.title}
                            </span>
                            <div
                                title={currentTrack.artist}
                                className="text-neutral-400 text-[12px] truncate w-full block mt-[2px]"
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
                                            className="cursor-pointer hover:text-white hover:underline transition-colors outline-none"
                                        >
                                            {part}
                                        </button>
                                    ) : (
                                        <span key={i} className="whitespace-pre">{part}</span>
                                    )
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                                onClick={handleToggleLike}
                                className={`p-2 rounded-full transition-all duration-200 outline-none active:scale-90 ${liked ? "text-brand-500" : "text-neutral-400 hover:text-white"}`}
                                title={liked ? "Quitar me gusta" : "Me gusta"}
                            >
                                <Heart size={18} fill={liked ? "currentColor" : "none"} />
                            </button>
                            <button onClick={() => toast("Añadir a playlist próximamente", { icon: "🎵", style: { background: "#1e1e24", color: "#fff", borderColor: "#ffffff10", borderWidth: "1px" } })} className="p-2 text-neutral-400 hover:text-white transition-colors outline-none active:scale-90" title="Añadir a playlist">
                                <Plus size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Controls & Progress */}
                    <div className="flex flex-col items-center justify-center flex-1 max-w-[600px] px-6">
                        <div className="flex items-center gap-6 mb-2">
                            <button onClick={toggleShuffle} className={`transition-colors active:scale-90 outline-none ${isShuffle ? 'text-brand-500' : 'text-neutral-400 hover:text-white'}`} title="Aleatorio">
                                <Shuffle size={18} />
                            </button>

                            <button
                                onClick={playPrev}
                                disabled={!hasPrev}
                                aria-label="Pista anterior"
                                className={`text-neutral-400 hover:text-white transition-colors active:scale-90 outline-none ${!hasPrev && 'opacity-30 cursor-not-allowed hover:text-neutral-400'}`}
                            >
                                <SkipBack size={20} fill="currentColor" />
                            </button>

                            <button
                                onClick={togglePlay}
                                disabled={isLoading}
                                aria-label={isPlaying ? "Pausar" : "Reproducir"}
                                className="h-10 w-10 bg-brand-500 hover:bg-brand-400 text-white rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 outline-none disabled:opacity-80 disabled:hover:bg-brand-500"
                            >
                                {isLoading ? <EqLoader size={16} /> : (isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />)}
                            </button>

                            <button
                                onClick={playNext}
                                disabled={!hasNext && repeatMode === 'none' && !isShuffle}
                                aria-label="Siguiente pista"
                                className={`text-neutral-400 hover:text-white transition-colors active:scale-90 outline-none ${(!hasNext && repeatMode === 'none' && !isShuffle) && 'opacity-30 cursor-not-allowed hover:text-neutral-400'}`}
                            >
                                <SkipForward size={20} fill="currentColor" />
                            </button>

                            <button onClick={toggleRepeat} className={`relative transition-colors active:scale-90 outline-none ${repeatMode !== 'none' ? 'text-brand-500' : 'text-neutral-400 hover:text-white'}`} title={repeatMode === 'one' ? 'Repetir una vez' : 'Repetir todo'}>
                                <Repeat size={18} />
                                {repeatMode === 'one' && <span className="absolute text-[9px] font-bold -top-1.5 -right-2 bg-[#121216] rounded-full w-[14px] h-[14px] flex items-center justify-center">1</span>}
                            </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex w-full items-center gap-3 text-[11px] text-neutral-400 font-medium tracking-wide">
                            <span className="w-10 text-right tabular-nums">{formatTime(progress)}</span>
                            <div
                                className="flex-1 h-1 bg-neutral-700 hover:h-1.5 transition-all duration-200 rounded-full cursor-pointer relative group"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pos = (e.clientX - rect.left) / rect.width;
                                    const newTime = pos * duration;
                                    seekTo(newTime);
                                }}
                            >
                                <div
                                    className="absolute top-0 left-0 bottom-0 bg-brand-500 rounded-full"
                                    style={{ width: `${(progress / (duration || 1)) * 100}%` }}
                                >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow transform translate-x-1/2 transition-all duration-200 pointer-events-none"></div>
                                </div>
                            </div>
                            <span className="w-10 text-left tabular-nums">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Auxiliary Controls */}
                    <div className="hidden lg:flex w-[30%] min-w-[200px] max-w-[350px] justify-end gap-3 text-neutral-400 items-center">
                        <button onClick={toggleLyrics} className={`transition-colors p-1.5 outline-none ${isLyricsVisible ? 'text-brand-500' : 'hover:text-white'}`} title="Letras">
                            <Mic2 size={18} />
                        </button>
                        <button onClick={toggleQueue} className={`transition-colors p-1.5 outline-none ${isQueueVisible ? 'text-brand-500' : 'hover:text-white'}`} title="Cola de reproducción">
                            <ListMusic size={18} />
                        </button>
                        <button onClick={toggleDevices} className={`transition-colors p-1.5 outline-none ${isDevicesVisible ? 'text-brand-500' : 'hover:text-white'}`} title="Dispositivos">
                            <MonitorSpeaker size={18} />
                        </button>

                        <div className="flex items-center gap-2 w-28 mx-2">
                            <button onClick={handleToggleMute} aria-label={volume === 0 ? "Activar sonido" : "Silenciar"} className="hover:text-white transition-colors p-1 outline-none">
                                <VolumeIcon size={18} />
                            </button>
                            <div
                                className="flex-1 h-1 bg-neutral-700 rounded-full cursor-pointer relative group hover:h-1.5 transition-all duration-200"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const pos = (e.clientX - rect.left) / rect.width;
                                    handleVolumeChange(Math.round(pos * 100));
                                }}
                            >
                                <div
                                    className="absolute top-0 left-0 bottom-0 bg-white group-hover:bg-brand-500 transition-colors rounded-full"
                                    style={{ width: `${volume}%` }}
                                >
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow transform translate-x-1/2 transition-all duration-200 pointer-events-none"></div>
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setIsFullScreen(true)} aria-label="Expandir" className="hover:text-white transition-colors p-1.5 outline-none">
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
