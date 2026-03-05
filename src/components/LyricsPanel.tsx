"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { X, Mic2, AlertCircle } from "lucide-react";

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
        <div className={`fixed top-0 right-0 bottom-[60px] md:bottom-[90px] w-full md:w-[400px] bg-gradient-to-b from-[#1a1c23] to-[#121216] border-l border-white/5 z-40 flex flex-col shadow-2xl transition-transform duration-300 transform ${isLyricsVisible ? 'translate-x-0' : 'translate-x-full'}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-6 pb-2 shrink-0">
                <button
                    onClick={toggleLyrics}
                    className="p-2 text-neutral-400 hover:text-white transition-colors rounded-full hover:bg-white/5"
                >
                    <X size={20} />
                </button>
                <div className="flex bg-white/10 rounded-full px-3 py-1 cursor-default">
                    <span className="text-white text-xs font-bold flex items-center gap-1.5 uppercase tracking-widest"><Mic2 size={12} /> {lyrics ? "Sincronizadas" : "Buscando..."}</span>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 pb-20 pt-10 scrollbar-none flex flex-col relative" style={{ scrollBehavior: 'smooth' }}>
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
                    <div ref={containerRef} className="flex-1 flex flex-col justify-start w-full h-max max-w-sm mx-auto text-center font-bold text-2xl md:text-3xl leading-tight pb-64 pt-32">
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
