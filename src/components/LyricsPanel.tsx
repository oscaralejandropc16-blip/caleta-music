"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { X, Mic2, AlertCircle, ChevronDown } from "lucide-react";

export default function LyricsPanel() {
    const {
        currentTrack,
        isLyricsVisible,
        toggleLyrics,
        progress,
        seekTo
    } = usePlayer();

    const [lyrics, setLyrics] = useState<{ time: number; text: string }[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    // Auto-scroll ref
    const containerRef = useRef<HTMLDivElement>(null);

    // Swipe-down-to-close gesture
    const touchStartY = useRef(0);
    const touchCurrentY = useRef(0);
    const isDragging = useRef(false);
    const [dragOffset, setDragOffset] = useState(0);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Prevent swipe close if they are scrolling the lyrics
        if (containerRef.current && containerRef.current.scrollTop > 10) return;
        touchStartY.current = e.touches[0].clientY;
        touchCurrentY.current = e.touches[0].clientY;
        isDragging.current = true;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;
        touchCurrentY.current = e.touches[0].clientY;
        const diff = touchCurrentY.current - touchStartY.current;
        if (diff > 0) setDragOffset(diff);
    }, []);

    const handleTouchEnd = useCallback(() => {
        isDragging.current = false;
        const diff = touchCurrentY.current - touchStartY.current;
        if (diff > 100) {
            setDragOffset(window.innerHeight);
            setTimeout(() => {
                toggleLyrics();
                setDragOffset(0);
            }, 200);
        } else {
            setDragOffset(0);
        }
    }, [toggleLyrics]);

    useEffect(() => {
        if (!currentTrack || !isLyricsVisible) return;

        let isMounted = true;
        setLoading(true);
        setError(false);
        setLyrics(null);

        const fetchLyrics = async () => {
            try {
                // Limpiar titulo para mejor busqueda
                const cleanTitle = currentTrack.title.replace(/\(feat\..*?\)|\(ft\..*?\)/gi, '').trim();
                const artist = currentTrack.artist.split(',')[0].split(' feat.')[0].trim();

                const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(artist)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error("API error");

                const data = await res.json();
                if (!isMounted) return;

                if (Array.isArray(data) && data.length > 0) {
                    const bestMatch = data.find((d: any) => d.syncedLyrics) || data[0];
                    if (bestMatch?.syncedLyrics) {
                        // Parse LRC
                        const lines = bestMatch.syncedLyrics.split('\n');
                        const parsed = lines.map((line: string) => {
                            const match = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
                            if (match) {
                                const mins = parseInt(match[1]);
                                const secs = parseFloat(match[2]);
                                return {
                                    time: mins * 60 + secs,
                                    text: match[3].trim()
                                };
                            }
                            return null;
                        }).filter((l: any) => l && l.text);

                        setLyrics(parsed);
                    } else {
                        // Tiene plainLyrics pero no sync
                        if (bestMatch?.plainLyrics) {
                            const plain = bestMatch.plainLyrics.split('\n').map((l: string, i: number) => ({
                                time: i * 3, // mock timing
                                text: l
                            }));
                            setLyrics(plain);
                        } else {
                            setError(true);
                        }
                    }
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error("Lyrics fetch error:", err);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchLyrics();

        return () => { isMounted = false; };
    }, [currentTrack, isLyricsVisible]);

    // Find current active lyric index
    const activeIndex = lyrics
        ? lyrics.findIndex((l, i) => {
            const nextTime = lyrics[i + 1] ? lyrics[i + 1].time : Infinity;
            return progress >= l.time && progress < nextTime;
        })
        : -1;

    // Auto scroll to active lyric
    useEffect(() => {
        if (activeIndex >= 0 && containerRef.current) {
            const activeElement = containerRef.current.children[activeIndex] as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }
        }
    }, [activeIndex]);

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
                transition: isDragging.current ? 'none' : 'transform 0.3s ease-out',
                opacity: dragOffset > 0 ? Math.max(1 - dragOffset / 500, 0.5) : 1,
            }}
            className={`fixed inset-x-0 bottom-0 pt-[env(safe-area-inset-top)] md:pt-0 pb-[env(safe-area-inset-bottom)] top-0 md:top-0 md:left-auto md:w-[400px] bg-gradient-to-b from-[#1a1c23] to-[#121216] md:border-l border-white/5 z-[100] md:z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isLyricsVisible ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}`}>

            {/* Drag handle indicator (Mobile only) */}
            <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 md:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 pb-2 shrink-0">
                <button
                    onClick={toggleLyrics}
                    className="p-3 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5 active:scale-90"
                    aria-label="Cerrar letras"
                >
                    <ChevronDown size={28} className="md:hidden" />
                    <X size={24} className="hidden md:block" />
                </button>
                <div className="flex bg-white/10 rounded-full px-3 py-1 cursor-default">
                    <span className="text-white text-xs font-bold flex items-center gap-1.5 uppercase tracking-widest"><Mic2 size={12} /> {lyrics ? "Sincronizadas" : "Buscando..."}</span>
                </div>
                <div className="w-10" /> {/* Spacer */}
            </div>

            {/* List */}
            <div ref={containerRef} className="flex-1 overflow-y-auto px-6 pb-20 pt-10 scrollbar-none flex flex-col relative" style={{ scrollBehavior: 'smooth' }}>
                {!currentTrack ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                        <AlertCircle size={32} className="mb-4 opacity-50" />
                        <p>No hay música reproduciéndose</p>
                    </div>
                ) : loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 animate-pulse">
                        <p className="font-bold text-lg">Buscando letras...</p>
                    </div>
                ) : error || !lyrics ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                        <AlertCircle size={32} className="mb-4 opacity-50" />
                        <p className="font-bold">No se encontraron letras</p>
                        <p className="text-sm mt-2">Para: {currentTrack.title}</p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col justify-start w-full h-max max-w-sm mx-auto text-center font-bold text-2xl md:text-3xl leading-tight pb-64 pt-32">
                        {lyrics.map((line, idx) => {
                            const isActive = idx === activeIndex;
                            const isPast = idx < activeIndex;
                            return (
                                <p
                                    key={idx}
                                    onClick={() => seekTo(line.time)}
                                    className={`transition-all duration-500 ease-out py-3 md:py-4 ${isActive
                                        ? 'text-white scale-[1.05] origin-center text-shadow-glow translate-y-0 opacity-100 cursor-pointer'
                                        : isPast
                                            ? 'text-white/40 hover:text-white/80 cursor-pointer -translate-y-1'
                                            : 'text-neutral-600 hover:text-white/80 cursor-pointer translate-y-1'
                                        }`}
                                >
                                    {line.text}
                                </p>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
}
